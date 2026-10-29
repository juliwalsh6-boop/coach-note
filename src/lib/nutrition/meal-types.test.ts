import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { defaultMealType, isMealType, mealShare, type MealType } from "./meal-types";

describe("defaultMealType", () => {
  test("時刻で食事区分を選ぶ", () => {
    assert.equal(defaultMealType(7), "breakfast");
    assert.equal(defaultMealType(12), "lunch");
    assert.equal(defaultMealType(16), "snack");
    assert.equal(defaultMealType(19), "dinner");
    assert.equal(defaultMealType(1), "dinner");
  });
  test("isMealType", () => {
    assert.ok(isMealType("lunch"));
    assert.ok(!isMealType("brunch"));
    assert.ok(!isMealType(null));
  });
});

describe("mealShare（この食事で使う 1 日の残りの割合）", () => {
  const logged = (...types: MealType[]) => new Set<MealType>(types);

  test("何も記録していない朝食は 25%", () => {
    assert.equal(Math.round(mealShare("breakfast", logged()) * 100), 25);
  });
  test("朝食のあとの昼食は、昼・夕・間食で分ける", () => {
    assert.equal(Math.round(mealShare("lunch", logged("breakfast")) * 1000), Math.round((0.35 / 0.75) * 1000));
  });
  test("朝・昼のあとの夕食は、ほとんどを使う", () => {
    assert.equal(Math.round(mealShare("dinner", logged("breakfast", "lunch")) * 1000), Math.round((0.35 / 0.4) * 1000));
  });
  test("最後の食事は残りすべて", () => {
    assert.equal(mealShare("dinner", logged("breakfast", "lunch", "snack")), 1);
    assert.equal(mealShare("snack", logged("breakfast", "lunch", "dinner")), 1);
  });
  test("間食は、まだ記録していない食事の分を残す", () => {
    assert.equal(Math.round(mealShare("snack", logged("breakfast", "lunch")) * 1000), Math.round((0.05 / 0.4) * 1000));
    assert.equal(Math.round(mealShare("snack", logged()) * 1000), 50);
  });
  test("朝食を記録していなくても、昼食の配分に朝食は入れない（過ぎた食事）", () => {
    assert.equal(Math.round(mealShare("lunch", logged()) * 1000), Math.round((0.35 / 0.75) * 1000));
  });
});
