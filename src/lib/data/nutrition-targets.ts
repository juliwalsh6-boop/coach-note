import type { NutritionTarget } from "@/types/app";
import type { Nutrients } from "@/lib/nutrition/nutrients";
import type { DB } from "./db";

/** 目標の履歴（新しい適用開始日から） */
export async function listTargets(db: DB, clientId: string): Promise<NutritionTarget[]> {
  const { data, error } = await db
    .from("nutrition_targets")
    .select("*")
    .eq("client_id", clientId)
    .order("effective_from", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

/** 指定日に有効な目標（その日以前で最も新しい適用開始日の行） */
export async function getTargetForDate(db: DB, clientId: string, date: string): Promise<NutritionTarget | null> {
  const { data, error } = await db
    .from("nutrition_targets")
    .select("*")
    .eq("client_id", clientId)
    .lte("effective_from", date)
    .order("effective_from", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export type TargetInput = {
  clientId: string;
  effectiveFrom: string;
  target: Nutrients;
  tolerance: Nutrients;
  note: string | null;
};

/**
 * 目標を保存する（トレーナーのみ）。同じ適用開始日の目標があれば更新し、無ければ新しい履歴として追加する。
 * 過去の目標は変更できない（DB で拒否される）。
 */
export async function saveTarget(db: DB, input: TargetInput): Promise<NutritionTarget> {
  const { data, error } = await db.rpc("save_nutrition_target", {
    p_client_id: input.clientId,
    p_effective_from: input.effectiveFrom,
    p_energy_kcal: Math.round(input.target.energyKcal),
    p_protein_g: input.target.proteinG,
    p_fat_g: input.target.fatG,
    p_carbs_g: input.target.carbsG,
    p_energy_tolerance_kcal: Math.round(input.tolerance.energyKcal),
    p_protein_tolerance_g: input.tolerance.proteinG,
    p_fat_tolerance_g: input.tolerance.fatG,
    p_carbs_tolerance_g: input.tolerance.carbsG,
    p_note: input.note,
  });
  if (error) throw error;
  return data;
}

/** まだ始まっていない（予定の）目標を削除する */
export async function deleteTarget(db: DB, targetId: string): Promise<void> {
  const { data, error } = await db.from("nutrition_targets").delete().eq("id", targetId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("invalid_target_date");
}
