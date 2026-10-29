import Link from "next/link";
import { cn } from "@/lib/cn";
import { formatWeekday } from "@/lib/dates";
import { dayStatus, type DayStatus } from "@/lib/nutrition/nutrients";
import { rowIntake, rowTarget } from "@/lib/nutrition/rows";
import type { NutritionDayRow } from "@/types/app";

const DOT: Record<DayStatus, string> = {
  achieved: "bg-plate-green",
  over: "bg-plate-red",
  under: "bg-plate-yellow",
  no_record: "bg-line",
  no_target: "bg-ash/60",
};

const STATUS_TEXT: Record<DayStatus, string> = {
  achieved: "目標達成",
  over: "超過あり",
  under: "不足あり",
  no_record: "記録なし",
  no_target: "目標未設定",
};

/** 1 週間の達成状況（日付をタップするとその日の記録へ） */
export function WeekStrip({
  days,
  selected,
  today,
  hrefFor,
}: {
  days: NutritionDayRow[];
  selected: string;
  today: string;
  hrefFor: (date: string) => string;
}) {
  return (
    <nav aria-label="日付を選ぶ" className="grid grid-cols-7 gap-1">
      {days.map((day) => {
        const target = rowTarget(day);
        const status = dayStatus(rowIntake(day), target?.target ?? null, target?.tolerance ?? null, day.item_count);
        const isSelected = day.day === selected;
        const isToday = day.day === today;
        const label = `${day.day.slice(5).replace("-", "/")} ${isToday && status === "under" ? "記録中" : STATUS_TEXT[status]}`;
        return (
          <Link
            key={day.day}
            href={hrefFor(day.day)}
            replace
            scroll={false}
            aria-current={isSelected ? "date" : undefined}
            aria-label={label}
            className={cn(
              "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-center",
              isSelected ? "bg-rubber text-chalk ring-1 ring-plate-blue-bright/70" : "text-ash active:bg-rubber",
            )}
          >
            <span className={cn("text-[11px] leading-none", isToday && "font-bold text-plate-blue-bright")}>
              {isToday ? "今日" : formatWeekday(day.day)}
            </span>
            <span className="num text-[15px] leading-none font-bold">{Number(day.day.slice(8, 10))}</span>
            <span
              className={cn("h-1.5 w-1.5 rounded-full", isToday && status === "under" ? "bg-plate-blue-bright" : DOT[status])}
              aria-hidden="true"
            />
          </Link>
        );
      })}
    </nav>
  );
}
