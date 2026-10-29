/**
 * トレーナーの「栄養目標」フォームの入力チェックと初期値（画面から切り離してテストできるようにする）。
 * 値の範囲は DB（nutrition_targets の check 制約・save_nutrition_target）と合わせる。
 */
import { addDaysISO, isValidISODate } from "@/lib/dates";
import { parseNumberInput, numberText } from "./draft";
import { NUTRIENT_KEYS, defaultTolerance, energyFromMacros, type NutrientKey, type Nutrients } from "./nutrients";
import type { TargetValues } from "./rows";

export type TargetFormValues = {
  effectiveFrom: string;
  target: Record<NutrientKey, string>;
  /** 空欄なら目標の ±10% 前後（defaultTolerance）を使う */
  tolerance: Record<NutrientKey, string>;
  note: string;
};

export type TargetFormField = "effectiveFrom" | `target.${NutrientKey}` | `tolerance.${NutrientKey}` | "note";

export type TargetFormResult =
  | { ok: true; effectiveFrom: string; target: Nutrients; tolerance: Nutrients; note: string | null; toleranceAuto: NutrientKey[] }
  | { ok: false; errors: Partial<Record<TargetFormField, string>> };

/** 目標値の範囲（DB の check 制約と同じ） */
export const TARGET_RANGE: Record<NutrientKey, { min: number; max: number }> = {
  energyKcal: { min: 500, max: 10000 },
  proteinG: { min: 0, max: 1000 },
  fatG: { min: 0, max: 1000 },
  carbsG: { min: 0, max: 1500 },
};

/** 許容範囲（±）の上限 */
export const TOLERANCE_MAX: Record<NutrientKey, number> = {
  energyKcal: 2000,
  proteinG: 500,
  fatG: 500,
  carbsG: 500,
};

export const NOTE_MAX = 500;

/** 適用開始日として選べる最後の日（今日から何日先まで） */
export const MAX_DAYS_AHEAD = 365;

const EMPTY_TEXTS: Record<NutrientKey, string> = { energyKcal: "", proteinG: "", fatG: "", carbsG: "" };

function textsOf(values: Nutrients): Record<NutrientKey, string> {
  return {
    energyKcal: numberText(values.energyKcal),
    proteinG: numberText(values.proteinG),
    fatG: numberText(values.fatG),
    carbsG: numberText(values.carbsG),
  };
}

/** フォームの初期値: いまの目標があればそれを引き継ぎ、適用開始日は今日 */
export function initialTargetForm(current: TargetValues | null, today: string): TargetFormValues {
  return {
    effectiveFrom: today,
    target: current ? textsOf(current.target) : { ...EMPTY_TEXTS },
    tolerance: current ? textsOf(current.tolerance) : { ...EMPTY_TEXTS },
    note: "",
  };
}

/**
 * 数字の入力を読む。「2,200」のような 3 桁区切りはカンマを取り除く（それ以外は食事の量の入力と同じ読み方）
 */
export function parseTargetNumber(input: string): number | null {
  const digits = input.trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
  if (/^\d{1,3}([,，]\d{3})+(\.\d+)?$/.test(digits)) return Number(digits.replace(/[,，]/g, ""));
  return parseNumberInput(input);
}

function formatLimit(value: number): string {
  return value.toLocaleString("ja-JP");
}

/** 小数第 1 位まで（カロリーは整数）に丸める。DB と同じ桁 */
function roundFor(key: NutrientKey, value: number): number {
  return key === "energyKcal" ? Math.round(value) : Math.round(value * 10) / 10;
}

/**
 * 入力をチェックして、保存する値にする。
 *   - 適用開始日は今日〜1 年先（過去の日の目標は変えない）
 *   - 許容範囲が空欄の栄養素は、目標から自動で決める（toleranceAuto に入る）
 */
export function validateTargetForm(values: TargetFormValues, today: string): TargetFormResult {
  const errors: Partial<Record<TargetFormField, string>> = {};

  if (!isValidISODate(values.effectiveFrom)) {
    errors.effectiveFrom = "適用開始日を選んでください";
  } else if (values.effectiveFrom < today) {
    errors.effectiveFrom = "過去の日付は選べません（過去の日の目標は変更しません）";
  } else if (values.effectiveFrom > addDaysISO(today, MAX_DAYS_AHEAD)) {
    errors.effectiveFrom = "1 年以内の日付を選んでください";
  }

  const target: Nutrients = { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  for (const key of NUTRIENT_KEYS) {
    const parsed = parseTargetNumber(values.target[key]);
    const range = TARGET_RANGE[key];
    if (parsed === null) {
      errors[`target.${key}`] = "入力してください";
    } else if (Number.isNaN(parsed) || parsed < range.min || parsed > range.max) {
      errors[`target.${key}`] = `${formatLimit(range.min)}〜${formatLimit(range.max)} の数字で入力してください`;
    } else {
      target[key] = roundFor(key, parsed);
    }
  }

  const tolerance: Nutrients = { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 };
  const auto = defaultTolerance(target);
  const toleranceAuto: NutrientKey[] = [];
  for (const key of NUTRIENT_KEYS) {
    const parsed = parseTargetNumber(values.tolerance[key]);
    if (parsed === null) {
      tolerance[key] = auto[key];
      toleranceAuto.push(key);
    } else if (Number.isNaN(parsed) || parsed < 0 || parsed > TOLERANCE_MAX[key]) {
      errors[`tolerance.${key}`] = `0〜${formatLimit(TOLERANCE_MAX[key])} の数字で入力してください`;
    } else {
      tolerance[key] = roundFor(key, parsed);
    }
  }

  const note = values.note.trim();
  if (note.length > NOTE_MAX) errors.note = `${NOTE_MAX} 文字以内で入力してください`;

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, effectiveFrom: values.effectiveFrom, target, tolerance, note: note || null, toleranceAuto };
}

/**
 * P・F・C から計算したカロリー（4・9・4 kcal/g）と、目標カロリーの差。
 * 差が大きいとき（50kcal かつ 5% を超える）は画面で注意を出す。保存は止めない。
 */
export function macroEnergyCheck(target: Partial<Nutrients>): { macroKcal: number; diff: number; mismatch: boolean } | null {
  const { energyKcal, proteinG, fatG, carbsG } = target;
  if (energyKcal == null || proteinG == null || fatG == null || carbsG == null) return null;
  if (![energyKcal, proteinG, fatG, carbsG].every(Number.isFinite)) return null;
  const macroKcal = Math.round(energyFromMacros({ proteinG, fatG, carbsG }));
  const diff = macroKcal - energyKcal;
  return { macroKcal, diff, mismatch: Math.abs(diff) > Math.max(50, energyKcal * 0.05) };
}

/** 入力途中の文字列から数値を取り出す（不正な値は undefined） */
export function parsedTargetTexts(texts: Record<NutrientKey, string>): Partial<Nutrients> {
  const result: Partial<Nutrients> = {};
  for (const key of NUTRIENT_KEYS) {
    const parsed = parseTargetNumber(texts[key]);
    if (parsed !== null && !Number.isNaN(parsed)) result[key] = parsed;
  }
  return result;
}

/** 体重あたりのたんぱく質（g/kg）。体重が無いときは null */
export function proteinPerKg(proteinG: number | undefined, bodyWeightKg: number | null): number | null {
  if (proteinG == null || bodyWeightKg == null || bodyWeightKg <= 0) return null;
  return Math.round((proteinG / bodyWeightKg) * 10) / 10;
}
