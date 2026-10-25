import { addDaysISO } from "./dates";

// トレーニング完了時に出す「自己ベスト」「今週の回数」「連続週数」の計算（画面やDBに依存しない純粋な関数）

export type RecordSet = {
  exerciseKey: string;
  weightKg: number | null;
  reps: number | null;
};

export type PersonalRecord = {
  exerciseKey: string;
  name: string;
  /** weight: 最高重量を更新 / reps: 同じ重量（または自重）での最高回数を更新 */
  kind: "weight" | "reps";
  /** null は自重 */
  weightKg: number | null;
  reps: number;
  previousWeightKg: number | null;
  previousReps: number | null;
};

export type WorkoutCelebrationData = {
  records: PersonalRecord[];
  /** 完了したトレーニングの通算回数（今回を含む） */
  totalWorkouts: number;
  /** 今週（月曜はじまり）の回数（今回を含む） */
  thisWeek: number;
  /** トレーニングした週が何週続いているか（今週を含む） */
  weekStreak: number;
};

function lifted(weight: number | null): number | null {
  return weight != null && weight > 0 ? weight : null;
}

function maxReps(sets: RecordSet[]): number {
  return Math.max(...sets.map((s) => s.reps ?? 0));
}

/**
 * 今回のセットと、それより前の記録を比べて自己ベストを出す。
 * 初めての種目は比べる相手がいないので対象外。
 */
export function computePersonalRecords(current: (RecordSet & { name: string })[], history: RecordSet[]): PersonalRecord[] {
  const groups = new Map<string, { name: string; sets: RecordSet[] }>();
  for (const set of current) {
    if (!set.reps || set.reps <= 0) continue;
    const group = groups.get(set.exerciseKey) ?? { name: set.name, sets: [] };
    group.sets.push(set);
    groups.set(set.exerciseKey, group);
  }

  const records: PersonalRecord[] = [];
  for (const [key, { name, sets }] of groups) {
    const past = history.filter((h) => h.exerciseKey === key && h.reps != null && h.reps > 0);
    if (past.length === 0) continue;

    const weighted = sets.filter((s) => lifted(s.weightKg) !== null);
    const pastWeighted = past.filter((s) => lifted(s.weightKg) !== null);
    if (weighted.length > 0 && pastWeighted.length > 0) {
      const top = Math.max(...weighted.map((s) => s.weightKg as number));
      const previousTop = Math.max(...pastWeighted.map((s) => s.weightKg as number));
      const repsAtTop = maxReps(weighted.filter((s) => s.weightKg === top));
      if (top > previousTop) {
        records.push({ exerciseKey: key, name, kind: "weight", weightKg: top, reps: repsAtTop, previousWeightKg: previousTop, previousReps: null });
      } else if (top === previousTop) {
        const previousReps = maxReps(pastWeighted.filter((s) => s.weightKg === top));
        if (repsAtTop > previousReps) {
          records.push({ exerciseKey: key, name, kind: "reps", weightKg: top, reps: repsAtTop, previousWeightKg: top, previousReps });
        }
      }
      continue;
    }

    const bodyweight = sets.filter((s) => lifted(s.weightKg) === null);
    const pastBodyweight = past.filter((s) => lifted(s.weightKg) === null);
    if (bodyweight.length > 0 && pastBodyweight.length > 0) {
      const reps = maxReps(bodyweight);
      const previousReps = maxReps(pastBodyweight);
      if (reps > previousReps) {
        records.push({ exerciseKey: key, name, kind: "reps", weightKg: null, reps, previousWeightKg: null, previousReps });
      }
    }
  }
  return records;
}

/** その日を含む週の月曜日 */
export function weekStartOf(dateISO: string): string {
  const [year, month, day] = dateISO.split("-").map(Number) as [number, number, number];
  const dayOfWeek = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0 = 日曜
  return addDaysISO(dateISO, -((dayOfWeek + 6) % 7));
}

/** 完了したトレーニングの日付一覧から、今週の回数と連続週数を出す */
export function weekStats(dates: string[], today: string): { thisWeek: number; weekStreak: number } {
  const currentWeek = weekStartOf(today);
  const weeks = new Set(dates.map(weekStartOf));
  const thisWeek = dates.filter((d) => d <= today && weekStartOf(d) === currentWeek).length;
  // 今週まだ1回もなければ、先週までの連続を数える（週が終わるまでは途切れていない扱い）
  let cursor = weeks.has(currentWeek) ? currentWeek : addDaysISO(currentWeek, -7);
  let weekStreak = 0;
  while (weeks.has(cursor)) {
    weekStreak += 1;
    cursor = addDaysISO(cursor, -7);
  }
  return { thisWeek, weekStreak };
}
