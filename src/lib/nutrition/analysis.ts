/**
 * AI による食事写真の解析結果: 出力形式（JSON スキーマ）と検証。
 * AI の応答はそのまま使わず、必ず validateMealAnalysis を通す（範囲外・形式違いは保存させない）。
 */
import { energyFromMacros } from "./nutrients";
import { normalizeSearchText } from "./search";

export const ANALYSIS_LIMITS = {
  maxItems: 15,
  maxNameLength: 60,
  maxNoteLength: 200,
  maxWarnings: 8,
  maxWarningLength: 200,
  maxWeightG: 3000,
  maxEnergyKcal: 3000,
  maxProteinG: 300,
  maxFatG: 300,
  maxCarbsG: 600,
} as const;

export type AnalysisConfidence = "high" | "medium" | "low";
export type AnalysisItemKind = "dish" | "packaged" | "ingredient" | "drink";
export type AnalysisBasis = "visual_estimate" | "package_label" | "menu_reference";

export const CONFIDENCE_LABELS: Record<AnalysisConfidence, string> = {
  high: "推定の確度: 高",
  medium: "推定の確度: 中",
  low: "推定の確度: 低",
};

/** 画面で使う解析結果の 1 品 */
export type AnalyzedItem = {
  name: string;
  kind: AnalysisItemKind;
  estimatedWeightG: number | null;
  portionText: string;
  energyKcal: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  confidence: AnalysisConfidence;
  basis: AnalysisBasis;
  note: string;
  /** 検証で見つかった注意点 */
  flags: AnalyzedItemFlag[];
};

export type AnalyzedItemFlag = "energy_mismatch" | "possible_duplicate";

export type MealAnalysis = {
  isFoodPhoto: boolean;
  items: AnalyzedItem[];
  overallConfidence: AnalysisConfidence;
  warnings: string[];
};

/**
 * Claude API の構造化出力（output_config.format）に渡す JSON スキーマ。
 * 数値の範囲（minimum / maximum）は API が対応していないため、validateMealAnalysis で確認する。
 */
export const MEAL_ANALYSIS_SCHEMA = {
  type: "object",
  properties: {
    is_food_photo: { type: "boolean", description: "食事・食品・飲み物が写っているか" },
    items: {
      type: "array",
      description: "写っている食品・料理。1 つの料理は 1 項目にまとめ、同じ物を二重に数えない",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "日本語の料理名・商品名（例: 鶏の唐揚げ、白ごはん）" },
          kind: { type: "string", enum: ["dish", "packaged", "ingredient", "drink"] },
          estimated_weight_g: {
            anyOf: [{ type: "number" }, { type: "null" }],
            description: "食べる部分の推定重量（g）。判断できなければ null",
          },
          portion_text: { type: "string", description: "量の目安（例: 茶碗1杯、5個、1パック）" },
          energy_kcal: { type: "number" },
          protein_g: { type: "number" },
          fat_g: { type: "number" },
          carbs_g: { type: "number" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          basis: { type: "string", enum: ["visual_estimate", "package_label", "menu_reference"] },
          note: { type: "string", description: "推定の前提（油・ソース・見えない具材など）。無ければ空文字" },
        },
        required: [
          "name",
          "kind",
          "estimated_weight_g",
          "portion_text",
          "energy_kcal",
          "protein_g",
          "fat_g",
          "carbs_g",
          "confidence",
          "basis",
          "note",
        ],
        additionalProperties: false,
      },
    },
    overall_confidence: { type: "string", enum: ["high", "medium", "low"] },
    warnings: {
      type: "array",
      items: { type: "string" },
      description: "利用者に伝えるべき注意（量が判断しにくい、一部が隠れている など）",
    },
  },
  required: ["is_food_photo", "items", "overall_confidence", "warnings"],
  additionalProperties: false,
} as const;

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[]): T | null {
  if (typeof value !== "string") return null;
  // 大文字・小文字の揺れは許す（構造化出力でも起こりうる）
  const lower = value.trim().toLowerCase();
  return allowed.find((a) => a === lower) ?? null;
}

function finiteInRange(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value < min || value > max) return null;
  return value;
}

function cleanText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** PFC から計算したカロリーと、AI のカロリーが大きく食い違うか */
export function hasEnergyMismatch(item: Pick<AnalyzedItem, "energyKcal" | "proteinG" | "fatG" | "carbsG">): boolean {
  const fromMacros = energyFromMacros(item);
  const diff = Math.abs(item.energyKcal - fromMacros);
  return diff > Math.max(60, 0.3 * Math.max(item.energyKcal, fromMacros));
}

/**
 * AI の応答を検証して、画面で使える形にする。
 * 形式違い・範囲外の値が 1 つでもあれば ok: false（保存させない）。
 */
export function validateMealAnalysis(raw: unknown): ValidationResult<MealAnalysis> {
  if (!isRecord(raw)) return { ok: false, reason: "not_object" };
  if (typeof raw.is_food_photo !== "boolean") return { ok: false, reason: "is_food_photo" };
  if (!Array.isArray(raw.items)) return { ok: false, reason: "items" };
  if (raw.items.length > ANALYSIS_LIMITS.maxItems) return { ok: false, reason: "too_many_items" };
  const overall = enumValue(raw.overall_confidence, ["high", "medium", "low"] as const);
  if (!overall) return { ok: false, reason: "overall_confidence" };
  if (!Array.isArray(raw.warnings)) return { ok: false, reason: "warnings" };

  const items: AnalyzedItem[] = [];
  const seen = new Set<string>();
  for (const [index, entry] of raw.items.entries()) {
    if (!isRecord(entry)) return { ok: false, reason: `item_${index}` };
    const name = cleanText(entry.name, ANALYSIS_LIMITS.maxNameLength);
    if (!name) return { ok: false, reason: `item_${index}_name` };
    const kind = enumValue(entry.kind, ["dish", "packaged", "ingredient", "drink"] as const);
    const confidence = enumValue(entry.confidence, ["high", "medium", "low"] as const);
    const basis = enumValue(entry.basis, ["visual_estimate", "package_label", "menu_reference"] as const);
    if (!kind || !confidence || !basis) return { ok: false, reason: `item_${index}_enum` };

    let weight: number | null = null;
    if (entry.estimated_weight_g !== null) {
      weight = finiteInRange(entry.estimated_weight_g, 1, ANALYSIS_LIMITS.maxWeightG);
      if (weight === null) return { ok: false, reason: `item_${index}_weight` };
    }
    const energy = finiteInRange(entry.energy_kcal, 0, ANALYSIS_LIMITS.maxEnergyKcal);
    const protein = finiteInRange(entry.protein_g, 0, ANALYSIS_LIMITS.maxProteinG);
    const fat = finiteInRange(entry.fat_g, 0, ANALYSIS_LIMITS.maxFatG);
    const carbs = finiteInRange(entry.carbs_g, 0, ANALYSIS_LIMITS.maxCarbsG);
    if (energy === null || protein === null || fat === null || carbs === null) {
      return { ok: false, reason: `item_${index}_nutrients` };
    }
    const portionText = cleanText(entry.portion_text, 40) ?? "";
    const note = cleanText(entry.note, ANALYSIS_LIMITS.maxNoteLength) ?? "";

    const item: AnalyzedItem = {
      name,
      kind,
      estimatedWeightG: weight === null ? null : Math.round(weight),
      portionText,
      energyKcal: Math.round(energy),
      proteinG: round1(protein),
      fatG: round1(fat),
      carbsG: round1(carbs),
      confidence,
      basis,
      note,
      flags: [],
    };
    if (hasEnergyMismatch(item)) item.flags.push("energy_mismatch");
    const key = normalizeSearchText(name);
    if (seen.has(key)) item.flags.push("possible_duplicate");
    seen.add(key);
    items.push(item);
  }

  const warnings = raw.warnings
    .map((w) => cleanText(w, ANALYSIS_LIMITS.maxWarningLength))
    .filter((w): w is string => Boolean(w))
    .slice(0, ANALYSIS_LIMITS.maxWarnings);

  return { ok: true, value: { isFoodPhoto: raw.is_food_photo, items, overallConfidence: overall, warnings } };
}

/** 保存用: AI の推定値のスナップショット（meal_items.ai_estimate） */
export function toAiEstimate(item: AnalyzedItem, meta: { model: string; analyzedAt: string }) {
  return {
    name: item.name,
    estimated_weight_g: item.estimatedWeightG,
    portion_text: item.portionText,
    energy_kcal: item.energyKcal,
    protein_g: item.proteinG,
    fat_g: item.fatG,
    carbs_g: item.carbsG,
    confidence: item.confidence,
    basis: item.basis,
    note: item.note,
    flags: item.flags,
    model: meta.model,
    analyzed_at: meta.analyzedAt,
  };
}
