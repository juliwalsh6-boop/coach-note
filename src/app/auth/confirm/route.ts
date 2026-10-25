import type { EmailOtpType } from "@supabase/supabase-js";
import { redirect } from "next/navigation";
import type { NextRequest } from "next/server";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * メール内のリンク（登録確認・パスワード再設定）から戻ってきたときの処理。
 * - token_hash 形式（メールテンプレートをカスタマイズした場合）
 * - code 形式（Supabase の標準テンプレート）
 * のどちらにも対応する。
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const code = searchParams.get("code");
  const next = safeNextPath(searchParams.get("next")) ?? "/";

  const supabase = await createClient();

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) {
      redirect(type === "recovery" ? "/auth/update-password" : next);
    }
    redirect("/auth/error?reason=link");
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      redirect(next);
    }
    redirect("/auth/error?reason=link");
  }

  redirect("/auth/error?reason=link");
}
