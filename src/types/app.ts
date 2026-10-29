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

// ---------------------------------------------------------------------
// 食事管理
// ---------------------------------------------------------------------
export type NutritionTarget = Tables<"nutrition_targets">;
export type FoodRow = Tables<"foods">;
export type Meal = Tables<"meals">;
export type MealItem = Tables<"meal_items">;
export type MealPhoto = Tables<"meal_photos">;
export type MealComment = Tables<"meal_comments">;
export type NutritionDayRow = FunctionReturns<"get_nutrition_days">[number];
export type NutritionOverviewRow = FunctionReturns<"get_trainer_nutrition_overview">[number];

/** 食事 1 回分（食べたもの・写真・コメントつき） */
export type MealWithDetails = Meal & {
  items: MealItem[];
  photos: MealPhoto[];
  comments: MealComment[];
};

/** 食事へのコメント（コメント画面用に、食事の日付・区分つき） */
export type MealCommentWithMeal = MealComment & {
  meal: Pick<Meal, "id" | "eaten_on" | "meal_type">;
};
