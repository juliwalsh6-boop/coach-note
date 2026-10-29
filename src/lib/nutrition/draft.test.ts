import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { AnalyzedItem } from "./analysis";
import {
  draftFromAnalysis,
  draftFromFood,
  draftFromSaved,
  draftNutrients,
  draftToPayload,
  emptyManualDraft,
  parseNumberInput,
  validateDraft,
  withAmount,
  withUnit,
  withValue,
} from "./draft";
import { computeItemNutrients } from "./nutrients";

const onigiri = {
  id: "food-1",
  name: "おにぎり 鮭",
  brand: "テストストア",
  nutrient_basis: "serving",
  serving_weight_g: 110,
  serving_label: "1個",
  energy_kcal: 180,
  protein_g: 4.5,
  fat_g: 1.2,
  carbs_g: 38,
};

const aiItem: AnalyzedItem = {
  name: "鶏の唐揚げ",
  kind: "dish",
  estimatedWeightG: 150,
  portionText: "5個",
  energyKcal: 420,
  proteinG: 25.2,
  fatG: 28.1,
  carbsG: 12.4,
  confidence: "medium",
  basis: "visual_estimate",
  note: "",
  flags: [],
};

describe("parseNumberInput", () => {
  test("全角・カンマ・空", () => {
    assert.equal(parseNumberInput("１２．５"), 12.5);
    assert.equal(parseNumberInput("12,5"), 12.5);
    assert.equal(parseNumberInput(".5"), 0.5);
    assert.equal(parseNumberInput(""), null);
    assert.ok(Number.isNaN(parseNumberInput("12a") ?? 0));
    assert.ok(Number.isNaN(parseNumberInput("-3") ?? 0));
  });
});

describe("ItemDraft（入力中の 1 品）", () => {
  test("商品データ 2 個分", () => {
    const draft = draftFromFood(onigiri, "k", 2);
    assert.ok(draft);
    if (!draft) return;
    assert.equal(draft.amountText, "2");
    assert.deepEqual(draftNutrients(draft), { energyKcal: 360, proteinG: 9, fatG: 2.4, carbsG: 76 });
  });

  test("量を変えると栄養値を計算し直す", () => {
    const draft = draftFromFood(onigiri, "k", 1);
    assert.ok(draft);
    if (!draft) return;
    const half = withAmount(draft, "0.5");
    assert.deepEqual(draftNutrients(half), { energyKcal: 90, proteinG: 2.3, fatG: 0.6, carbsG: 19 });
  });

  test("AI の推定（150g）を 200g に直すと比例して変わる", () => {
    const draft = withAmount(draftFromAnalysis(aiItem, "k"), "200");
    assert.deepEqual(draftNutrients(draft), { energyKcal: 560, proteinG: 33.6, fatG: 37.5, carbsG: 16.5 });
    // 保存すると DB は同じ計算をする
    const payload = draftToPayload(draft);
    assert.deepEqual(
      computeItemNutrients({ unit: payload.unit, refAmount: payload.refAmount, ref: payload.ref }, payload.amount),
      draftNutrients(draft),
    );
  });

  test("重量が分からない AI の推定は「1食」", () => {
    const draft = draftFromAnalysis({ ...aiItem, estimatedWeightG: null, portionText: "1人前" }, "k");
    assert.equal(draft.basis.unit, "serving");
    assert.equal(draft.servingLabel, "1人前");
    assert.equal(draft.amountText, "1");
  });

  test("栄養値を直接直したら、その値が基準になり、量を変えるとその値から計算する", () => {
    let draft = draftFromAnalysis(aiItem, "k");
    draft = withValue(draft, "energyKcal", "380");
    assert.equal(draft.basis.refAmount, 150);
    assert.equal(draft.basis.ref.energyKcal, 380);
    draft = withAmount(draft, "300");
    assert.equal(draftNutrients(draft)?.energyKcal, 760);
    assert.equal(draftNutrients(draft)?.proteinG, 50.4);
  });

  test("入力途中（数字でない）でも壊れない", () => {
    const draft = withValue(draftFromAnalysis(aiItem, "k"), "proteinG", "2.");
    assert.equal(draft.valueTexts.proteinG, "2.");
    assert.equal(draftNutrients(draft), null);
    assert.equal(validateDraft(draft)?.field, "values");
  });

  test("保存済みの品から（量の変更は元の基準で計算）", () => {
    const draft = draftFromSaved(
      {
        name: "ごはん",
        brand: null,
        origin: "manual",
        food_id: null,
        unit: "g",
        ref_amount: 100,
        ref_energy_kcal: 156,
        ref_protein_g: 2.5,
        ref_fat_g: 0.3,
        ref_carbs_g: 37.1,
        amount: 180,
        serving_label: null,
        serving_weight_g: null,
      },
      "k",
    );
    assert.deepEqual(draftNutrients(draft), { energyKcal: 281, proteinG: 4.5, fatG: 0.5, carbsG: 66.8 });
    const payload = draftToPayload(withAmount(draft, "150"));
    assert.equal(payload.refAmount, 100);
    assert.equal(payload.amount, 150);
  });

  test("手入力: 単位の切り替えと検証", () => {
    let draft = emptyManualDraft("k");
    assert.equal(validateDraft(draft)?.field, "name");
    draft = { ...draft, name: "手作りサラダ" };
    assert.equal(validateDraft(draft)?.field, "values");
    for (const [key, value] of [["energyKcal", "120"], ["proteinG", "3"], ["fatG", "8"], ["carbsG", "9"]] as const) {
      draft = withValue(draft, key, value);
    }
    assert.equal(validateDraft(draft), null);
    const grams = withUnit(draft, "g");
    assert.equal(grams.amountText, "100");
    assert.equal(grams.basis.unit, "g");
    assert.equal(withAmount(draft, "0").amountText, "0");
    assert.equal(validateDraft(withAmount(draft, "0"))?.field, "amount");
    assert.equal(validateDraft(withAmount(draft, "51"))?.field, "amount");
  });

  test("基準量の 100 倍を超える量は保存させない", () => {
    const draft = withAmount(draftFromAnalysis({ ...aiItem, estimatedWeightG: 10 }, "k"), "1500");
    assert.equal(validateDraft(draft)?.field, "amount");
  });
});
