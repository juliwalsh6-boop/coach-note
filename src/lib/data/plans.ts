import { toSetTargetJson, type SetTarget } from "@/lib/set-targets";
import type { PlanSummary, PlanWithExercises } from "@/types/app";
import type { DB } from "./db";

export type PlanExerciseInput = {
  /** 既存の種目なら id（並べ替えても記録の紐づけを保つため） */
  id: string | null;
  name: string;
  /** セットごとの目標（配列の長さ = セット数、1〜20） */
  sets: SetTarget[];
  rest_seconds: number;
  note: string | null;
};

export type PlanInput = {
  planId: string | null;
  clientId: string;
  title: string;
  scheduledDate: string | null;
  note: string | null;
  /** 配列の順番がそのまま種目の並び順になる */
  exercises: PlanExerciseInput[];
};

export async function listPlansForClient(db: DB, clientId: string): Promise<PlanSummary[]> {
  const { data, error } = await db
    .from("workout_plans")
    .select("*, plan_exercises(id, name, position)")
    .eq("client_id", clientId)
    .order("scheduled_date", { ascending: false, nullsFirst: true })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map(({ plan_exercises, ...plan }) => ({
    ...plan,
    exercises: [...plan_exercises].sort((a, b) => a.position - b.position),
  }));
}

export async function getPlanWithExercises(db: DB, planId: string): Promise<PlanWithExercises | null> {
  const { data, error } = await db
    .from("workout_plans")
    .select("*, plan_exercises(*)")
    .eq("id", planId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { plan_exercises, ...plan } = data;
  return { ...plan, exercises: [...plan_exercises].sort((a, b) => a.position - b.position) };
}

/** メニューと種目をまとめて保存（新規なら作成）。保存したメニューの id を返す */
export async function savePlan(db: DB, input: PlanInput): Promise<string> {
  const exercises = input.exercises.map((e) => {
    const first = e.sets[0];
    return {
      id: e.id,
      name: e.name,
      sets: toSetTargetJson(e.sets),
      // 1 セット目の値とセット数（一覧表示用。DB 側でも sets から同じ値を入れ直す）
      target_weight_kg: first?.weightKg ?? null,
      target_reps: first?.reps ?? 0,
      target_sets: e.sets.length,
      rest_seconds: e.rest_seconds,
      note: e.note,
    };
  });
  const { data, error } = await db.rpc("save_workout_plan", {
    p_plan_id: input.planId,
    p_client_id: input.clientId,
    p_title: input.title,
    p_scheduled_date: input.scheduledDate,
    p_note: input.note,
    p_exercises: exercises,
  });
  if (error) throw error;
  return data;
}

export async function deletePlan(db: DB, planId: string): Promise<void> {
  const { error } = await db.from("workout_plans").delete().eq("id", planId);
  if (error) throw error;
}

/** メニュー作成画面の種目名の候補（過去に使った種目名） */
export async function getExerciseSuggestions(db: DB): Promise<string[]> {
  const { data, error } = await db.rpc("get_exercise_name_suggestions");
  if (error) throw error;
  return (data ?? []).map((row) => row.name);
}
