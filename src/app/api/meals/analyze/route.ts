import { NextResponse } from "next/server";
import { analyzeMealImage, isMealAnalysisConfigured, MealAnalysisError } from "@/lib/ai/meal-analysis";
import { sniffImageType } from "@/lib/images/sniff";
import { ANALYZE_MAX_BYTES, type AnalyzeResponse } from "@/lib/nutrition/analysis-api";
import { createClient } from "@/lib/supabase/server";

/**
 * 食事写真の AI 解析（POST multipart/form-data: image）
 *   1. ログインとロール（クライアント）を確認
 *   2. 画像の形式（中身）とサイズを確認
 *   3. 回数制限を確認・記録（DB の関数）
 *   4. Claude API で解析し、結果を検証して返す
 * 解析結果は保存しない（クライアントが内容を確認・修正して「記録する」を押したときに保存する）。
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ERROR_STATUS: Record<string, number> = {
  not_authenticated: 401,
  client_only: 403,
  invalid_image: 415,
  image_too_large: 413,
  analysis_quota_exceeded: 429,
  ai_not_configured: 503,
  ai_busy: 503,
  ai_timeout: 504,
  ai_failed: 502,
  ai_invalid_response: 502,
  ai_refused: 422,
};

function fail(error: string): NextResponse<AnalyzeResponse> {
  return NextResponse.json<AnalyzeResponse>(
    { ok: false, error },
    { status: ERROR_STATUS[error] ?? 500, headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: Request): Promise<NextResponse<AnalyzeResponse>> {
  // 1. ログインとロール
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || !userId) return fail("not_authenticated");

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return fail("ai_failed");
  if (profile?.role !== "client") return fail("client_only");

  if (!isMealAnalysisConfigured()) return fail("ai_not_configured");

  // 2. 画像の確認（大きすぎるリクエストは読み込む前に断る）
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (declaredLength > ANALYZE_MAX_BYTES + 64 * 1024) return fail("image_too_large");

  let file: FormDataEntryValue | null;
  try {
    file = (await request.formData()).get("image");
  } catch {
    return fail("invalid_image");
  }
  if (!(file instanceof Blob) || file.size === 0) return fail("invalid_image");
  if (file.size > ANALYZE_MAX_BYTES) return fail("image_too_large");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const mediaType = sniffImageType(bytes);
  if (!mediaType) return fail("invalid_image");

  // 3. 回数制限（AI を呼ぶ直前に記録する）
  const { data: remaining, error: quotaError } = await supabase.rpc("consume_meal_analysis_quota");
  if (quotaError) {
    return fail(quotaError.message === "analysis_quota_exceeded" ? "analysis_quota_exceeded" : "ai_failed");
  }

  // 4. 解析
  try {
    const { analysis, model } = await analyzeMealImage(
      { base64: Buffer.from(bytes).toString("base64"), mediaType },
      { signal: request.signal },
    );
    return NextResponse.json<AnalyzeResponse>(
      { ok: true, analysis, model, analyzedAt: new Date().toISOString(), remaining: remaining ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    if (error instanceof MealAnalysisError) {
      if (error.code !== "ai_timeout") console.error("meal analysis failed", error.message);
      return fail(error.code);
    }
    console.error("meal analysis failed", error);
    return fail("ai_failed");
  }
}
