import { NUTRIENT_DIGITS, type NutrientKey, type Nutrients } from "./nutrients";

export const NUTRIENT_LABELS: Record<NutrientKey, string> = {
  energyKcal: "カロリー",
  proteinG: "たんぱく質",
  fatG: "脂質",
  carbsG: "炭水化物",
};

/** 1 文字の略記（P / F / C） */
export const NUTRIENT_SHORT: Record<NutrientKey, string> = {
  energyKcal: "kcal",
  proteinG: "P",
  fatG: "F",
  carbsG: "C",
};

export const NUTRIENT_UNITS: Record<NutrientKey, string> = {
  energyKcal: "kcal",
  proteinG: "g",
  fatG: "g",
  carbsG: "g",
};

const kcalFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 0 });
const gramFormat = new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1, minimumFractionDigits: 0 });

/** 1234 → "1,234" */
export function formatKcal(value: number): string {
  return kcalFormat.format(Math.round(value));
}

/** 23.0 → "23" / 23.45 → "23.5"（小数第 1 位まで。保存値と同じ桁） */
export function formatGram(value: number): string {
  return gramFormat.format(Math.round(value * 10) / 10);
}

export function formatNutrient(key: NutrientKey, value: number): string {
  return NUTRIENT_DIGITS[key] === 0 ? formatKcal(value) : formatGram(value);
}

export function formatNutrientWithUnit(key: NutrientKey, value: number): string {
  return `${formatNutrient(key, value)}${NUTRIENT_UNITS[key]}`;
}

/** P 23.5 · F 12 · C 80.2 */
export function formatPfc(values: Nutrients): string {
  return `P ${formatGram(values.proteinG)} · F ${formatGram(values.fatG)} · C ${formatGram(values.carbsG)}`;
}

/** 残りの表示（マイナスは「超過」） */
export function formatRemaining(key: NutrientKey, remaining: number): { text: string; over: boolean } {
  if (remaining < 0) {
    return { text: `${formatNutrient(key, -remaining)}${NUTRIENT_UNITS[key]} 超過`, over: true };
  }
  return { text: `あと ${formatNutrient(key, remaining)}${NUTRIENT_UNITS[key]}`, over: false };
}

/** +12.3g / −4g（0 は ±0） */
export function formatSignedNutrient(key: NutrientKey, diff: number): string {
  const rounded = NUTRIENT_DIGITS[key] === 0 ? Math.round(diff) : Math.round(diff * 10) / 10;
  if (rounded === 0) return `±0${NUTRIENT_UNITS[key]}`;
  const sign = rounded > 0 ? "+" : "−";
  return `${sign}${formatNutrient(key, Math.abs(rounded))}${NUTRIENT_UNITS[key]}`;
}
