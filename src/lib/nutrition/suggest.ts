/**
 * 残りの PFC に合わせた「組み合わせ」の提案（コンビニ・外食）。
 *
 * 考え方
 *  1. この食事で使う量（目安）= 1 日の残り × この食事の配分（mealShare）。すでに超えている栄養素は 0。
 *  2. 同じお店の商品から 1〜数品の組み合わせを作る（主食・主菜のどれかを必ず含む、飲み物は 1 本まで、
 *     お菓子は食事の組み合わせに入れず軽食のときだけ など）。
 *  3. 目安との差を、トレーナーが決めた許容範囲で割って点数にする（小さいほど良い）。
 *       - たんぱく質は足りない方を、脂質は多すぎる方を重く見る（たんぱく質が多いだけの候補にはならない）
 *       - 食べたあとに 1 日の目標＋許容範囲を超えるものは大きく減点し「一部超過」と表示する
 *       - 未確認の商品データ、品数が多い組み合わせは少し減点する
 *  4. 似た組み合わせばかりにならないよう間引いて、上位を返す。
 * 条件に合うものが無くても空にはせず、最も近い候補を、超過・不足量つきで返す。
 */
import { foodBasis, type FoodChannel, type FoodNutritionFields, type MealRole, type VerificationStatus } from "./foods";
import {
  NUTRIENT_KEYS,
  computeItemNutrients,
  subtractNutrients,
  sumNutrients,
  type NutrientBasis,
  type NutrientKey,
  type Nutrients,
} from "./nutrients";

/** 提案に使う商品 */
export type SuggestFood = FoodNutritionFields & {
  id: string;
  name: string;
  brand_key: string | null;
  brand: string | null;
  channel: FoodChannel;
  genre: string | null;
  meal_role: MealRole;
  verification_status: VerificationStatus;
  price_yen: number | null;
};

export type SuggestionItem = {
  food: SuggestFood;
  quantity: number;
  basis: NutrientBasis;
  /** 記録するときの量（basis.unit 単位） */
  amount: number;
  nutrients: Nutrients;
};

/** 目標との合い方 */
export type SuggestionFit = "within" | "near" | "under" | "over";

export const SUGGESTION_FIT_LABELS: Record<SuggestionFit, string> = {
  within: "目標範囲内",
  near: "許容範囲に近い",
  under: "少なめ",
  over: "一部超過",
};

export type Suggestion = {
  key: string;
  brandKey: string | null;
  items: SuggestionItem[];
  totals: Nutrients;
  /** この食事の目安との差（＋は多い、−は少ない） */
  mealDiff: Nutrients;
  /** 食べたあとの 1 日の残り（マイナスは超過） */
  afterRemaining: Nutrients;
  /** 1 日の目標＋許容範囲を超える栄養素と、目標からの超過量 */
  dayOverBy: Partial<Nutrients>;
  fit: SuggestionFit;
  score: number;
  /** 全品が確認済みの商品データか */
  allVerified: boolean;
  /** 全品に価格がある場合だけ合計 */
  priceYen: number | null;
};

export type SuggestInput = {
  foods: readonly SuggestFood[];
  /** 1 日の目標 */
  target: Nutrients;
  /** 1 日の許容範囲 */
  tolerance: Nutrients;
  /** すでに食べた量（今日の合計） */
  intake: Nutrients;
  /** この食事で使う割合（0〜1） */
  share: number;
  /** 返す件数 */
  limit?: number;
};

export type SuggestResult = {
  /** この食事の目安 */
  budget: Nutrients;
  /** この食事の許容範囲 */
  mealTolerance: Nutrients;
  /** 軽食モード（残りがほとんど無い / すでに超えているとき） */
  light: boolean;
  suggestions: Suggestion[];
  /** 調べた組み合わせの数（テスト・確認用） */
  evaluated: number;
};

type Rules = {
  maxDistinct: number;
  maxUnits: number;
  roleLimits: Record<MealRole, number>;
  quantities: (role: MealRole) => number[];
};

const SUBSTANTIAL_ROLES: ReadonlySet<MealRole> = new Set(["main", "staple", "protein"]);
const LIGHT_ROLES: ReadonlySet<MealRole> = new Set(["protein", "side", "soup", "drink", "snack"]);

/** この食事の許容範囲の下限（目安が小さくても厳しくなりすぎないように） */
const MIN_MEAL_TOLERANCE: Nutrients = { energyKcal: 60, proteinG: 5, fatG: 4, carbsG: 10 };

/** 目安との差の重み（over: 多すぎ / under: 足りない） */
const WEIGHTS: Record<NutrientKey, { over: number; under: number }> = {
  energyKcal: { over: 1.0, under: 0.6 },
  proteinG: { over: 0.25, under: 1.2 },
  fatG: { over: 1.2, under: 0.15 },
  carbsG: { over: 0.8, under: 0.6 },
};

const UNVERIFIED_PENALTY = 0.6;
const EXTRA_UNIT_PENALTY = 0.12;
/** 目安が これ未満なら軽食モード（主食・主菜を必須にしない） */
const LIGHT_MEAL_KCAL = 250;

function rulesFor(channel: FoodChannel, genre: string | null, light: boolean): Rules {
  if (light) {
    return {
      maxDistinct: 2,
      maxUnits: 2,
      roleLimits: { main: 0, staple: 0, protein: 1, side: 2, soup: 1, drink: 1, snack: 1 },
      quantities: () => [1],
    };
  }
  if (channel === "restaurant" && genre === "sushi") {
    return {
      maxDistinct: 4,
      maxUnits: 6,
      roleLimits: { main: 4, staple: 4, protein: 4, side: 1, soup: 1, drink: 1, snack: 0 },
      quantities: (role) => (role === "main" || role === "staple" || role === "protein" ? [1, 2] : [1]),
    };
  }
  if (channel === "restaurant") {
    return {
      maxDistinct: 3,
      maxUnits: 3,
      roleLimits: { main: 1, staple: 1, protein: 1, side: 2, soup: 1, drink: 1, snack: 0 },
      quantities: () => [1],
    };
  }
  return {
    maxDistinct: 3,
    maxUnits: 4,
    roleLimits: { main: 1, staple: 2, protein: 2, side: 2, soup: 1, drink: 1, snack: 0 },
    quantities: (role) => (role === "staple" || role === "protein" ? [1, 2] : [1]),
  };
}

function nonNegative(values: Nutrients): Nutrients {
  return {
    energyKcal: Math.max(0, values.energyKcal),
    proteinG: Math.max(0, values.proteinG),
    fatG: Math.max(0, values.fatG),
    carbsG: Math.max(0, values.carbsG),
  };
}

function scale(values: Nutrients, factor: number): Nutrients {
  return {
    energyKcal: values.energyKcal * factor,
    proteinG: values.proteinG * factor,
    fatG: values.fatG * factor,
    carbsG: values.carbsG * factor,
  };
}

export function mealBudget(target: Nutrients, intake: Nutrients, share: number): Nutrients {
  const safeShare = Math.min(1, Math.max(0, share));
  return scale(nonNegative(subtractNutrients(target, intake)), safeShare);
}

export function mealToleranceFor(tolerance: Nutrients, share: number): Nutrients {
  const factor = Math.max(Math.min(1, share), 0.5);
  return {
    energyKcal: Math.max(tolerance.energyKcal * factor, MIN_MEAL_TOLERANCE.energyKcal),
    proteinG: Math.max(tolerance.proteinG * factor, MIN_MEAL_TOLERANCE.proteinG),
    fatG: Math.max(tolerance.fatG * factor, MIN_MEAL_TOLERANCE.fatG),
    carbsG: Math.max(tolerance.carbsG * factor, MIN_MEAL_TOLERANCE.carbsG),
  };
}

type Candidate = { food: SuggestFood; basis: NutrientBasis; servingAmount: number; perQuantity: Map<number, Nutrients> };

/**
 * 組み合わせを評価する（テストしやすいよう単独でも使える）
 */
export function evaluateCombination(
  items: SuggestionItem[],
  context: { target: Nutrients; tolerance: Nutrients; intake: Nutrients; budget: Nutrients; mealTolerance: Nutrients },
): Omit<Suggestion, "key" | "brandKey"> {
  const totals = sumNutrients(items.map((i) => i.nutrients));
  const mealDiff = subtractNutrients(totals, roundBudget(context.budget));
  const after = sumNutrients([context.intake, totals]);
  const afterRemaining = subtractNutrients(context.target, after);

  let score = 0;
  let allWithin = true;
  let allNear = true;
  let worstShortfall = 0;
  let worstExcess = 0;
  const dayOverBy: Partial<Nutrients> = {};

  for (const key of NUTRIENT_KEYS) {
    const tol = context.mealTolerance[key];
    const x = (totals[key] - context.budget[key]) / tol;
    const weight = WEIGHTS[key];
    if (x > 0) {
      score += weight.over * x * x + (x > 1 ? weight.over * (x - 1) * 2 : 0);
      worstExcess = Math.max(worstExcess, x);
    } else {
      score += weight.under * x * x;
      worstShortfall = Math.max(worstShortfall, -x);
    }
    if (Math.abs(x) > 1) allWithin = false;
    if (Math.abs(x) > 2) allNear = false;

    // 1 日の目標＋許容範囲を超えるか
    const dayExcess = after[key] - (context.target[key] + context.tolerance[key]);
    if (dayExcess > 1e-9) {
      dayOverBy[key] = -afterRemaining[key];
      const dayTol = Math.max(context.tolerance[key], MIN_MEAL_TOLERANCE[key]);
      score += 4 + 3 * (dayExcess / dayTol) ** 2;
    }
  }

  const units = items.reduce((sum, i) => sum + i.quantity, 0);
  score += EXTRA_UNIT_PENALTY * Math.max(0, units - 1);
  const unverified = items.filter((i) => i.food.verification_status !== "verified").length;
  score += UNVERIFIED_PENALTY * unverified;

  let fit: SuggestionFit;
  if (Object.keys(dayOverBy).length > 0) fit = "over";
  else if (allWithin) fit = "within";
  else if (allNear) fit = "near";
  else fit = worstShortfall >= worstExcess ? "under" : "near";

  const prices = items.map((i) => (i.food.price_yen == null ? null : i.food.price_yen * i.quantity));
  const priceYen = prices.every((p): p is number => p !== null) ? prices.reduce((a, b) => a + b, 0) : null;

  return {
    items,
    totals,
    mealDiff,
    afterRemaining,
    dayOverBy,
    fit,
    score,
    allVerified: unverified === 0,
    priceYen,
  };
}

function roundBudget(budget: Nutrients): Nutrients {
  return {
    energyKcal: Math.round(budget.energyKcal),
    proteinG: Math.round(budget.proteinG * 10) / 10,
    fatG: Math.round(budget.fatG * 10) / 10,
    carbsG: Math.round(budget.carbsG * 10) / 10,
  };
}

function itemKey(items: SuggestionItem[]): string {
  return items
    .map((i) => `${i.food.id}x${i.quantity}`)
    .sort()
    .join("+");
}

function overlap(a: SuggestionItem[], b: SuggestionItem[]): number {
  const ids = new Set(a.map((i) => i.food.id));
  const shared = b.filter((i) => ids.has(i.food.id)).length;
  const union = new Set([...ids, ...b.map((i) => i.food.id)]).size;
  return union === 0 ? 0 : shared / union;
}

/**
 * 提案を作る。foods は「同じ画面で選んだお店（チェーン）」の商品。複数のチェーンが混ざっていれば、
 * チェーンごとに組み合わせを作る（1 回の食事で 2 つのお店には行かない前提）。
 */
export function suggestMeals(input: SuggestInput): SuggestResult {
  const limit = input.limit ?? 6;
  const budget = mealBudget(input.target, input.intake, input.share);
  const mealTolerance = mealToleranceFor(input.tolerance, input.share);
  const light = budget.energyKcal < LIGHT_MEAL_KCAL;
  const context = { target: input.target, tolerance: input.tolerance, intake: input.intake, budget, mealTolerance };

  // サンプルデータは提案に使わない（実在の商品として扱わない）
  const usable = input.foods.filter((f) => f.verification_status !== "sample");

  const groups = new Map<string, SuggestFood[]>();
  for (const food of usable) {
    const key = food.brand_key ?? `__${food.brand ?? "none"}`;
    const list = groups.get(key) ?? [];
    list.push(food);
    groups.set(key, list);
  }

  const results: Suggestion[] = [];
  let evaluated = 0;
  const energyCap = budget.energyKcal * 1.8 + 350;

  for (const foods of groups.values()) {
    const first = foods[0];
    if (!first) continue;
    const rules = rulesFor(first.channel, first.genre, light);
    const candidates: Candidate[] = [];
    for (const food of [...foods].sort((a, b) => a.id.localeCompare(b.id))) {
      if (light && !LIGHT_ROLES.has(food.meal_role)) continue;
      if (rules.roleLimits[food.meal_role] <= 0) continue;
      const converted = foodBasis(food);
      if (!converted) continue;
      const perQuantity = new Map<number, Nutrients>();
      for (const q of rules.quantities(food.meal_role)) {
        perQuantity.set(q, computeItemNutrients(converted.basis, converted.servingAmount * q));
      }
      candidates.push({ food, basis: converted.basis, servingAmount: converted.servingAmount, perQuantity });
    }

    const chosen: SuggestionItem[] = [];
    const roleCount = new Map<MealRole, number>();
    let units = 0;
    let energy = 0;

    const visit = (start: number) => {
      if (chosen.length > 0) {
        const hasSubstantial = chosen.some((i) => SUBSTANTIAL_ROLES.has(i.food.meal_role));
        if (light || hasSubstantial) {
          evaluated += 1;
          const evaluatedCombo = evaluateCombination([...chosen], context);
          results.push({ ...evaluatedCombo, key: itemKey(chosen), brandKey: first.brand_key });
        }
      }
      if (chosen.length >= rules.maxDistinct) return;
      for (let index = start; index < candidates.length; index++) {
        const candidate = candidates[index];
        if (!candidate) continue;
        const role = candidate.food.meal_role;
        const used = roleCount.get(role) ?? 0;
        for (const [quantity, nutrients] of candidate.perQuantity) {
          if (units + quantity > rules.maxUnits) continue;
          if (used + quantity > rules.roleLimits[role]) continue;
          // カロリーは品を足すほど増えるので、目安を大きく超えたら先は調べない
          if (energy + nutrients.energyKcal > energyCap) continue;
          chosen.push({
            food: candidate.food,
            quantity,
            basis: candidate.basis,
            amount: candidate.servingAmount * quantity,
            nutrients,
          });
          roleCount.set(role, used + quantity);
          units += quantity;
          energy += nutrients.energyKcal;
          visit(index + 1);
          energy -= nutrients.energyKcal;
          units -= quantity;
          roleCount.set(role, used);
          chosen.pop();
        }
      }
    };
    visit(0);
  }

  results.sort((a, b) => a.score - b.score || a.key.localeCompare(b.key));

  // 似た組み合わせを間引く（同じ商品が半分以上かぶるものは除く）
  const picked: Suggestion[] = [];
  for (const candidate of results) {
    if (picked.length >= limit) break;
    if (picked.some((p) => overlap(p.items, candidate.items) >= 0.5)) continue;
    picked.push(candidate);
  }

  return { budget, mealTolerance, light, suggestions: picked, evaluated };
}
