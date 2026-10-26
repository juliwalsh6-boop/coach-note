import { addDaysISO } from "@/lib/dates";
import { totalVolume } from "@/lib/format";
import { countDeviations } from "@/lib/set-targets";
import { computePersonalRecords, weekStats, type RecordSet, type WorkoutCelebrationData } from "@/lib/records";
import type {
  PreviousRecordMap,
  SessionDetail,
  SessionSummary,
  SetLog,
  WorkoutSession,
} from "@/types/app";
import type { DB } from "./db";

/** トレーニング開始（同じ日・同じメニューの実施中セッションがあればそれを返す） */
export async function startSession(db: DB, planId: string, localDate: string): Promise<string> {
  const { data, error } = await db.rpc("start_workout_session", { p_plan_id: planId, p_local_date: localDate });
  if (error) throw error;
  return data;
}

export async function getSessionDetail(db: DB, sessionId: string): Promise<SessionDetail | null> {
  const { data, error } = await db
    .from("workout_sessions")
    .select("*, session_exercises(*, set_logs(*))")
    .eq("id", sessionId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const { session_exercises, ...session } = data;
  const exercises = session_exercises
    .map(({ set_logs, ...exercise }) => ({
      ...exercise,
      sets: [...set_logs].sort((a, b) => a.set_number - b.set_number),
    }))
    .sort((a, b) => a.position - b.position);

  return { ...session, exercises };
}

/** 各種目の前回記録（exercise_key ごと） */
export async function getPreviousRecords(db: DB, sessionId: string): Promise<PreviousRecordMap> {
  const { data, error } = await db.rpc("get_previous_sets", { p_session_id: sessionId });
  if (error) throw error;

  const map: PreviousRecordMap = {};
  for (const row of data ?? []) {
    const record = (map[row.exercise_key] ??= { performedDate: row.performed_date, sets: [] });
    record.sets.push({ setNumber: row.set_number, weightKg: row.actual_weight_kg, reps: row.actual_reps });
  }
  return map;
}

export type SetPatch = {
  actual_weight_kg: number | null;
  actual_reps: number | null;
  completed_at: string | null;
};

/** セットの実績を保存（本人のみ・実績の列だけ更新できる） */
export async function updateSet(db: DB, setId: string, patch: SetPatch): Promise<SetLog> {
  const { data, error } = await db
    .from("set_logs")
    .update({
      actual_weight_kg: patch.actual_weight_kg,
      actual_reps: patch.actual_reps,
      completed_at: patch.completed_at,
    })
    .eq("id", setId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function addSet(db: DB, sessionExerciseId: string): Promise<SetLog> {
  const { data, error } = await db.rpc("add_set", { p_session_exercise_id: sessionExerciseId });
  if (error) throw error;
  return data;
}

export async function removeLastSet(db: DB, sessionExerciseId: string): Promise<string> {
  const { data, error } = await db.rpc("remove_last_set", { p_session_exercise_id: sessionExerciseId });
  if (error) throw error;
  return data;
}

export async function completeSession(db: DB, sessionId: string): Promise<void> {
  const { error } = await db.rpc("complete_workout_session", { p_session_id: sessionId });
  if (error) throw error;
}

export async function discardSession(db: DB, sessionId: string): Promise<void> {
  const { error } = await db.rpc("discard_workout_session", { p_session_id: sessionId });
  if (error) throw error;
}

/** 履歴一覧（新しい順） */
export async function listSessions(db: DB, clientId: string, limit = 30): Promise<SessionSummary[]> {
  const { data, error } = await db
    .from("workout_sessions")
    .select(
      "*, session_exercises(id), set_logs(actual_weight_kg, actual_reps, target_weight_kg, target_reps, completed_at)",
    )
    .eq("client_id", clientId)
    .order("performed_date", { ascending: false })
    .order("started_at", { ascending: false })
    .limit(limit);
  if (error) throw error;

  return (data ?? []).map(({ session_exercises, set_logs, ...session }) => ({
    ...session,
    exerciseCount: session_exercises.length,
    totalSets: set_logs.length,
    completedSets: set_logs.filter((s) => s.completed_at !== null).length,
    deviatedSets: countDeviations(set_logs),
    volumeKg: totalVolume(set_logs),
  }));
}

/** 指定日以降のセッション（ホーム画面で「実施中」「完了」を出すため） */
export async function listRecentSessions(db: DB, clientId: string, sinceDate: string): Promise<WorkoutSession[]> {
  const { data, error } = await db
    .from("workout_sessions")
    .select("*")
    .eq("client_id", clientId)
    .gte("performed_date", sinceDate)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type CelebrationInput = {
  sessionId: string;
  clientId: string;
  startedAt: string;
  today: string;
  /** 今回完了したセット（画面に出ている最新の状態） */
  current: (RecordSet & { name: string })[];
};

/**
 * トレーニング完了画面に出す情報（自己ベスト・今週の回数・連続週数）。
 * 自分の記録だけを読む（RLS で他人の記録は返らない）。
 */
export async function getWorkoutCelebration(db: DB, input: CelebrationInput): Promise<WorkoutCelebrationData> {
  const keys = [...new Set(input.current.map((s) => s.exerciseKey))];

  const [historyResult, countResult, datesResult] = await Promise.all([
    keys.length
      ? db
          .from("session_exercises")
          .select("exercise_key, workout_sessions!inner(started_at), set_logs(actual_weight_kg, actual_reps, completed_at)")
          .eq("client_id", input.clientId)
          .neq("session_id", input.sessionId)
          .in("exercise_key", keys)
      : Promise.resolve({ data: [], error: null }),
    db
      .from("workout_sessions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", input.clientId)
      .eq("status", "completed"),
    db
      .from("workout_sessions")
      .select("performed_date")
      .eq("client_id", input.clientId)
      .eq("status", "completed")
      .gte("performed_date", addDaysISO(input.today, -7 * 60))
      .order("performed_date", { ascending: false })
      .limit(1000),
  ]);
  if (historyResult.error) throw historyResult.error;
  if (countResult.error) throw countResult.error;
  if (datesResult.error) throw datesResult.error;

  const history: RecordSet[] = [];
  for (const row of historyResult.data ?? []) {
    if (row.workout_sessions.started_at >= input.startedAt) continue;
    for (const set of row.set_logs) {
      if (set.completed_at === null) continue;
      history.push({ exerciseKey: row.exercise_key, weightKg: set.actual_weight_kg, reps: set.actual_reps });
    }
  }

  const { thisWeek, weekStreak } = weekStats(
    (datesResult.data ?? []).map((row) => row.performed_date),
    input.today,
  );
  return {
    records: computePersonalRecords(input.current, history),
    totalWorkouts: countResult.count ?? 0,
    thisWeek,
    weekStreak,
  };
}
