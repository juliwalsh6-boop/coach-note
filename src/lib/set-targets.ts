import type { PlanExercise, SessionExerciseWithSets } from "@/types/app";
import type { Json } from "@/types/database";
import { formatKg, formatTarget } from "./format";

/** 1セット分の目標（weightKg が null = 自重など） */
export type SetTarget = { weightKg: number | null; reps: number };

/** DB に保存する形（plan_exercises.set_targets / save_workout_plan の sets） */
export type SetTargetJson = { weight_kg: number | null; reps: number };

/** 1種目あたりのセット数の上限（DB の制約と同じ） */
export const MAX_SETS_PER_EXERCISE = 20;

export function toSetTargetJson(targets: readonly SetTarget[]): SetTargetJson[] {
  return targets.map((t) => ({ weight_kg: t.weightKg, reps: t.reps }));
}

/** plan_exercises.set_targets（JSON）を検証して取り出す。形式が違えば null */
export function parseSetTargets(value: Json | null | undefined): SetTarget[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_SETS_PER_EXERCISE) return null;
  const targets: SetTarget[] = [];
  for (const item of value) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) return null;
    const reps = item.reps;
    const weight = item.weight_kg;
    if (typeof reps !== "number" || !Number.isInteger(reps)) return null;
    if (weight !== undefined && weight !== null && typeof weight !== "number") return null;
    targets.push({ weightKg: typeof weight === "number" ? weight : null, reps });
  }
  return targets;
}

/** 同じ目標を count セット分 */
export function uniformTargets(target: SetTarget, count: number): SetTarget[] {
  const safe = Math.max(1, Math.min(MAX_SETS_PER_EXERCISE, Math.trunc(count)));
  return Array.from({ length: safe }, () => ({ ...target }));
}

/** メニューの種目のセットごとの目標。set_targets が無い（以前に作った）種目は全セット同じとして扱う */
export function planSetTargets(
  exercise: Pick<PlanExercise, "set_targets" | "target_weight_kg" | "target_reps" | "target_sets">,
): SetTarget[] {
  return (
    parseSetTargets(exercise.set_targets) ??
    uniformTargets({ weightKg: exercise.target_weight_kg, reps: exercise.target_reps }, exercise.target_sets)
  );
}

type TargetLike = { weightKg: number | null; reps: number | null };

/** 全セットの重量・回数が同じか */
export function isUniform(targets: readonly TargetLike[]): boolean {
  const [first, ...rest] = targets;
  return first === undefined || rest.every((t) => t.weightKg === first.weightKg && t.reps === first.reps);
}

/**
 * 目標の要約。
 * - 全セット同じ: 80kg × 8回 × 3セット
 * - セットごとに違う: 60〜70kg × 6〜10回 × 3セット
 */
export function formatTargetSummary(targets: readonly TargetLike[], setCount: number = targets.length): string {
  const first = targets[0];
  if (!first) return "";
  if (isUniform(targets)) return formatTarget(first.weightKg, first.reps, setCount);
  return [formatWeightRange(targets), formatRepsRange(targets), `${setCount}セット`]
    .filter((part): part is string => part !== null)
    .join(" × ");
}

function formatWeightRange(targets: readonly TargetLike[]): string {
  const weights = targets.map((t) => t.weightKg).filter((w): w is number => w !== null);
  if (weights.length === 0) return "自重";
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  if (weights.length < targets.length) return `自重〜${formatKg(max)}kg`;
  return min === max ? `${formatKg(min)}kg` : `${formatKg(min)}〜${formatKg(max)}kg`;
}

function formatRepsRange(targets: readonly TargetLike[]): string | null {
  const reps = targets.map((t) => t.reps).filter((r): r is number => r !== null);
  if (reps.length === 0) return null;
  const min = Math.min(...reps);
  const max = Math.max(...reps);
  return min === max ? `${min}回` : `${min}〜${max}回`;
}

/** 記録画面・履歴の見出し用の目標（予定していたセットの目標から作る） */
export function sessionTargetSummary(exercise: SessionExerciseWithSets): string {
  const planned = exercise.sets
    .filter((s) => s.set_number <= exercise.target_sets)
    .map((s) => ({ weightKg: s.target_weight_kg, reps: s.target_reps }));
  if (planned.length === 0) {
    return formatTarget(exercise.target_weight_kg, exercise.target_reps, exercise.target_sets);
  }
  return formatTargetSummary(planned, exercise.target_sets);
}
