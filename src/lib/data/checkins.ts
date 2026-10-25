import type { MetricValues } from "@/lib/condition";
import type { Checkin } from "@/types/app";
import type { DB } from "./db";

export type CheckinInput = MetricValues & {
  bodyWeightKg: number | null;
  note: string | null;
};

export async function getCheckin(db: DB, clientId: string, date: string): Promise<Checkin | null> {
  const { data, error } = await db
    .from("checkins")
    .select("*")
    .eq("client_id", clientId)
    .eq("checkin_date", date)
    .maybeSingle();
  if (error) throw error;
  return data;
}

/** 当日分を作成、すでにあれば上書き（1日1件） */
export async function saveCheckin(db: DB, clientId: string, date: string, input: CheckinInput): Promise<Checkin> {
  const { data, error } = await db
    .from("checkins")
    .upsert(
      {
        client_id: clientId,
        checkin_date: date,
        sleep: input.sleep,
        fatigue: input.fatigue,
        soreness: input.soreness,
        stress: input.stress,
        motivation: input.motivation,
        body_weight_kg: input.bodyWeightKg,
        note: input.note,
      },
      { onConflict: "client_id,checkin_date" },
    )
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listCheckins(db: DB, clientId: string, limit = 60): Promise<Checkin[]> {
  const { data, error } = await db
    .from("checkins")
    .select("*")
    .eq("client_id", clientId)
    .order("checkin_date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

/** 直近に記録した体重（入力欄のヒント用） */
export async function getLatestBodyWeight(db: DB, clientId: string): Promise<number | null> {
  const { data, error } = await db
    .from("checkins")
    .select("body_weight_kg")
    .eq("client_id", clientId)
    .not("body_weight_kg", "is", null)
    .order("checkin_date", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data?.body_weight_kg ?? null;
}
