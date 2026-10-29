export const MEAL_TYPES = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
  breakfast: "朝食",
  lunch: "昼食",
  dinner: "夕食",
  snack: "間食",
};

export function isMealType(value: unknown): value is MealType {
  return typeof value === "string" && (MEAL_TYPES as readonly string[]).includes(value);
}

/**
 * 時刻から、いま記録しそうな食事区分を選ぶ（日本時間）
 *   4〜10時 朝食 / 10〜15時 昼食 / 15〜17時 間食 / それ以外 夕食
 */
export function defaultMealType(hour: number): MealType {
  if (hour >= 4 && hour < 10) return "breakfast";
  if (hour >= 10 && hour < 15) return "lunch";
  if (hour >= 15 && hour < 17) return "snack";
  return "dinner";
}

/** 1 日の中での食事の配分の目安（提案で「この食事で使う量」を決めるため） */
export const MEAL_WEIGHTS: Record<MealType, number> = {
  breakfast: 0.25,
  lunch: 0.35,
  dinner: 0.35,
  snack: 0.05,
};

const MEAL_ORDER: Record<MealType, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };

/**
 * この食事で、1 日の残りのうちどれだけを使うか（0〜1）。
 * この食事と「まだ記録していない、これより後の食事」の配分の比で決める。
 *   例: 朝食を記録済みで昼食 → 昼 0.35 /（昼 0.35 + 夕 0.35 + 間食 0.05）= 約 0.47
 *       朝・昼を記録済みで夕食 → 0.35 /（0.35 + 0.05）= 約 0.88
 * 間食は時間が決まっていないので、記録していなければ常に「後の食事」として数える。
 * 間食の提案では、まだ記録していない食事をすべて「後の食事」として数える（間食で夕食の分まで使わないように）。
 */
export function mealShare(mealType: MealType, loggedMealTypes: ReadonlySet<MealType>): number {
  let total = MEAL_WEIGHTS[mealType];
  for (const other of MEAL_TYPES) {
    if (other === mealType || loggedMealTypes.has(other)) continue;
    const later = mealType === "snack" || other === "snack" || MEAL_ORDER[other] > MEAL_ORDER[mealType];
    if (later) total += MEAL_WEIGHTS[other];
  }
  return Math.min(1, MEAL_WEIGHTS[mealType] / total);
}
