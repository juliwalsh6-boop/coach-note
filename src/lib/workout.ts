import { formatKg } from "./format";
import type { SessionExerciseWithSets, SetLog } from "@/types/app";

export type SetRef = { exercise: SessionExerciseWithSets; set: SetLog };

export function isSetDone(set: Pick<SetLog, "completed_at">): boolean {
  return set.completed_at !== null;
}

export function countProgress(exercises: SessionExerciseWithSets[]): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      total += 1;
      if (isSetDone(set)) done += 1;
    }
  }
  return { done, total };
}

/** 全種目を順番に並べたセット一覧 */
export function flattenSets(exercises: SessionExerciseWithSets[]): SetRef[] {
  return exercises.flatMap((exercise) => exercise.sets.map((set) => ({ exercise, set })));
}

export function firstPendingSet(exercises: SessionExerciseWithSets[]): SetRef | null {
  return flattenSets(exercises).find((ref) => !isSetDone(ref.set)) ?? null;
}

/** 指定セットの次に行う未完了セット（後ろを優先し、なければ前に戻って探す） */
export function nextPendingSet(exercises: SessionExerciseWithSets[], afterSetId: string): SetRef | null {
  const all = flattenSets(exercises);
  const index = all.findIndex((ref) => ref.set.id === afterSetId);
  const ordered = index === -1 ? all : [...all.slice(index + 1), ...all.slice(0, index)];
  return ordered.find((ref) => !isSetDone(ref.set)) ?? null;
}

export type SetDraft = { weight: string; reps: string };

/**
 * 入力欄の初期値: 完了済みなら実績、未完了なら目標。
 * 直前に終えたセットとコーチの目標重量が同じなら、そのセットで実際に使った重量を引き継ぐ
 * （セットごとに重量を変える指示のときは、指示どおりの重量を出す）。
 */
export function draftFor(exercise: SessionExerciseWithSets, set: SetLog): SetDraft {
  if (isSetDone(set)) {
    return {
      weight: set.actual_weight_kg == null ? "" : formatKg(set.actual_weight_kg),
      reps: set.actual_reps == null ? "" : String(set.actual_reps),
    };
  }
  const previousDone = [...exercise.sets]
    .filter((s) => s.set_number < set.set_number && isSetDone(s))
    .sort((a, b) => b.set_number - a.set_number)[0];
  const carry = previousDone !== undefined && previousDone.target_weight_kg === set.target_weight_kg;
  const weight = carry ? previousDone.actual_weight_kg : set.target_weight_kg;
  return {
    weight: weight == null ? "" : formatKg(weight),
    reps: set.target_reps == null ? "" : String(set.target_reps),
  };
}

export function buildDrafts(exercises: SessionExerciseWithSets[]): Record<string, SetDraft> {
  const drafts: Record<string, SetDraft> = {};
  for (const exercise of exercises) {
    for (const set of exercise.sets) {
      drafts[set.id] = draftFor(exercise, set);
    }
  }
  return drafts;
}

/** ステッパーで値を増減（小数第2位で丸め、0未満にはしない） */
export function stepValue(current: string, delta: number, fallback: number): string {
  const parsed = Number(current.replace(",", "."));
  const base = current.trim() === "" || Number.isNaN(parsed) ? fallback : parsed;
  const next = Math.max(0, Math.round((base + delta) * 100) / 100);
  return formatKg(next);
}
