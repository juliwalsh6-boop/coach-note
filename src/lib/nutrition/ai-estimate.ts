/**
 * 保存された AI の推定値（meal_items.ai_estimate）を表示用に読み取る。
 * 形式が想定と違う場合は null（表示しないだけで、記録の値には影響しない）。
 */
import type { Nutrients } from "./nutrients";

export type AiEstimateSummary = Nutrients & {
  name: string;
  weightG: number | null;
  confidence: "high" | "medium" | "low" | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function parseAiEstimate(value: unknown): AiEstimateSummary | null {
  if (!isRecord(value)) return null;
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const energyKcal = finite(value.energy_kcal);
  const proteinG = finite(value.protein_g);
  const fatG = finite(value.fat_g);
  const carbsG = finite(value.carbs_g);
  if (!name || energyKcal === null || proteinG === null || fatG === null || carbsG === null) return null;
  const confidence =
    value.confidence === "high" || value.confidence === "medium" || value.confidence === "low" ? value.confidence : null;
  return { name, energyKcal, proteinG, fatG, carbsG, weightG: finite(value.estimated_weight_g), confidence };
}

export const AI_CONFIDENCE_LABELS: Record<"high" | "medium" | "low", string> = {
  high: "確度 高",
  medium: "確度 中",
  low: "確度 低",
};
