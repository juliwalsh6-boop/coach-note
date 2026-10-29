import type { Json } from "@/types/database";
import type { MealItem, MealPhoto, MealWithDetails, NutritionDayRow } from "@/types/app";
import type { MealType } from "@/lib/nutrition/meal-types";
import type { MealUnit, Nutrients } from "@/lib/nutrition/nutrients";
import type { DB } from "./db";

/** 指定日の食事（食べたもの・写真・コメントつき）。RLS により本人と担当トレーナーだけが取得できる */
export async function getMealDay(db: DB, clientId: string, date: string): Promise<MealWithDetails[]> {
  const { data: meals, error } = await db
    .from("meals")
    .select("*")
    .eq("client_id", clientId)
    .eq("eaten_on", date)
    .order("created_at", { ascending: true });
  if (error) throw error;
  if (!meals || meals.length === 0) return [];

  const ids = meals.map((m) => m.id);
  const [items, photos, comments] = await Promise.all([
    db.from("meal_items").select("*").in("meal_id", ids).order("position", { ascending: true }),
    db.from("meal_photos").select("*").in("meal_id", ids).order("created_at", { ascending: true }),
    db.from("meal_comments").select("*").in("meal_id", ids).order("created_at", { ascending: true }),
  ]);
  if (items.error) throw items.error;
  if (photos.error) throw photos.error;
  if (comments.error) throw comments.error;

  return meals.map((meal) => ({
    ...meal,
    items: (items.data ?? []).filter((i) => i.meal_id === meal.id),
    photos: (photos.data ?? []).filter((p) => p.meal_id === meal.id),
    comments: (comments.data ?? []).filter((c) => c.meal_id === meal.id),
  }));
}

/** 日ごとの目標と摂取量（保存された記録から DB で集計） */
export async function getNutritionDays(db: DB, clientId: string, from: string, to: string): Promise<NutritionDayRow[]> {
  const { data, error } = await db.rpc("get_nutrition_days", { p_client_id: clientId, p_from: from, p_to: to });
  if (error) throw error;
  return data ?? [];
}

/** 記録する 1 品（add_meal_items に渡す形） */
export type MealItemInput = {
  name: string;
  brand?: string | null;
  origin: "manual" | "food" | "ai_photo" | "reuse";
  foodId?: string | null;
  fromPhoto?: boolean;
  unit: MealUnit;
  refAmount: number;
  ref: Nutrients;
  amount: number;
  servingLabel?: string | null;
  servingWeightG?: number | null;
  aiEstimate?: Record<string, Json | undefined> | null;
};

export type MealPhotoInput = {
  storagePath: string;
  contentHash: string | null;
  width: number | null;
  height: number | null;
  sizeBytes: number | null;
};

function toItemJson(item: MealItemInput): Json {
  return {
    name: item.name,
    brand: item.brand ?? null,
    origin: item.origin,
    food_id: item.foodId ?? null,
    from_photo: item.fromPhoto ?? false,
    unit: item.unit,
    ref_amount: item.refAmount,
    ref_energy_kcal: item.ref.energyKcal,
    ref_protein_g: item.ref.proteinG,
    ref_fat_g: item.ref.fatG,
    ref_carbs_g: item.ref.carbsG,
    amount: item.amount,
    serving_label: item.servingLabel ?? null,
    serving_weight_g: item.servingWeightG ?? null,
    ai_estimate: item.aiEstimate ?? null,
  };
}

/**
 * 食べたものを追加する（食事が無ければ作る。写真の登録も同じトランザクション）。
 * requestId を同じにして再送しても二重に記録されない。
 */
export async function addMealItems(
  db: DB,
  input: {
    date: string;
    mealType: MealType;
    items: MealItemInput[];
    photo?: MealPhotoInput | null;
    requestId?: string | null;
  },
): Promise<string> {
  const { data, error } = await db.rpc("add_meal_items", {
    p_date: input.date,
    p_meal_type: input.mealType,
    p_items: input.items.map(toItemJson),
    p_photo: input.photo
      ? {
          storage_path: input.photo.storagePath,
          content_hash: input.photo.contentHash,
          width: input.photo.width,
          height: input.photo.height,
          size_bytes: input.photo.sizeBytes,
        }
      : null,
    p_request_id: input.requestId ?? null,
  });
  if (error) throw error;
  return data;
}

export type MealItemPatch = {
  name: string;
  unit: MealUnit;
  refAmount: number;
  ref: Nutrients;
  amount: number;
  servingLabel: string | null;
  servingWeightG: number | null;
};

/** 1 品の内容を変更する（栄養値は DB が再計算する） */
export async function updateMealItem(db: DB, itemId: string, patch: MealItemPatch): Promise<MealItem> {
  const { data, error } = await db
    .from("meal_items")
    .update({
      name: patch.name,
      unit: patch.unit,
      ref_amount: patch.refAmount,
      ref_energy_kcal: patch.ref.energyKcal,
      ref_protein_g: patch.ref.proteinG,
      ref_fat_g: patch.ref.fatG,
      ref_carbs_g: patch.ref.carbsG,
      amount: patch.amount,
      serving_label: patch.servingLabel,
      serving_weight_g: patch.servingWeightG,
    })
    .eq("id", itemId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMealItem(db: DB, itemId: string): Promise<void> {
  const { data, error } = await db.from("meal_items").delete().eq("id", itemId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("meal_not_found");
}

/** 過去の食事を、指定した日・食事区分にコピーする */
export async function copyMeal(
  db: DB,
  input: { sourceMealId: string; date: string; mealType: MealType; requestId: string },
): Promise<string> {
  const { data, error } = await db.rpc("copy_meal", {
    p_source_meal_id: input.sourceMealId,
    p_date: input.date,
    p_meal_type: input.mealType,
    p_request_id: input.requestId,
  });
  if (error) throw error;
  return data;
}

/**
 * 最近記録した食べもの（すばやく追加し直すため）。同じ名前・単位・量のものは 1 つにまとめる。
 */
export async function listRecentItems(db: DB, clientId: string, limit = 30): Promise<MealItem[]> {
  const { data, error } = await db
    .from("meal_items")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  const seen = new Set<string>();
  const result: MealItem[] = [];
  for (const item of data ?? []) {
    const key = `${item.name}|${item.brand ?? ""}|${item.unit}|${item.amount}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= limit) break;
  }
  return result;
}

/** 同じ写真（元画像の SHA-256 が同じ）がすでに記録されているか */
export async function findPhotoByHash(
  db: DB,
  clientId: string,
  contentHash: string,
): Promise<{ photo: MealPhoto; date: string; mealType: string } | null> {
  const { data: photo, error } = await db
    .from("meal_photos")
    .select("*")
    .eq("client_id", clientId)
    .eq("content_hash", contentHash)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!photo) return null;
  const { data: meal, error: mealError } = await db
    .from("meals")
    .select("eaten_on, meal_type")
    .eq("id", photo.meal_id)
    .maybeSingle();
  if (mealError) throw mealError;
  if (!meal) return null;
  return { photo, date: meal.eaten_on, mealType: meal.meal_type };
}
