import type { FunctionReturns, Tables } from "./database";

export type AppRole = "trainer" | "client";

export type Profile = Omit<Tables<"profiles">, "role"> & { role: AppRole };
export type Checkin = Tables<"checkins">;
export type WorkoutPlan = Tables<"workout_plans">;
export type PlanExercise = Tables<"plan_exercises">;
export type WorkoutSession = Tables<"workout_sessions">;
export type SessionExercise = Tables<"session_exercises">;
export type SetLog = Tables<"set_logs">;
export type TrainerComment = Tables<"trainer_comments">;
export type ClientInvite = Tables<"client_invites">;

export type DashboardRow = FunctionReturns<"get_trainer_dashboard">[number];
export type PreviousSetRow = FunctionReturns<"get_previous_sets">[number];

export type SessionStatus = "in_progress" | "completed";

export function isAppRole(value: unknown): value is AppRole {
  return value === "trainer" || value === "client";
}

export function toProfile(row: Tables<"profiles">): Profile | null {
  return isAppRole(row.role) ? { ...row, role: row.role } : null;
}

/** メニュー一覧用 */
export type PlanSummary = WorkoutPlan & {
  exercises: Pick<PlanExercise, "id" | "name" | "position">[];
};

/** メニュー編集用 */
export type PlanWithExercises = WorkoutPlan & {
  exercises: PlanExercise[];
};

/** トレーニング記録画面・詳細画面用 */
export type SessionExerciseWithSets = SessionExercise & {
  sets: SetLog[];
};

export type SessionDetail = WorkoutSession & {
  exercises: SessionExerciseWithSets[];
};

/** 履歴一覧用 */
export type SessionSummary = WorkoutSession & {
  exerciseCount: number;
  completedSets: number;
  totalSets: number;
  /** 目標と違う重量・回数で行ったセットの数 */
  deviatedSets: number;
  volumeKg: number;
};

/** 前回記録（exercise_key ごと） */
export type PreviousRecord = {
  performedDate: string;
  sets: { setNumber: number; weightKg: number | null; reps: number | null }[];
};
export type PreviousRecordMap = Record<string, PreviousRecord>;
