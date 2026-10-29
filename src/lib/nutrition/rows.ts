/**
 * DB の行（snake_case）と、計算用の型（Nutrients）の相互変換。
 */
import type { MealItem, MealWithDetails, NutritionDayRow, NutritionOverviewRow, NutritionTarget } from "@/types/app";
import { isMealType, type MealType } from "./meal-types";
import { sumNutrients, ZERO_NUTRIENTS, type MealUnit, type NutrientBasis, type Nutrients } from "./nutrients";

/** 保存された 1 品の栄養値（DB が計算した値） */
export function itemNutrients(item: Pick<MealItem, "energy_kcal" | "protein_g" | "fat_g" | "carbs_g">): Nutrients {
  return {
    energyKcal: Number(item.energy_kcal),
    proteinG: Number(item.protein_g),
    fatG: Number(item.fat_g),
    carbsG: Number(item.carbs_g),
  };
}

/** 保存された 1 品の換算の基準（量を変えるときに使う） */
export function itemBasis(item: Pick<MealItem, "unit" | "ref_amount" | "ref_energy_kcal" | "ref_protein_g" | "ref_fat_g" | "ref_carbs_g">): NutrientBasis {
  return {
    unit: item.unit === "g" ? "g" : "serving",
    refAmount: Number(item.ref_amount),
    ref: {
      energyKcal: Number(item.ref_energy_kcal),
      proteinG: Number(item.ref_protein_g),
      fatG: Number(item.ref_fat_g),
      carbsG: Number(item.ref_carbs_g),
    },
  };
}

export function itemUnit(item: Pick<MealItem, "unit">): MealUnit {
  return item.unit === "g" ? "g" : "serving";
}

export function mealTotals(meal: Pick<MealWithDetails, "items">): Nutrients {
  return sumNutrients(meal.items.map(itemNutrients));
}

export function dayTotals(meals: readonly Pick<MealWithDetails, "items">[]): Nutrients {
  return sumNutrients(meals.flatMap((m) => m.items.map(itemNutrients)));
}

/** 食事区分ごとに並べる（記録の無い区分は null） */
export function mealsByType(meals: readonly MealWithDetails[]): Record<MealType, MealWithDetails | null> {
  const result: Record<MealType, MealWithDetails | null> = { breakfast: null, lunch: null, dinner: null, snack: null };
  for (const meal of meals) {
    if (isMealType(meal.meal_type)) result[meal.meal_type] = meal;
  }
  return result;
}

/** 食べたもの（写真だけの食事は含めない）を記録した食事区分 */
export function loggedMealTypes(meals: readonly MealWithDetails[]): Set<MealType> {
  return new Set(
    meals.filter((m) => m.items.length > 0 && isMealType(m.meal_type)).map((m) => m.meal_type as MealType),
  );
}


export type TargetValues = { target: Nutrients; tolerance: Nutrients };

/** 目標の行 → 目標と許容範囲 */
export function targetValues(row: NutritionTarget): TargetValues {
  return {
    target: {
      energyKcal: Number(row.energy_kcal),
      proteinG: Number(row.protein_g),
      fatG: Number(row.fat_g),
      carbsG: Number(row.carbs_g),
    },
    tolerance: {
      energyKcal: Number(row.energy_tolerance_kcal),
      proteinG: Number(row.protein_tolerance_g),
      fatG: Number(row.fat_tolerance_g),
      carbsG: Number(row.carbs_tolerance_g),
    },
  };
}

type TargetColumns = Pick<
  NutritionDayRow,
  | "target_energy_kcal"
  | "target_protein_g"
  | "target_fat_g"
  | "target_carbs_g"
  | "energy_tolerance_kcal"
  | "protein_tolerance_g"
  | "fat_tolerance_g"
  | "carbs_tolerance_g"
>;

/** 集計関数の行 → その日の目標（未設定なら null） */
export function rowTarget(row: TargetColumns): TargetValues | null {
  if (
    row.target_energy_kcal == null ||
    row.target_protein_g == null ||
    row.target_fat_g == null ||
    row.target_carbs_g == null
  ) {
    return null;
  }
  return {
    target: {
      energyKcal: Number(row.target_energy_kcal),
      proteinG: Number(row.target_protein_g),
      fatG: Number(row.target_fat_g),
      carbsG: Number(row.target_carbs_g),
    },
    tolerance: {
      energyKcal: Number(row.energy_tolerance_kcal ?? 0),
      proteinG: Number(row.protein_tolerance_g ?? 0),
      fatG: Number(row.fat_tolerance_g ?? 0),
      carbsG: Number(row.carbs_tolerance_g ?? 0),
    },
  };
}

/** 集計関数の行 → その日の摂取量 */
export function rowIntake(row: Pick<NutritionDayRow | NutritionOverviewRow, "energy_kcal" | "protein_g" | "fat_g" | "carbs_g">): Nutrients {
  return {
    energyKcal: Number(row.energy_kcal ?? 0),
    proteinG: Number(row.protein_g ?? 0),
    fatG: Number(row.fat_g ?? 0),
    carbsG: Number(row.carbs_g ?? 0),
  };
}

export const EMPTY_INTAKE: Nutrients = ZERO_NUTRIENTS;
