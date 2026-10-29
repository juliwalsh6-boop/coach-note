/**
 * 食べたものの入力中の状態（追加・編集・AI 解析結果の修正で共通）。
 *
 * 換算の基準（basis）と量（amount）を持ち、表示する栄養値はいつも computeItemNutrients で計算する。
 *  - 量を変えた → 基準はそのままで、栄養値を計算し直す
 *  - 栄養値を直接直した → 「いまの量あたり、直した値」を新しい基準にする
 * 保存時は基準と量をそのまま DB に送るので、DB が計算する値は画面のプレビューと一致する。
 */
import type { AnalyzedItem } from "./analysis";
import { foodBasis, type FoodNutritionFields } from "./foods";
import {
  NUTRIENT_KEYS,
  computeItemNutrients,
  type MealUnit,
  type NutrientBasis,
  type NutrientKey,
  type Nutrients,
} from "./nutrients";

export type ItemOrigin = "manual" | "food" | "ai_photo" | "reuse";

export type ItemDraft = {
  key: string;
  name: string;
  brand: string | null;
  origin: ItemOrigin;
  foodId: string | null;
  basis: NutrientBasis;
  /** 量の入力欄の文字列 */
  amountText: string;
  /** 栄養値の入力欄の文字列（いまの量に対する値） */
  valueTexts: Record<NutrientKey, string>;
  servingLabel: string | null;
  servingWeightG: number | null;
  /** AI の推定（AI 解析から作った場合） */
  ai: AnalyzedItem | null;
  /** 写真から記録したもの */
  fromPhoto: boolean;
};

export const DRAFT_LIMITS = {
  nameLength: 80,
  maxGrams: 5000,
  maxServings: 50,
  maxEnergyKcal: 10000,
  maxMacroG: 1000,
  /** 基準量の何倍まで食べた量にできるか（DB と同じ） */
  maxFactor: 100,
} as const;

/** 全角数字・カンマ小数点にも対応して数値に変換（空は null、数字でなければ NaN） */
export function parseNumberInput(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．，,。]/g, ".");
  if (normalized === "") return null;
  if (!/^\d+(\.\d+)?$/.test(normalized) && !/^\.\d+$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

export function numberText(value: number): string {
  if (!Number.isFinite(value)) return "";
  return String(Math.round(value * 100) / 100);
}

function valueTextsFor(nutrients: Nutrients): Record<NutrientKey, string> {
  return {
    energyKcal: numberText(nutrients.energyKcal),
    proteinG: numberText(nutrients.proteinG),
    fatG: numberText(nutrients.fatG),
    carbsG: numberText(nutrients.carbsG),
  };
}

function makeDraft(fields: Omit<ItemDraft, "valueTexts" | "amountText"> & { amount: number }): ItemDraft {
  const { amount, ...rest } = fields;
  return {
    ...rest,
    amountText: numberText(amount),
    valueTexts: valueTextsFor(computeItemNutrients(fields.basis, amount)),
  };
}

/** 商品データから（quantity 食分） */
export function draftFromFood(
  food: FoodNutritionFields & { id: string; name: string; brand: string | null },
  key: string,
  quantity = 1,
): ItemDraft | null {
  const converted = foodBasis(food);
  if (!converted) return null;
  return makeDraft({
    key,
    name: food.name,
    brand: food.brand,
    origin: "food",
    foodId: food.id,
    basis: converted.basis,
    amount: converted.servingAmount * quantity,
    servingLabel: food.serving_label,
    servingWeightG: food.serving_weight_g,
    ai: null,
    fromPhoto: false,
  });
}

/** 保存済みの 1 品から（編集・最近の食べものの再利用） */
export function draftFromSaved(
  item: {
    name: string;
    brand: string | null;
    origin: string;
    food_id: string | null;
    unit: string;
    ref_amount: number;
    ref_energy_kcal: number;
    ref_protein_g: number;
    ref_fat_g: number;
    ref_carbs_g: number;
    amount: number;
    serving_label: string | null;
    serving_weight_g: number | null;
  },
  key: string,
  origin?: ItemOrigin,
): ItemDraft {
  const unit: MealUnit = item.unit === "g" ? "g" : "serving";
  const savedOrigin: ItemOrigin =
    item.origin === "food" || item.origin === "ai_photo" || item.origin === "reuse" ? item.origin : "manual";
  return makeDraft({
    key,
    name: item.name,
    brand: item.brand,
    origin: origin ?? savedOrigin,
    foodId: item.food_id,
    basis: {
      unit,
      refAmount: Number(item.ref_amount),
      ref: {
        energyKcal: Number(item.ref_energy_kcal),
        proteinG: Number(item.ref_protein_g),
        fatG: Number(item.ref_fat_g),
        carbsG: Number(item.ref_carbs_g),
      },
    },
    amount: Number(item.amount),
    servingLabel: item.serving_label,
    servingWeightG: item.serving_weight_g == null ? null : Number(item.serving_weight_g),
    ai: null,
    fromPhoto: false,
  });
}

/** AI の解析結果の 1 品から（重量が分かれば g、分からなければ「1食」） */
export function draftFromAnalysis(item: AnalyzedItem, key: string): ItemDraft {
  const ref: Nutrients = {
    energyKcal: item.energyKcal,
    proteinG: item.proteinG,
    fatG: item.fatG,
    carbsG: item.carbsG,
  };
  const weight = item.estimatedWeightG;
  return makeDraft({
    key,
    name: item.name,
    brand: null,
    origin: "ai_photo",
    foodId: null,
    basis: weight ? { unit: "g", refAmount: weight, ref } : { unit: "serving", refAmount: 1, ref },
    amount: weight ?? 1,
    servingLabel: weight ? null : item.portionText || "1食",
    servingWeightG: null,
    ai: item,
    fromPhoto: true,
  });
}

/** 手入力（空の状態から） */
export function emptyManualDraft(key: string, unit: MealUnit = "serving"): ItemDraft {
  return {
    key,
    name: "",
    brand: null,
    origin: "manual",
    foodId: null,
    basis: { unit, refAmount: 1, ref: { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 } },
    amountText: unit === "g" ? "100" : "1",
    valueTexts: { energyKcal: "", proteinG: "", fatG: "", carbsG: "" },
    servingLabel: unit === "serving" ? "1食" : null,
    servingWeightG: null,
    ai: null,
    fromPhoto: false,
  };
}

export function draftAmount(draft: ItemDraft): number | null {
  const value = parseNumberInput(draft.amountText);
  return value == null || Number.isNaN(value) ? null : value;
}

/** 量を変える（基準はそのまま、栄養値を計算し直す） */
export function withAmount(draft: ItemDraft, amountText: string): ItemDraft {
  const next = { ...draft, amountText };
  const amount = draftAmount(next);
  if (amount == null || amount <= 0 || !draftHasBasis(draft)) return next;
  return { ...next, valueTexts: valueTextsFor(computeItemNutrients(draft.basis, amount)) };
}

/** 栄養値を直接直す（いまの量あたりの値を新しい基準にする） */
export function withValue(draft: ItemDraft, key: NutrientKey, text: string): ItemDraft {
  const valueTexts = { ...draft.valueTexts, [key]: text };
  const next = { ...draft, valueTexts };
  const amount = draftAmount(next);
  const values = parsedValues(valueTexts);
  if (amount == null || amount <= 0 || !values) return next;
  return { ...next, basis: { unit: draft.basis.unit, refAmount: amount, ref: values } };
}

/** 単位を切り替える（手入力のとき）。いまの栄養値を「新しい単位の今の量あたり」の値として引き継ぐ */
export function withUnit(draft: ItemDraft, unit: MealUnit): ItemDraft {
  if (draft.basis.unit === unit) return draft;
  const amountText = unit === "g" ? "100" : "1";
  const values = parsedValues(draft.valueTexts) ?? { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  return {
    ...draft,
    amountText,
    basis: { unit, refAmount: Number(amountText), ref: values },
    servingLabel: unit === "serving" ? draft.servingLabel ?? "1食" : null,
  };
}

function parsedValues(texts: Record<NutrientKey, string>): Nutrients | null {
  const result: Partial<Nutrients> = {};
  for (const key of NUTRIENT_KEYS) {
    const value = parseNumberInput(texts[key]);
    if (value == null || Number.isNaN(value)) return null;
    result[key] = value;
  }
  return result as Nutrients;
}

function draftHasBasis(draft: ItemDraft): boolean {
  return draft.basis.refAmount > 0;
}

/** 表示用の栄養値（入力欄の値。入力途中で数字でなければ null） */
export function draftNutrients(draft: ItemDraft): Nutrients | null {
  return parsedValues(draft.valueTexts);
}

export type DraftError = { field: "name" | "amount" | "values"; message: string };

/** 保存前の確認（DB の制約と同じ範囲） */
export function validateDraft(draft: ItemDraft): DraftError | null {
  const name = draft.name.trim();
  if (!name) return { field: "name", message: "名前を入力してください" };
  if (name.length > DRAFT_LIMITS.nameLength) return { field: "name", message: `名前は${DRAFT_LIMITS.nameLength}文字までです` };

  const amount = draftAmount(draft);
  const maxAmount = draft.basis.unit === "g" ? DRAFT_LIMITS.maxGrams : DRAFT_LIMITS.maxServings;
  if (amount == null || amount <= 0 || amount > maxAmount) {
    return {
      field: "amount",
      message: draft.basis.unit === "g" ? `量は 1〜${DRAFT_LIMITS.maxGrams}g で入力してください` : `量は 0.1〜${DRAFT_LIMITS.maxServings} で入力してください`,
    };
  }
  if (amount / draft.basis.refAmount > DRAFT_LIMITS.maxFactor) {
    return { field: "amount", message: "量が大きすぎます。単位と量を確認してください" };
  }

  const values = parsedValues(draft.valueTexts);
  if (!values) return { field: "values", message: "カロリーと PFC を数字で入力してください（わからなければ 0）" };
  if (values.energyKcal > DRAFT_LIMITS.maxEnergyKcal) return { field: "values", message: "カロリーが大きすぎます" };
  if (values.proteinG > DRAFT_LIMITS.maxMacroG || values.fatG > DRAFT_LIMITS.maxMacroG || values.carbsG > DRAFT_LIMITS.maxMacroG) {
    return { field: "values", message: "PFC の値が大きすぎます" };
  }
  return null;
}

/** 保存用（add_meal_items / 更新に渡す形） */
export function draftToPayload(draft: ItemDraft) {
  const amount = draftAmount(draft) ?? 0;
  const values = parsedValues(draft.valueTexts);
  // 入力欄の値が基準と食い違わないよう、保存時は「いまの量あたりの入力値」を基準にする
  // （量だけ変えた場合は元の基準のまま。基準から計算した値と入力欄の値は一致している）
  const basis =
    values && !sameNutrients(computeItemNutrients(draft.basis, amount), values)
      ? { unit: draft.basis.unit, refAmount: amount, ref: values }
      : draft.basis;
  return {
    name: draft.name.trim(),
    brand: draft.brand,
    origin: draft.origin,
    foodId: draft.foodId,
    fromPhoto: draft.fromPhoto,
    unit: basis.unit,
    refAmount: basis.refAmount,
    ref: basis.ref,
    amount,
    servingLabel: basis.unit === "serving" ? draft.servingLabel : null,
    servingWeightG: basis.unit === "serving" ? draft.servingWeightG : null,
  };
}

function sameNutrients(a: Nutrients, b: Nutrients): boolean {
  return NUTRIENT_KEYS.every((key) => Math.abs(a[key] - b[key]) < 1e-9);
}
