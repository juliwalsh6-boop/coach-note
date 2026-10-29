import Link from "next/link";
import { DayStatusBadge, NUTRIENT_COLORS, NutrientBar } from "@/components/meals/nutrition-summary";
import { IconChevronRight } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatDateTime, relativeDateLabel } from "@/lib/dates";
import { formatKg } from "@/lib/format";
import { formatNutrient, formatRemaining, NUTRIENT_SHORT } from "@/lib/nutrition/format";
import { dayStatus } from "@/lib/nutrition/nutrients";
import { rowIntake, rowTarget } from "@/lib/nutrition/rows";
import type { NutritionOverviewRow } from "@/types/app";

/** トレーナーの「食事」一覧: クライアント 1 人分（目標・今日の摂取量・記録の有無・体重・最終記録・未返信） */
export function ClientNutritionRow({ row, date, today }: { row: NutritionOverviewRow; date: string; today: string }) {
  const target = rowTarget(row);
  const intake = rowIntake(row);
  const status = dayStatus(intake, target?.target ?? null, target?.tolerance ?? null, row.item_count);
  const kcalRemaining = target ? formatRemaining("energyKcal", target.target.energyKcal - intake.energyKcal) : null;
  const href = `/trainer/clients/${row.client_id}?tab=meals${date === today ? "" : `&date=${date}`}`;

  return (
    <Link href={href} className="panel block p-4 active:bg-rubber">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[17px] font-bold">{row.display_name}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          {row.awaiting_reply_count > 0 ? (
            <span className="rounded-full bg-plate-blue px-2 py-0.5 text-[11px] font-bold text-white">
              未返信 {row.awaiting_reply_count}
            </span>
          ) : null}
          <DayStatusBadge status={status} inProgress={date === today} />
          <IconChevronRight size={18} className="text-ash" />
        </div>
      </div>

      {target ? (
        <div className="mt-3">
          <div className="flex items-baseline justify-between gap-3">
            <p>
              <span className="num text-xl font-extrabold">{formatNutrient("energyKcal", intake.energyKcal)}</span>
              <span className="text-xs text-ash"> / {formatNutrient("energyKcal", target.target.energyKcal)} kcal</span>
            </p>
            {kcalRemaining ? (
              <p className={cn("text-xs", kcalRemaining.over ? "font-bold text-plate-red-bright" : "text-ash")}>{kcalRemaining.text}</p>
            ) : null}
          </div>
          <div className="mt-1.5">
            <NutrientBar
              nutrient="energyKcal"
              intake={intake.energyKcal}
              target={target.target.energyKcal}
              tolerance={target.tolerance.energyKcal}
              size="sm"
            />
          </div>
          <dl className="mt-2.5 grid grid-cols-3 gap-2.5">
            {(["proteinG", "fatG", "carbsG"] as const).map((key) => (
              <div key={key}>
                <dt className="sr-only">{NUTRIENT_SHORT[key]}</dt>
                <dd>
                  <p className="num text-xs">
                    <span className={cn("font-bold", NUTRIENT_COLORS[key].text)}>{NUTRIENT_SHORT[key]}</span>{" "}
                    <span className="font-bold text-chalk">{formatNutrient(key, intake[key])}</span>
                    <span className="text-ash">/{formatNutrient(key, target.target[key])}g</span>
                  </p>
                  <div className="mt-1">
                    <NutrientBar nutrient={key} intake={intake[key]} target={target.target[key]} tolerance={target.tolerance[key]} size="sm" />
                  </div>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <p className="mt-2 text-sm text-ash">
          目標が未設定です
          {row.item_count > 0 ? `（${formatNutrient("energyKcal", intake.energyKcal)}kcal 記録）` : ""}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ash">
        <span className={cn(row.item_count === 0 && "font-bold text-plate-yellow")}>
          {row.item_count > 0
            ? `${relativeDateLabel(date, today)} ${row.meal_count}食・${row.item_count}品${row.photo_count > 0 ? `・写真${row.photo_count}枚` : ""}`
            : `${relativeDateLabel(date, today)}の記録なし`}
        </span>
        <span>最終記録 {row.last_logged_at ? formatDateTime(row.last_logged_at) : "なし"}</span>
        {row.latest_weight_kg != null ? (
          <span>
            体重 <span className="num text-sm font-bold text-chalk">{formatKg(row.latest_weight_kg)}</span>kg
            {row.latest_weight_date ? `（${relativeDateLabel(row.latest_weight_date, today)}）` : ""}
          </span>
        ) : null}
      </div>
    </Link>
  );
}
