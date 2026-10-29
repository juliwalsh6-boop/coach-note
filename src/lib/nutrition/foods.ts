import { computeItemNutrients, itemWeightG, type MealUnit, type NutrientBasis, type Nutrients } from "./nutrients";

export type MealRole = "main" | "staple" | "protein" | "side" | "soup" | "drink" | "snack";
export type FoodChannel = "convenience" | "restaurant" | "grocery";
export type FoodGenre = "gyudon" | "teishoku" | "sushi" | "family" | "fastfood" | "other";
export type VerificationStatus = "verified" | "unverified" | "sample";
export type FoodAvailability = "active" | "discontinued" | "needs_review";
export type FoodSourceType = "official_web" | "package_label" | "standard_table" | "trainer" | "sample";

export const FOOD_GENRE_LABELS: Record<FoodGenre, string> = {
  gyudon: "牛丼",
  teishoku: "定食",
  sushi: "寿司",
  family: "ファミレス",
  fastfood: "ファストフード",
  other: "その他",
};

export const VERIFICATION_LABELS: Record<VerificationStatus, string> = {
  verified: "確認済み",
  unverified: "未確認",
  sample: "サンプル",
};

export const SOURCE_TYPE_LABELS: Record<FoodSourceType, string> = {
  official_web: "公式サイト",
  package_label: "パッケージ表示",
  standard_table: "日本食品標準成分表",
  trainer: "トレーナー入力",
  sample: "サンプル",
};

/** foods テーブルの行のうち、換算に必要な項目 */
export type FoodNutritionFields = {
  nutrient_basis: string;
  serving_weight_g: number | null;
  serving_label: string;
  energy_kcal: number;
  protein_g: number;
  fat_g: number;
  carbs_g: number;
};

/**
 * 商品データを、記録用の「換算の基準」と「1 食分の量」に変換する。
 *   1食分あたりの値 → 単位「1食」、基準量 1、1 食分 = 1
 *   100gあたりの値 → 単位 g、基準量 100、1 食分 = 1食分の重量（g）
 */
export function foodBasis(food: FoodNutritionFields): { basis: NutrientBasis; servingAmount: number } | null {
  const ref: Nutrients = {
    energyKcal: food.energy_kcal,
    proteinG: food.protein_g,
    fatG: food.fat_g,
    carbsG: food.carbs_g,
  };
  if (food.nutrient_basis === "serving") {
    return { basis: { unit: "serving", refAmount: 1, ref }, servingAmount: 1 };
  }
  if (food.nutrient_basis === "per_100g" && food.serving_weight_g != null && food.serving_weight_g > 0) {
    return { basis: { unit: "g", refAmount: 100, ref }, servingAmount: food.serving_weight_g };
  }
  return null;
}

/** 商品を quantity 食分食べたときの栄養値（記録したときに DB が計算する値と同じ） */
export function foodNutrients(food: FoodNutritionFields, quantity = 1): Nutrients | null {
  const converted = foodBasis(food);
  if (!converted) return null;
  return computeItemNutrients(converted.basis, converted.servingAmount * quantity);
}

/** 記録するときの量の表示（2個 / 180g など） */
export function formatAmount(unit: MealUnit, amount: number, servingLabel: string | null): string {
  if (unit === "g") return `${trimNumber(amount)}g`;
  const label = servingLabel?.trim() || "1食";
  // 「1個」「並盛 1杯」のような表記は、数量に合わせて先頭の 1 を置き換える
  const match = /^(.*?)1(\D*)$/.exec(label);
  if (match) {
    return `${match[1] ?? ""}${trimNumber(amount)}${match[2] ?? ""}`;
  }
  return amount === 1 ? label : `${label} × ${trimNumber(amount)}`;
}

export function trimNumber(value: number): string {
  return String(Math.round(value * 100) / 100);
}

/** 記録用の重量（不明なら null） */
export function foodWeightG(food: FoodNutritionFields, quantity = 1): number | null {
  const converted = foodBasis(food);
  if (!converted) return null;
  return itemWeightG(converted.basis.unit, converted.servingAmount * quantity, food.serving_weight_g);
}
