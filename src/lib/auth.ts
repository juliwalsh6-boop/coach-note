import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { toProfile, type AppRole, type Profile } from "@/types/app";

/**
 * ログイン中のユーザーとプロフィールを取得する（同じリクエスト内では 1 回だけ実行）。
 * 未ログイン・プロフィール未作成なら null。
 */
export const getSession = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (error || !userId) {
    return null;
  }

  const { data: row } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  const profile = row ? toProfile(row) : null;

  return {
    supabase,
    userId,
    email: typeof data.claims.email === "string" ? data.claims.email : null,
    profile,
  };
});

/** ロールのホーム画面 */
export function homePathFor(role: AppRole): string {
  return role === "trainer" ? "/trainer" : "/client";
}

/**
 * 指定ロールでログインしていることを保証する。違えば適切な画面へ移動。
 * Server Component / Layout から呼ぶ。
 */
export async function requireRole(role: AppRole) {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  const { profile } = session;
  if (!profile) {
    redirect("/auth/error?reason=profile");
  }
  if (profile.role !== role) {
    redirect(homePathFor(profile.role));
  }
  return { ...session, profile: profile as Profile };
}
