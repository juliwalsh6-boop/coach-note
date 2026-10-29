import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { hasEnergyMismatch, toAiEstimate, validateMealAnalysis } from "./analysis";

function rawItem(overrides: Record<string, unknown> = {}) {
  return {
    name: "鶏の唐揚げ",
    kind: "dish",
    estimated_weight_g: 150,
    portion_text: "5個",
    energy_kcal: 420,
    protein_g: 25.24,
    fat_g: 28.1,
    carbs_g: 12.4,
    confidence: "medium",
    basis: "visual_estimate",
    note: "揚げ油の吸収を含めて推定",
    ...overrides,
  };
}

function raw(overrides: Record<string, unknown> = {}) {
  return {
    is_food_photo: true,
    items: [rawItem(), rawItem({ name: "白ごはん", kind: "dish", estimated_weight_g: 180, portion_text: "茶碗1杯", energy_kcal: 281, protein_g: 4.5, fat_g: 0.5, carbs_g: 66.8, confidence: "high", note: "" })],
    overall_confidence: "medium",
    warnings: ["ソースの量は写真からは判断できません"],
    ...overrides,
  };
}

describe("validateMealAnalysis（AI の応答の検証）", () => {
  test("正しい形式なら画面用の形にする（PFC は小数第 1 位）", () => {
    const result = validateMealAnalysis(raw());
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.value.items.length, 2);
    assert.equal(result.value.items[0]?.proteinG, 25.2);
    assert.equal(result.value.items[0]?.estimatedWeightG, 150);
    assert.equal(result.value.overallConfidence, "medium");
    assert.deepEqual(result.value.warnings, ["ソースの量は写真からは判断できません"]);
  });

  test("重量が不明（null）でもよい", () => {
    const result = validateMealAnalysis(raw({ items: [rawItem({ estimated_weight_g: null })] }));
    assert.ok(result.ok && result.value.items[0]?.estimatedWeightG === null);
  });

  test("列挙値の大文字・小文字の揺れは許す", () => {
    const result = validateMealAnalysis(raw({ overall_confidence: "High", items: [rawItem({ confidence: "LOW" })] }));
    assert.ok(result.ok && result.value.overallConfidence === "high" && result.value.items[0]?.confidence === "low");
  });

  test("食事が写っていない場合", () => {
    const result = validateMealAnalysis(raw({ is_food_photo: false, items: [] }));
    assert.ok(result.ok && result.value.isFoodPhoto === false && result.value.items.length === 0);
  });

  const invalidCases: [string, unknown][] = [
    ["オブジェクトでない", "text"],
    ["items が無い", { ...raw(), items: undefined }],
    ["is_food_photo が文字列", raw({ is_food_photo: "yes" })],
    ["マイナスのカロリー", raw({ items: [rawItem({ energy_kcal: -10 })] })],
    ["ありえないカロリー", raw({ items: [rawItem({ energy_kcal: 99999 })] })],
    ["数値が文字列", raw({ items: [rawItem({ protein_g: "25" })] })],
    ["NaN", raw({ items: [rawItem({ fat_g: Number.NaN })] })],
    ["重量 0", raw({ items: [rawItem({ estimated_weight_g: 0 })] })],
    ["名前が空", raw({ items: [rawItem({ name: "   " })] })],
    ["不明な列挙値", raw({ items: [rawItem({ confidence: "very_high" })] })],
    ["品数が多すぎる", raw({ items: Array.from({ length: 16 }, () => rawItem()) })],
    ["全体の確度が無い", raw({ overall_confidence: undefined })],
  ];
  for (const [label, value] of invalidCases) {
    test(`不正: ${label}`, () => {
      assert.equal(validateMealAnalysis(value).ok, false);
    });
  }

  test("長すぎる文字列は切り詰め、制御文字は除く", () => {
    const result = validateMealAnalysis(raw({ items: [rawItem({ name: `から\u0007揚げ${"あ".repeat(100)}`, note: "x".repeat(500) })] }));
    assert.ok(result.ok);
    if (!result.ok) return;
    const item = result.value.items[0];
    assert.ok(item && item.name.length <= 60 && !item.name.includes("\u0007"));
    assert.ok(item && item.note.length <= 200);
  });

  test("PFC とカロリーが大きく食い違う品に印を付ける", () => {
    const result = validateMealAnalysis(raw({ items: [rawItem({ energy_kcal: 900, protein_g: 10, fat_g: 5, carbs_g: 20 })] }));
    assert.ok(result.ok && result.value.items[0]?.flags.includes("energy_mismatch"));
  });

  test("同じ名前の品が 2 つあれば、重複の可能性の印を付ける", () => {
    const result = validateMealAnalysis(raw({ items: [rawItem({ name: "白ごはん" }), rawItem({ name: "白ごはん " })] }));
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.deepEqual(result.value.items[0]?.flags.includes("possible_duplicate"), false);
    assert.deepEqual(result.value.items[1]?.flags.includes("possible_duplicate"), true);
  });
});

describe("hasEnergyMismatch / toAiEstimate", () => {
  test("PFC から計算したカロリーとの差が大きいか", () => {
    assert.equal(hasEnergyMismatch({ energyKcal: 420, proteinG: 25.2, fatG: 28.1, carbsG: 12.4 }), false);
    assert.equal(hasEnergyMismatch({ energyKcal: 100, proteinG: 30, fatG: 20, carbsG: 30 }), true);
  });

  test("保存用のスナップショットは DB の検証項目を含む", () => {
    const result = validateMealAnalysis(raw());
    assert.ok(result.ok);
    if (!result.ok) return;
    const item = result.value.items[0];
    assert.ok(item);
    if (!item) return;
    const estimate = toAiEstimate(item, { model: "claude-sonnet-5-5", analyzedAt: "2026-10-29T03:00:00.000Z" });
    assert.equal(typeof estimate.name, "string");
    assert.equal(typeof estimate.energy_kcal, "number");
    assert.equal(estimate.estimated_weight_g, 150);
    assert.equal(estimate.model, "claude-sonnet-5-5");
  });
});
