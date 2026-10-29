/**
 * 栄養値の計算（カロリー・PFC）。
 *
 * 換算方法はアプリ全体で 1 つだけ:
 *   1 品の栄養値 = 基準量あたりの値 × 食べた量 ÷ 基準量
 *   - カロリーは整数、PFC は小数第 1 位に丸める（DB のトリガー private.compute_meal_item と同じ）
 *   - 食事・1 日の合計は「丸めた 1 品ごとの値」の合計（足し算で誤差が出ないよう 0.1 単位の整数で足す）
 * 保存される値は DB が計算するので、ここでの計算は入力中のプレビューと、提案の組み合わせ計算に使う。
 */

export type Nutrients = {
  energyKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
};

export const NUTRIENT_KEYS = ["energyKcal", "proteinG", "fatG", "carbsG"] as const;
export type NutrientKey = (typeof NUTRIENT_KEYS)[number];

export const ZERO_NUTRIENTS: Nutrients = { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };

/** 各栄養素の小数の桁数（カロリーは整数、PFC は小数第 1 位） */
export const NUTRIENT_DIGITS: Record<NutrientKey, number> = {
  energyKcal: 0,
  proteinG: 1,
  fatG: 1,
  carbsG: 1,
};

export type MealUnit = "g" | "serving";

/** 換算の基準: 「refAmount（unit）あたり ref の栄養値」 */
export type NutrientBasis = {
  unit: MealUnit;
  refAmount: number;
  ref: Nutrients;
};

/**
 * PostgreSQL の round() と同じく、0.5 は 0 から遠い方へ丸める。
 * 浮動小数点の誤差（1.15 × 10 = 11.499999…）は、有効数字 12 桁で整えてから丸める。
 */
export function roundHalfAway(value: number, digits: number): number {
  if (!Number.isFinite(value)) return value;
  const factor = 10 ** digits;
  const scaled = Number((Math.abs(value) * factor).toPrecision(12));
  const rounded = Math.round(scaled) / factor;
  return value < 0 ? -rounded : rounded;
}

export function roundNutrients(values: Nutrients): Nutrients {
  return {
    energyKcal: roundHalfAway(values.energyKcal, NUTRIENT_DIGITS.energyKcal),
    proteinG: roundHalfAway(values.proteinG, NUTRIENT_DIGITS.proteinG),
    fatG: roundHalfAway(values.fatG, NUTRIENT_DIGITS.fatG),
    carbsG: roundHalfAway(values.carbsG, NUTRIENT_DIGITS.carbsG),
  };
}

/** 1 品の栄養値（DB と同じ計算: 掛けてから割り、1 品ごとに丸める） */
export function computeItemNutrients(basis: NutrientBasis, amount: number): Nutrients {
  if (!(basis.refAmount > 0) || !(amount > 0)) return { ...ZERO_NUTRIENTS };
  return roundNutrients({
    energyKcal: (basis.ref.energyKcal * amount) / basis.refAmount,
    proteinG: (basis.ref.proteinG * amount) / basis.refAmount,
    fatG: (basis.ref.fatG * amount) / basis.refAmount,
    carbsG: (basis.ref.carbsG * amount) / basis.refAmount,
  });
}

/** 食べた重量（g）。単位が「1食」で 1 食分の重量が不明なら null */
export function itemWeightG(unit: MealUnit, amount: number, servingWeightG: number | null): number | null {
  if (unit === "g") return roundHalfAway(amount, 1);
  return servingWeightG == null ? null : roundHalfAway(amount * servingWeightG, 1);
}

/**
 * 合計（丸め済みの値を足す）。0.1 単位の整数にしてから足すので 0.1 + 0.2 のような誤差が出ない。
 */
export function sumNutrients(list: readonly Nutrients[]): Nutrients {
  let energy = 0;
  let protein = 0;
  let fat = 0;
  let carbs = 0;
  for (const n of list) {
    energy += Math.round(n.energyKcal);
    protein += Math.round(n.proteinG * 10);
    fat += Math.round(n.fatG * 10);
    carbs += Math.round(n.carbsG * 10);
  }
  return { energyKcal: energy, proteinG: protein / 10, fatG: fat / 10, carbsG: carbs / 10 };
}

export function addNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return sumNutrients([a, b]);
}

/** a − b（0.1 単位で正確に） */
export function subtractNutrients(a: Nutrients, b: Nutrients): Nutrients {
  return {
    energyKcal: Math.round(a.energyKcal) - Math.round(b.energyKcal),
    proteinG: (Math.round(a.proteinG * 10) - Math.round(b.proteinG * 10)) / 10,
    fatG: (Math.round(a.fatG * 10) - Math.round(b.fatG * 10)) / 10,
    carbsG: (Math.round(a.carbsG * 10) - Math.round(b.carbsG * 10)) / 10,
  };
}

/**
 * 残り = 目標 − 摂取量。
 * マイナスは「超過」。0 に置き換えず、そのまま返す（画面で「◯g 超過」と表示するため）。
 */
export function remainingNutrients(target: Nutrients, intake: Nutrients): Nutrients {
  return subtractNutrients(target, intake);
}

/** PFC から計算したカロリー（たんぱく質・炭水化物 4kcal/g、脂質 9kcal/g） */
export function energyFromMacros(values: Pick<Nutrients, "proteinG" | "fatG" | "carbsG">): number {
  return values.proteinG * 4 + values.fatG * 9 + values.carbsG * 4;
}

export type NutrientStatus = "within" | "under" | "over";

/** 目標 ± 許容範囲 との比較 */
export function nutrientStatus(intake: number, target: number, tolerance: number): NutrientStatus {
  const diff = intake - target;
  // 0.1 単位で比較（浮動小数点の誤差で境界がずれないように）
  const diffTenths = Math.round(diff * 10);
  const tolTenths = Math.round(Math.max(0, tolerance) * 10);
  if (diffTenths > tolTenths) return "over";
  if (diffTenths < -tolTenths) return "under";
  return "within";
}

export type NutrientStatuses = Record<NutrientKey, NutrientStatus>;

export function nutrientStatuses(intake: Nutrients, target: Nutrients, tolerance: Nutrients): NutrientStatuses {
  return {
    energyKcal: nutrientStatus(intake.energyKcal, target.energyKcal, tolerance.energyKcal),
    proteinG: nutrientStatus(intake.proteinG, target.proteinG, tolerance.proteinG),
    fatG: nutrientStatus(intake.fatG, target.fatG, tolerance.fatG),
    carbsG: nutrientStatus(intake.carbsG, target.carbsG, tolerance.carbsG),
  };
}

/**
 * 1 日の達成状況
 * - achieved: すべて目標範囲内
 * - over:     どれかが目標＋許容範囲を超えた
 * - under:    どれかが目標−許容範囲に届かない（超過は無い）
 * - no_record: 記録なし / no_target: 目標が未設定
 */
export type DayStatus = "achieved" | "over" | "under" | "no_record" | "no_target";

export function dayStatus(
  intake: Nutrients,
  target: Nutrients | null,
  tolerance: Nutrients | null,
  itemCount: number,
): DayStatus {
  if (itemCount <= 0) return "no_record";
  if (!target || !tolerance) return "no_target";
  const statuses = Object.values(nutrientStatuses(intake, target, tolerance));
  if (statuses.includes("over")) return "over";
  if (statuses.includes("under")) return "under";
  return "achieved";
}

/** 目標に対する割合（0〜）。目標 0 のときは摂取があれば 1 以上として扱う */
export function progressRatio(intake: number, target: number): number {
  if (target <= 0) return intake > 0 ? 1.5 : 0;
  return Math.max(0, intake / target);
}

/** 目標の初期の許容範囲（目標の ±10%。kcal は 10 単位、g は 1 単位に丸める） */
export function defaultTolerance(target: Nutrients): Nutrients {
  return {
    energyKcal: Math.max(50, Math.round((target.energyKcal * 0.1) / 10) * 10),
    proteinG: Math.max(3, Math.round(target.proteinG * 0.1)),
    fatG: Math.max(3, Math.round(target.fatG * 0.1)),
    carbsG: Math.max(5, Math.round(target.carbsG * 0.1)),
  };
}
