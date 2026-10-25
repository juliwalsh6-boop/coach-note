import { cn } from "@/lib/cn";
import { formatDateLong, formatDuration, formatTime, minutesBetween } from "@/lib/dates";
import { SetText } from "@/components/ui/set-text";
import { formatKg, formatNumber, formatRest, formatSet, formatTarget, totalVolume } from "@/lib/format";
import { countProgress, isSetDone } from "@/lib/workout";
import type { SessionDetail, SetLog } from "@/types/app";

/** トレーニング 1 回分の結果（目標と実績を並べて表示） */
export function SessionView({ session }: { session: SessionDetail }) {
  const progress = countProgress(session.exercises);
  const volume = totalVolume(session.exercises.flatMap((e) => e.sets));
  const completed = session.status === "completed";
  const duration =
    completed && session.completed_at ? formatDuration(minutesBetween(session.started_at, session.completed_at)) : null;

  return (
    <div className="space-y-4">
      <section className="panel p-5">
        <p className="text-sm text-ash">{formatDateLong(session.performed_date)}</p>
        <h2 className="mt-0.5 text-xl font-bold">{session.title}</h2>
        <dl className="mt-4 grid grid-cols-3 gap-2 text-center">
          <Stat label="セット" value={`${progress.done}/${progress.total}`} />
          <Stat label="総挙上量" value={`${formatNumber(volume)}`} unit="kg" />
          <Stat label="時間" value={duration ?? (completed ? "—" : "実施中")} />
        </dl>
        <p className="mt-3 text-xs text-ash">
          開始 {formatTime(session.started_at)}
          {session.completed_at ? ` 〜 完了 ${formatTime(session.completed_at)}` : ""}
        </p>
      </section>

      {session.exercises.map((exercise, index) => (
        <section key={exercise.id} className="panel overflow-hidden">
          <header className="px-4 pt-4 pb-3">
            <h3 className="flex gap-2 font-bold">
              <span className="num text-ash">{index + 1}</span>
              <span>{exercise.name}</span>
            </h3>
            <p className="mt-0.5 text-xs text-ash">
              目標 <SetText text={formatTarget(exercise.target_weight_kg, exercise.target_reps, exercise.target_sets)} />
              <span className="mx-1.5 text-line">/</span>
              休憩 {formatRest(exercise.rest_seconds)}
            </p>
          </header>
          <table className="w-full border-t border-line text-sm">
            <thead>
              <tr className="text-xs text-ash">
                <th scope="col" className="w-14 py-2 pl-4 text-left font-normal">
                  セット
                </th>
                <th scope="col" className="py-2 text-left font-normal">
                  目標
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-normal">
                  実績
                </th>
              </tr>
            </thead>
            <tbody>
              {exercise.sets.map((set) => (
                <SetResultRow key={set.id} set={set} />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function Stat({ label, value, unit }: { label: string; value: string; unit?: string }) {
  return (
    <div className="rounded-xl bg-rubber/70 px-2 py-2.5">
      <dt className="text-[11px] text-ash">{label}</dt>
      <dd className="num mt-0.5 text-lg leading-tight font-bold">
        {value}
        {unit ? <span className="ml-0.5 text-xs font-normal text-ash">{unit}</span> : null}
      </dd>
    </div>
  );
}

function SetResultRow({ set }: { set: SetLog }) {
  const done = isSetDone(set);
  const repsShort = done && set.target_reps != null && set.actual_reps != null && set.actual_reps < set.target_reps;
  const weightDiffers =
    done && set.target_weight_kg != null && set.actual_weight_kg != null && set.actual_weight_kg !== set.target_weight_kg;

  return (
    <tr className="border-t border-line/60">
      <td className="num py-2.5 pl-4 text-ash">{set.set_number}</td>
      <td className="py-2.5 text-ash">
        <SetText className="num" text={formatSet(set.target_weight_kg, set.target_reps)} />
      </td>
      <td className="num py-2.5 pr-4 text-right font-bold">
        {done ? (
          <>
            <span className={cn(weightDiffers && "text-plate-blue-bright")}>
              {set.actual_weight_kg == null ? "自重" : `${formatKg(set.actual_weight_kg)}kg`}
            </span>
            <span className="mx-[0.25em] font-sans font-normal text-ash">×</span>
            <span className={cn(repsShort && "text-plate-yellow")}>{set.actual_reps ?? "—"}</span>
          </>
        ) : (
          <span className="font-normal text-ash">未実施</span>
        )}
      </td>
    </tr>
  );
}
