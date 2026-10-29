import Link from "next/link";
import { IconChevronRight } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatNutrient, formatRemaining, NUTRIENT_SHORT } from "@/lib/nutrition/format";
import { dayStatus, ZERO_NUTRIENTS } from "@/lib/nutrition/nutrients";
import { rowIntake, rowTarget } from "@/lib/nutrition/rows";
import type { NutritionDayRow } from "@/types/app";
import { DayStatusBadge, NUTRIENT_COLORS, NutrientBar } from "./nutrition-summary";

/** クライアントのホーム: 今日の食事の摂取量と残り（タップで食事の画面へ） */
export function TodayMealCard({ row }: { row: NutritionDayRow | null }) {
  const target = row ? rowTarget(row) : null;
  const intake = row ? rowIntake(row) : ZERO_NUTRIENTS;
  const itemCount = row?.item_count ?? 0;
  const status = dayStatus(intake, target?.target ?? null, target?.tolerance ?? null, itemCount);
  const kcalRemaining = target ? formatRemaining("energyKcal", target.target.energyKcal - intake.energyKcal) : null;

  return (
    <Link href="/client/meals" className="panel block p-5 active:bg-rubber" aria-label="今日の食事を開く">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-bold">今日の食事</h2>
        <span className="flex shrink-0 items-center gap-1">
          <DayStatusBadge status={status} inProgress />
          <IconChevronRight size={18} className="text-ash" />
        </span>
      </div>

      <div className="mt-3 flex items-baseline justify-between gap-3">
        <p>
          <span className="num text-[28px] leading-none font-extrabold">{formatNutrient("energyKcal", intake.energyKcal)}</span>
          <span className="ml-1 text-sm font-bold text-ash">
            {target ? `/ ${formatNutrient("energyKcal", target.target.energyKcal)} kcal` : "kcal"}
          </span>
        </p>
        {kcalRemaining ? (
          <p className={cn("text-sm", kcalRemaining.over ? "font-bold text-plate-red-bright" : "text-ash")}>{kcalRemaining.text}</p>
        ) : null}
      </div>

      {target ? (
        <>
          <div className="mt-2">
            <NutrientBar
              nutrient="energyKcal"
              intake={intake.energyKcal}
              target={target.target.energyKcal}
              tolerance={target.tolerance.energyKcal}
              size="sm"
            />
          </div>
          <p className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs">
            {(["proteinG", "fatG", "carbsG"] as const).map((key) => {
              const remaining = formatRemaining(key, target.target[key] - intake[key]);
              return (
                <span key={key} className={cn("whitespace-nowrap", remaining.over ? "font-bold text-plate-red-bright" : "text-ash")}>
                  <span className={cn("num font-bold", NUTRIENT_COLORS[key].text)}>{NUTRIENT_SHORT[key]}</span> {remaining.text}
                </span>
              );
            })}
          </p>
        </>
      ) : null}

      {itemCount === 0 ? <p className="mt-2 text-sm text-ash">まだ記録がありません。写真を撮るか、検索して記録できます。</p> : null}
    </Link>
  );
}
