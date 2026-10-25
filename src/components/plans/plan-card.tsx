import { relativeDateLabel } from "@/lib/dates";
import type { PlanSummary } from "@/types/app";

/** メニューの概要（種目名の一覧） */
export function PlanExerciseList({ plan, max = 5 }: { plan: PlanSummary; max?: number }) {
  const shown = plan.exercises.slice(0, max);
  const rest = plan.exercises.length - shown.length;
  return (
    <ol className="mt-3 space-y-1 text-sm">
      {shown.map((exercise, index) => (
        <li key={exercise.id} className="flex gap-2.5">
          <span className="num w-4 shrink-0 text-right text-ash">{index + 1}</span>
          <span className="min-w-0 truncate">{exercise.name}</span>
        </li>
      ))}
      {rest > 0 ? <li className="pl-6.5 text-ash">ほか{rest}種目</li> : null}
    </ol>
  );
}

export function planDateLabel(plan: Pick<PlanSummary, "scheduled_date">, today: string): string {
  return plan.scheduled_date ? relativeDateLabel(plan.scheduled_date, today) : "日付指定なし";
}
