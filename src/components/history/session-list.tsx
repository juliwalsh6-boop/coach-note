import Link from "next/link";
import { IconChevronRight } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatMonthDay, formatWeekday } from "@/lib/dates";
import { formatNumber } from "@/lib/format";
import type { SessionSummary } from "@/types/app";

/** トレーニング履歴の一覧 */
export function SessionList({ sessions, hrefFor }: { sessions: SessionSummary[]; hrefFor: (id: string) => string }) {
  return (
    <ul className="overflow-hidden rounded-[20px] border border-line bg-steel">
      {sessions.map((session) => {
        const completed = session.status === "completed";
        return (
          <li key={session.id} className="border-b border-line last:border-b-0">
            <Link href={hrefFor(session.id)} className="flex items-center gap-3 px-4 py-3.5 active:bg-rubber">
              <div className="w-14 shrink-0 text-center">
                <p className="num text-lg leading-tight font-bold">{formatMonthDay(session.performed_date)}</p>
                <p className="text-xs text-ash">({formatWeekday(session.performed_date)})</p>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="min-w-0 truncate font-bold">{session.title}</p>
                  <span
                    className={cn(
                      "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                      completed ? "bg-plate-green/15 text-plate-green-bright" : "bg-plate-blue/20 text-plate-blue-bright",
                    )}
                  >
                    {completed ? "完了" : "実施中"}
                  </span>
                </div>
                <p className="num mt-0.5 text-xs text-ash">
                  <span className="whitespace-nowrap">
                    {session.completedSets}/{session.totalSets} セット
                  </span>
                  <wbr />
                  <span className="mx-1.5 text-line">/</span>
                  <span className="whitespace-nowrap">{formatNumber(session.volumeKg)} kg</span>
                </p>
                {session.deviatedSets > 0 ? (
                  <p className="mt-0.5 text-xs font-bold text-plate-yellow">
                    目標と違う <span className="num">{session.deviatedSets}</span>セット
                  </p>
                ) : null}
              </div>
              <IconChevronRight size={18} className="shrink-0 text-ash" />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
