import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { foodBasis, foodNutrients, foodWeightG, formatAmount } from "./foods";

const perServing = {
  nutrient_basis: "serving",
  serving_weight_g: 110,
  serving_label: "1個",
  energy_kcal: 180,
  protein_g: 4.5,
  fat_g: 1.2,
  carbs_g: 38,
};

const per100g = {
  nutrient_basis: "per_100g",
  serving_weight_g: 150,
  serving_label: "茶碗1杯",
  energy_kcal: 156,
  protein_g: 2.5,
  fat_g: 0.3,
  carbs_g: 37.1,
};

describe("foodBasis（商品データ → 記録用の換算の基準）", () => {
  test("1食分あたりの値は「1食」単位", () => {
    assert.deepEqual(foodBasis(perServing), {
      basis: { unit: "serving", refAmount: 1, ref: { energyKcal: 180, proteinG: 4.5, fatG: 1.2, carbsG: 38 } },
      servingAmount: 1,
    });
  });
  test("100gあたりの値は g 単位で、1食分 = 1食分の重量", () => {
    const converted = foodBasis(per100g);
    assert.equal(converted?.basis.unit, "g");
    assert.equal(converted?.basis.refAmount, 100);
    assert.equal(converted?.servingAmount, 150);
  });
  test("100gあたりなのに 1食分の重量が無ければ換算できない", () => {
    assert.equal(foodBasis({ ...per100g, serving_weight_g: null }), null);
  });
});

describe("foodNutrients / foodWeightG", () => {
  test("2 個分", () => {
    assert.deepEqual(foodNutrients(perServing, 2), { energyKcal: 360, proteinG: 9, fatG: 2.4, carbsG: 76 });
    assert.equal(foodWeightG(perServing, 2), 220);
  });
  test("ごはん 1 杯（150g）", () => {
    assert.deepEqual(foodNutrients(per100g, 1), { energyKcal: 234, proteinG: 3.8, fatG: 0.5, carbsG: 55.7 });
    assert.equal(foodWeightG(per100g, 1), 150);
  });
});

describe("formatAmount", () => {
  test("「1個」の 1 を数量に置き換える", () => {
    assert.equal(formatAmount("serving", 2, "1個"), "2個");
    assert.equal(formatAmount("serving", 1, "並盛 1杯"), "並盛 1杯");
    assert.equal(formatAmount("serving", 0.5, "1食"), "0.5食");
  });
  test("数字の無い表記・g", () => {
    assert.equal(formatAmount("serving", 2, "並盛"), "並盛 × 2");
    assert.equal(formatAmount("g", 180, null), "180g");
    assert.equal(formatAmount("serving", 1, null), "1食");
  });
});
