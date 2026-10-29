import type { ClientInvite, DashboardRow, NutritionOverviewRow } from "@/types/app";
import type { DB } from "./db";

/** トレーナーのホーム: 担当クライアント + 指定日のチェックイン + 直近のトレーニング */
export async function getDashboard(db: DB, date: string): Promise<DashboardRow[]> {
  const { data, error } = await db.rpc("get_trainer_dashboard", { p_date: date });
  if (error) throw error;
  return data ?? [];
}

/** トレーナーの「食事」一覧: 担当クライアントごとの目標・指定日の摂取量・最終記録・未読の返信・体重 */
export async function getNutritionOverview(db: DB, date: string): Promise<NutritionOverviewRow[]> {
  const { data, error } = await db.rpc("get_trainer_nutrition_overview", { p_date: date });
  if (error) throw error;
  return data ?? [];
}

export async function listInvites(db: DB): Promise<ClientInvite[]> {
  const { data, error } = await db
    .from("client_invites")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data ?? [];
}

export async function createInvite(db: DB, label: string | null): Promise<ClientInvite> {
  const { data, error } = await db.rpc("create_client_invite", { p_label: label });
  if (error) throw error;
  return data;
}

export async function deleteInvite(db: DB, inviteId: string): Promise<void> {
  const { error } = await db.from("client_invites").delete().eq("id", inviteId);
  if (error) throw error;
}

export type InviteStatus = "valid" | "used" | "expired";

export async function getInviteInfo(
  db: DB,
  code: string,
): Promise<{ trainerName: string; status: InviteStatus } | null> {
  const { data, error } = await db.rpc("get_invite_info", { p_code: code });
  if (error) throw error;
  const row = data?.[0];
  if (!row) return null;
  const status: InviteStatus = row.status === "used" || row.status === "expired" ? row.status : "valid";
  return { trainerName: row.trainer_name, status };
}

/**
 * クライアントを削除する（担当から外す）。
 * 担当関係を archived にするだけで、クライアントのアカウントと記録は残る。
 * 新しい招待リンクで再びつなぐと、以前の記録・メニューもまた見えるようになる。
 */
export async function removeClient(db: DB, clientId: string): Promise<void> {
  const { error } = await db.rpc("remove_client", { p_client_id: clientId });
  if (error) throw error;
}

export async function acceptInvite(db: DB, code: string): Promise<string> {
  const { data, error } = await db.rpc("accept_invite", { p_code: code });
  if (error) throw error;
  return data;
}

export function inviteStatusOf(invite: Pick<ClientInvite, "used_at" | "expires_at">, now: Date = new Date()): InviteStatus {
  if (invite.used_at) return "used";
  if (new Date(invite.expires_at).getTime() <= now.getTime()) return "expired";
  return "valid";
}
