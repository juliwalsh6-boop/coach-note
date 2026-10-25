import { toProfile, type Profile } from "@/types/app";
import type { DB } from "./db";

export async function getProfile(db: DB, userId: string): Promise<Profile | null> {
  const { data, error } = await db.from("profiles").select("*").eq("id", userId).maybeSingle();
  if (error) throw error;
  return data ? toProfile(data) : null;
}

export async function updateDisplayName(db: DB, userId: string, displayName: string): Promise<void> {
  const { error } = await db.from("profiles").update({ display_name: displayName }).eq("id", userId);
  if (error) throw error;
}

/**
 * クライアントの担当トレーナー一覧。
 * RLS により、クライアントに見えるトレーナーは自分の担当だけ。
 */
export async function listMyTrainers(db: DB): Promise<Profile[]> {
  const { data, error } = await db.from("profiles").select("*").eq("role", "trainer").order("display_name");
  if (error) throw error;
  return (data ?? []).map(toProfile).filter((p): p is Profile => p !== null);
}

/**
 * トレーナーが担当クライアントのプロフィールを取得する。
 * 担当外のクライアントは RLS で見えないので null になる。
 */
export async function getClientForTrainer(db: DB, clientId: string): Promise<Profile | null> {
  const profile = await getProfile(db, clientId);
  return profile && profile.role === "client" ? profile : null;
}
