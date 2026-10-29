import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { MealRole, VerificationStatus } from "./foods";
import type { Nutrients } from "./nutrients";
import { evaluateCombination, mealBudget, mealToleranceFor, suggestMeals, type SuggestFood } from "./suggest";

const n = (energyKcal: number, proteinG: number, fatG: number, carbsG: number): Nutrients => ({
  energyKcal,
  proteinG,
  fatG,
  carbsG,
});

function food(
  id: string,
  role: MealRole,
  values: Nutrients,
  options: Partial<Pick<SuggestFood, "brand_key" | "channel" | "genre" | "price_yen">> & {
    verification?: VerificationStatus;
  } = {},
): SuggestFood {
  return {
    id,
    name: id,
    brand_key: options.brand_key ?? "store_a",
    brand: options.brand_key ?? "store_a",
    channel: options.channel ?? "convenience",
    genre: options.genre ?? null,
    meal_role: role,
    verification_status: options.verification ?? "verified",
    price_yen: options.price_yen ?? null,
    nutrient_basis: "serving",
    serving_weight_g: null,
    serving_label: "1個",
    energy_kcal: values.energyKcal,
    protein_g: values.proteinG,
    fat_g: values.fatG,
    carbs_g: values.carbsG,
  };
}

// コンビニ（テスト用の値）
const onigiriSake = food("onigiri_sake", "staple", n(180, 4.5, 1.2, 38), { price_yen: 160 });
const onigiriTunamayo = food("onigiri_tunamayo", "staple", n(230, 5, 9, 33), { price_yen: 150 });
const saladChicken = food("salad_chicken", "protein", n(110, 24, 1.5, 0.5), { price_yen: 250 });
const boiledEgg = food("boiled_egg", "protein", n(70, 6.2, 4.8, 0.2), { price_yen: 90 });
const greenSalad = food("green_salad", "side", n(25, 1.2, 0.3, 5), { price_yen: 200 });
const proteinDrink = food("protein_drink", "drink", n(100, 15, 0, 10), { price_yen: 180 });
const karaageBento = food("karaage_bento", "main", n(850, 30, 40, 95), { price_yen: 590 });
const makunouchi = food("makunouchi", "main", n(650, 22, 18, 100), { price_yen: 550 });
const chocolate = food("chocolate", "snack", n(280, 3, 16, 30));
const misoSoup = food("miso_soup", "soup", n(40, 2.5, 1.4, 4.4));
const sampleItem = food("sample_super_bowl", "main", n(500, 60, 5, 40), { verification: "sample" });

const STORE_A = [
  onigiriSake,
  onigiriTunamayo,
  saladChicken,
  boiledEgg,
  greenSalad,
  proteinDrink,
  karaageBento,
  makunouchi,
  chocolate,
  misoSoup,
  sampleItem,
];

const TARGET = n(2200, 140, 60, 270);
const TOLERANCE = n(100, 10, 5, 20);

describe("mealBudget / mealToleranceFor", () => {
  test("この食事の目安 = 1 日の残り × 配分（超過している栄養素は 0）", () => {
    const budget = mealBudget(TARGET, n(1200, 60, 70, 150), 0.5);
    assert.deepEqual(budget, n(500, 40, 0, 60));
  });
  test("この食事の許容範囲は配分に合わせて小さくなるが、下限がある", () => {
    assert.deepEqual(mealToleranceFor(TOLERANCE, 1), n(100, 10, 5, 20));
    assert.deepEqual(mealToleranceFor(TOLERANCE, 0.3), n(60, 5, 4, 10));
  });
});

describe("evaluateCombination", () => {
  const context = {
    target: TARGET,
    tolerance: TOLERANCE,
    intake: n(600, 30, 20, 80),
    budget: n(700, 50, 18, 90),
    mealTolerance: n(60, 5, 4, 10),
  };

  test("合計・食後の残り・価格（全品に価格があるときだけ）", () => {
    const result = evaluateCombination(
      [
        { food: onigiriSake, quantity: 2, basis: { unit: "serving", refAmount: 1, ref: n(180, 4.5, 1.2, 38) }, amount: 2, nutrients: n(360, 9, 2.4, 76) },
        { food: saladChicken, quantity: 1, basis: { unit: "serving", refAmount: 1, ref: n(110, 24, 1.5, 0.5) }, amount: 1, nutrients: n(110, 24, 1.5, 0.5) },
      ],
      context,
    );
    assert.deepEqual(result.totals, n(470, 33, 3.9, 76.5));
    assert.deepEqual(result.afterRemaining, n(1130, 77, 36.1, 113.5));
    assert.equal(result.priceYen, 160 * 2 + 250);
    assert.equal(result.allVerified, true);
    assert.deepEqual(result.dayOverBy, {});
  });

  test("価格の無い商品が入ると合計価格は出さない", () => {
    const result = evaluateCombination(
      [{ food: chocolate, quantity: 1, basis: { unit: "serving", refAmount: 1, ref: n(280, 3, 16, 30) }, amount: 1, nutrients: n(280, 3, 16, 30) }],
      context,
    );
    assert.equal(result.priceYen, null);
  });

  test("1 日の目標＋許容範囲を超えると「一部超過」で、目標からの超過量を出す", () => {
    const result = evaluateCombination(
      [{ food: karaageBento, quantity: 1, basis: { unit: "serving", refAmount: 1, ref: n(850, 30, 40, 95) }, amount: 1, nutrients: n(850, 30, 40, 95) }],
      { ...context, intake: n(1500, 80, 40, 180) },
    );
    assert.equal(result.fit, "over");
    // 脂質: 40 + 40 = 80g（目標 60g）→ 20g 超過、カロリー: 1500 + 850 = 2350（目標 2200）→ 150kcal 超過
    assert.equal(result.dayOverBy.fatG, 20);
    assert.equal(result.dayOverBy.energyKcal, 150);
    assert.equal(result.dayOverBy.proteinG, undefined);
  });
});

describe("suggestMeals（コンビニ）", () => {
  // 朝食 600kcal を記録済みで昼食を選ぶ（たんぱく質が多く残り、脂質は少なめに残っている）
  const lunchInput = {
    foods: STORE_A,
    target: TARGET,
    tolerance: TOLERANCE,
    intake: n(600, 30, 35, 80),
    share: 0.35 / 0.75,
  };

  test("候補が返り、上位は 1 日の目標を超えない", () => {
    const result = suggestMeals(lunchInput);
    assert.ok(result.suggestions.length >= 3);
    assert.notEqual(result.suggestions[0]?.fit, "over");
  });

  test("たんぱく質が多い順ではなく、脂質の少なさも考える（唐揚げ弁当は上位に来ない）", () => {
    const result = suggestMeals(lunchInput);
    const top = result.suggestions.slice(0, 3);
    for (const s of top) {
      assert.ok(!s.items.some((i) => i.food.id === "karaage_bento"), `上位に唐揚げ弁当: ${s.key}`);
      // 脂質の残り（60 − 35 = 25g）の配分を大きく超えない
      assert.ok(s.totals.fatG <= 25, `脂質が多すぎる: ${s.key} ${s.totals.fatG}`);
    }
    // 上位の候補はたんぱく質源を含む
    assert.ok(top[0]?.items.some((i) => i.food.meal_role === "protein" || i.food.meal_role === "drink"));
  });

  test("組み合わせのルール: 主食・主菜のどれかを含む / 3 品・4 個まで / 飲み物は 1 本まで / 同じお店", () => {
    const result = suggestMeals({ ...lunchInput, limit: 30 });
    for (const s of result.suggestions) {
      assert.ok(s.items.some((i) => ["main", "staple", "protein"].includes(i.food.meal_role)), s.key);
      assert.ok(s.items.length <= 3, s.key);
      assert.ok(s.items.reduce((sum, i) => sum + i.quantity, 0) <= 4, s.key);
      assert.ok(s.items.filter((i) => i.food.meal_role === "drink").length <= 1, s.key);
      assert.ok(s.items.filter((i) => i.food.meal_role === "main").length <= 1, s.key);
      assert.ok(!s.items.some((i) => i.food.meal_role === "snack"), `食事にお菓子: ${s.key}`);
    }
  });

  test("サンプルデータは提案に使わない", () => {
    const result = suggestMeals({ ...lunchInput, limit: 50 });
    assert.ok(result.suggestions.every((s) => s.items.every((i) => i.food.verification_status !== "sample")));
  });

  test("同じ値なら、確認済みの商品データを未確認のものより優先する", () => {
    const unverifiedChicken = food("salad_chicken_unverified", "protein", n(110, 24, 1.5, 0.5), { verification: "unverified" });
    const result = suggestMeals({ ...lunchInput, foods: [...STORE_A, unverifiedChicken], limit: 50 });
    const keys = result.suggestions.map((s) => s.key);
    const verifiedIndex = keys.findIndex((k) => k.includes("salad_chicken") && !k.includes("unverified"));
    const unverifiedIndex = keys.findIndex((k) => k.includes("salad_chicken_unverified"));
    assert.ok(verifiedIndex >= 0);
    assert.ok(unverifiedIndex === -1 || verifiedIndex < unverifiedIndex);
  });

  test("似た組み合わせばかりにならない（同じ商品が半分以上かぶる候補は除く）", () => {
    const result = suggestMeals(lunchInput);
    const suggestions = result.suggestions;
    for (let i = 0; i < suggestions.length; i++) {
      for (let j = i + 1; j < suggestions.length; j++) {
        const a = new Set(suggestions[i]?.items.map((x) => x.food.id));
        const b = suggestions[j]?.items.map((x) => x.food.id) ?? [];
        const shared = b.filter((id) => a.has(id)).length;
        const union = new Set([...a, ...b]).size;
        assert.ok(shared / union < 0.5, `${suggestions[i]?.key} / ${suggestions[j]?.key}`);
      }
    }
  });

  test("同じ入力なら同じ結果（並び順も一定）", () => {
    const a = suggestMeals(lunchInput).suggestions.map((s) => s.key);
    const b = suggestMeals(lunchInput).suggestions.map((s) => s.key);
    assert.deepEqual(a, b);
  });

  test("「おにぎり2個」のように、主食は 2 個までの候補も作る", () => {
    // 夕食で、炭水化物が多く残っている
    const result = suggestMeals({
      ...lunchInput,
      intake: n(1300, 90, 40, 100),
      share: 1,
      limit: 20,
    });
    assert.ok(result.suggestions.some((s) => s.items.some((i) => i.quantity === 2 && i.food.meal_role === "staple")));
  });
});

describe("suggestMeals（目標に合う候補が無いとき・超過しているとき）", () => {
  test("すでに脂質を超えていたら、どの候補も「一部超過」と表示し、脂質の少ないものを上位にする", () => {
    const result = suggestMeals({
      foods: STORE_A,
      target: TARGET,
      tolerance: TOLERANCE,
      intake: n(1200, 60, 70, 150),
      share: 0.5,
    });
    assert.ok(result.suggestions.length > 0);
    assert.ok(result.suggestions.every((s) => s.fit === "over"), "目標内と表示しない");
    const top = result.suggestions[0];
    assert.ok(top && top.totals.fatG <= 3, `上位の脂質: ${top?.totals.fatG}`);
    assert.ok(top && top.dayOverBy.fatG !== undefined && top.dayOverBy.fatG >= 10);
  });

  test("合う組み合わせが無くても、最も近い候補を超過量つきで返す", () => {
    const result = suggestMeals({
      foods: [karaageBento],
      target: n(2000, 150, 50, 250),
      tolerance: n(100, 10, 5, 20),
      intake: n(1200, 60, 45, 150),
      share: 1,
    });
    assert.equal(result.suggestions.length, 1);
    const only = result.suggestions[0];
    assert.equal(only?.fit, "over");
    assert.equal(only?.dayOverBy.fatG, 35); // 45 + 40 − 50
  });

  test("残りがほとんど無いときは軽食だけを提案する（弁当・おにぎりは出さない）", () => {
    const result = suggestMeals({
      foods: STORE_A,
      target: TARGET,
      tolerance: TOLERANCE,
      intake: n(2050, 120, 50, 250),
      share: 1,
    });
    assert.equal(result.light, true);
    assert.ok(result.suggestions.length > 0);
    for (const s of result.suggestions) {
      assert.ok(s.items.every((i) => !["main", "staple"].includes(i.food.meal_role)), s.key);
      assert.ok(s.items.length <= 2);
    }
  });

  test("商品データが無ければ空", () => {
    const result = suggestMeals({ foods: [], target: TARGET, tolerance: TOLERANCE, intake: n(0, 0, 0, 0), share: 0.3 });
    assert.deepEqual(result.suggestions, []);
  });
});

describe("suggestMeals（外食）", () => {
  const gyudonA = food("a_gyudon", "main", n(650, 20, 25, 85), { brand_key: "chain_a", channel: "restaurant", genre: "gyudon" });
  const saladA = food("a_salad", "side", n(30, 1, 0.5, 6), { brand_key: "chain_a", channel: "restaurant", genre: "gyudon" });
  const eggA = food("a_egg", "side", n(80, 6.5, 5.5, 0.2), { brand_key: "chain_a", channel: "restaurant", genre: "gyudon" });
  const gyudonB = food("b_gyudon", "main", n(700, 22, 28, 90), { brand_key: "chain_b", channel: "restaurant", genre: "gyudon" });
  const misoB = food("b_miso", "soup", n(30, 2, 1, 3), { brand_key: "chain_b", channel: "restaurant", genre: "gyudon" });

  test("別のチェーンの商品を組み合わせない", () => {
    const result = suggestMeals({
      foods: [gyudonA, saladA, eggA, gyudonB, misoB],
      target: TARGET,
      tolerance: TOLERANCE,
      intake: n(800, 50, 20, 100),
      share: 0.6,
      limit: 20,
    });
    assert.ok(result.suggestions.length > 0);
    for (const s of result.suggestions) {
      assert.equal(new Set(s.items.map((i) => i.food.brand_key)).size, 1, s.key);
      assert.ok(s.items.filter((i) => i.food.meal_role === "main").length <= 1);
    }
    assert.ok(result.suggestions.some((s) => s.key.includes("a_gyudon") && s.key.includes("a_salad")), "牛丼＋サラダ");
  });

  test("寿司は複数の皿を組み合わせられる", () => {
    const plates = ["maguro", "salmon", "ebi", "tamago", "ika"].map((name, i) =>
      food(`sushi_${name}`, "staple", n(80 + i * 10, 4 + i, 1 + i * 0.5, 12), { brand_key: "sushi_x", channel: "restaurant", genre: "sushi" }),
    );
    const result = suggestMeals({
      foods: plates,
      target: TARGET,
      tolerance: TOLERANCE,
      intake: n(800, 50, 20, 100),
      share: 0.6,
      limit: 5,
    });
    assert.ok(result.suggestions.some((s) => s.items.reduce((sum, i) => sum + i.quantity, 0) >= 4));
  });
});

describe("suggestMeals（性能）", () => {
  test("60 品のお店でも短時間で終わる", () => {
    const foods: SuggestFood[] = [];
    const roles: MealRole[] = ["main", "staple", "protein", "side", "soup", "drink", "snack"];
    for (let i = 0; i < 60; i++) {
      const role = roles[i % roles.length] ?? "side";
      foods.push(food(`f${String(i).padStart(2, "0")}`, role, n(50 + ((i * 37) % 600), (i * 7) % 30, (i * 5) % 25, (i * 11) % 90)));
    }
    const started = performance.now();
    const result = suggestMeals({ foods, target: TARGET, tolerance: TOLERANCE, intake: n(600, 30, 20, 80), share: 0.47 });
    const elapsed = performance.now() - started;
    assert.ok(result.suggestions.length > 0);
    assert.ok(elapsed < 2000, `${elapsed}ms`);
  });
});
