"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { IconChevronLeft, IconChevronRight, IconTarget } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { cn } from "@/lib/cn";
import { markMealCommentsRead } from "@/lib/data/meal-comments";
import { getMealDay } from "@/lib/data/meals";
import { addDaysISO, formatDateLong, formatDateShort, relativeDateLabel } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { formatKg } from "@/lib/format";
import { formatNutrient } from "@/lib/nutrition/format";
import { MEAL_TYPES } from "@/lib/nutrition/meal-types";
import { dayStatus, type DayStatus } from "@/lib/nutrition/nutrients";
import { dayTotals, mealsByType, rowIntake, rowTarget } from "@/lib/nutrition/rows";
import { createClient } from "@/lib/supabase/client";
import type { MealWithDetails, NutritionDayRow, WorkoutSession } from "@/types/app";
import { MealCommentThread } from "./meal-comment-thread";
import { MealSection } from "./meal-section";
import { MacroInline, NutritionSummary } from "./nutrition-summary";
import { usePhotoUrls } from "./use-photo-urls";
import { WeekStrip } from "./week-strip";

export type WeightPoint = { date: string; kg: number };

const STATUS_DOT: Record<DayStatus, string> = {
  achieved: "bg-plate-green",
  over: "bg-plate-red",
  under: "bg-plate-yellow",
  no_record: "bg-line",
  no_target: "bg-ash/60",
};

/**
 * トレーナー用: クライアントの 1 日の食事（閲覧とコメントだけ。記録の変更はできない）。
 * 体重（朝のチェックイン）とトレーニングの実施日も並べて表示する。
 */
export function TrainerMealDay({
  clientId,
  clientName,
  trainerId,
  date,
  today,
  initialMeals,
  days,
  weights,
  sessions,
}: {
  clientId: string;
  clientName: string;
  trainerId: string;
  date: string;
  today: string;
  initialMeals: MealWithDetails[];
  /** date までの 7 日分（日ごとの目標と摂取量） */
  days: NutritionDayRow[];
  weights: WeightPoint[];
  sessions: WorkoutSession[];
}) {
  const router = useRouter();
  const db = useMemo(() => createClient(), []);
  const [meals, setMeals] = useState(initialMeals);
  const [loadError, setLoadError] = useState<string | null>(null);
  const base = `/trainer/clients/${clientId}`;
  const hrefFor = (d: string) => `${base}?tab=meals${d === today ? "" : `&date=${d}`}`;

  const isToday = date === today;
  const dayRow = days.find((d) => d.day === date) ?? null;
  const target = dayRow ? rowTarget(dayRow) : null;
  const intake = dayRow ? rowIntake(dayRow) : dayTotals(meals);
  const itemCount = dayRow ? dayRow.item_count : meals.reduce((n, m) => n + m.items.length, 0);
  const byType = mealsByType(meals);
  const photoPaths = meals.flatMap((m) => m.photos.map((p) => p.storage_path));
  const { urls, reload } = usePhotoUrls(db, photoPaths);

  const refresh = useCallback(async () => {
    try {
      setMeals(await getMealDay(db, clientId, date));
      setLoadError(null);
    } catch (e) {
      setLoadError(toErrorMessage(e));
    }
  }, [db, clientId, date]);

  // クライアントからの返信を表示したら既読にする（NEW の表示はこの画面にいる間は残す）
  const unreadMealIds = meals
    .filter((m) => m.comments.some((c) => c.author_id === clientId && c.read_at === null))
    .map((m) => m.id)
    .join(",");
  useEffect(() => {
    if (!unreadMealIds) return;
    let cancelled = false;
    markMealCommentsRead(db, unreadMealIds.split(","))
      .then(() => {
        if (!cancelled) router.refresh();
      })
      .catch(() => {
        // 既読にできなくても表示には影響しない
      });
    return () => {
      cancelled = true;
    };
  }, [db, unreadMealIds, router]);

  const weightByDate = new Map(weights.map((w) => [w.date, w.kg]));
  const sessionsOf = (d: string) => sessions.filter((s) => s.performed_date === d);
  const todaysSessions = sessionsOf(date);
  const weightToday = weightByDate.get(date) ?? null;
  const loggedDays = days.filter((d) => d.item_count > 0);
  const average =
    loggedDays.length > 0
      ? {
          energyKcal: loggedDays.reduce((sum, d) => sum + Number(d.energy_kcal), 0) / loggedDays.length,
          proteinG: loggedDays.reduce((sum, d) => sum + Number(d.protein_g), 0) / loggedDays.length,
          fatG: loggedDays.reduce((sum, d) => sum + Number(d.fat_g), 0) / loggedDays.length,
          carbsG: loggedDays.reduce((sum, d) => sum + Number(d.carbs_g), 0) / loggedDays.length,
        }
      : null;
  const firstWeight = weights[0];
  const lastWeight = weights[weights.length - 1];
  const weightChange = firstWeight && lastWeight && firstWeight.date !== lastWeight.date ? lastWeight.kg - firstWeight.kg : null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <Link
          href={hrefFor(addDaysISO(date, -1))}
          replace
          scroll={false}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-ash active:bg-rubber"
          aria-label="前の日"
        >
          <IconChevronLeft size={24} />
        </Link>
        <div className="min-w-0 text-center">
          <p className="text-[19px] leading-tight font-bold">{isToday ? "今日の食事" : `${relativeDateLabel(date, today)}の食事`}</p>
          <p className="text-xs text-ash">{formatDateLong(date)}</p>
        </div>
        {isToday ? (
          <span className="h-11 w-11" aria-hidden="true" />
        ) : (
          <Link
            href={hrefFor(addDaysISO(date, 1))}
            replace
            scroll={false}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ash active:bg-rubber"
            aria-label="次の日"
          >
            <IconChevronRight size={24} />
          </Link>
        )}
      </div>

      <WeekStrip days={days} selected={date} today={today} hrefFor={hrefFor} />

      {loadError ? <Notice tone="error">{loadError}</Notice> : null}

      <NutritionSummary
        intake={intake}
        target={target}
        itemCount={itemCount}
        inProgress={isToday}
        title={isToday ? "今日の目標と摂取量" : "この日の目標と摂取量"}
        emptyTargetMessage="まだ目標が設定されていません。「目標を設定」から、カロリーと P・F・C の目標を決めてください。"
        headerRight={
          <Link
            href={`/trainer/clients/${clientId}/nutrition`}
            className="flex min-h-9 items-center gap-1 rounded-lg bg-rubber px-2.5 text-xs font-bold text-chalk active:bg-line"
          >
            <IconTarget size={15} />
            目標を設定
          </Link>
        }
      />

      <section className="panel p-4" aria-labelledby="week-title">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="week-title" className="font-bold">
            体重・トレーニングと食事
          </h2>
          <p className="text-xs text-ash">直近 7 日</p>
        </div>

        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="rounded-xl bg-iron px-3 py-2.5">
            <p className="text-[11px] text-ash">{relativeDateLabel(date, today)}の体重</p>
            <p className="num mt-0.5 text-lg font-bold">
              {weightToday != null ? (
                <>
                  {formatKg(weightToday)}
                  <span className="ml-0.5 font-sans text-xs text-ash">kg</span>
                </>
              ) : (
                <span className="text-sm font-normal text-ash">記録なし</span>
              )}
            </p>
            {weightChange != null ? (
              <p className="text-[11px] text-ash">
                7 日間で {weightChange > 0 ? "+" : weightChange < 0 ? "−" : "±"}
                {formatKg(Math.abs(Math.round(weightChange * 10) / 10))}kg
              </p>
            ) : null}
          </div>
          <div className="rounded-xl bg-iron px-3 py-2.5">
            <p className="text-[11px] text-ash">{relativeDateLabel(date, today)}のトレーニング</p>
            {todaysSessions.length > 0 ? (
              <ul className="mt-0.5 space-y-0.5">
                {todaysSessions.map((s) => (
                  <li key={s.id} className="min-w-0">
                    <Link href={`${base}/sessions/${s.id}`} className="block truncate text-sm font-bold text-plate-blue-bright underline-offset-2 active:underline">
                      {s.title}
                      {s.status === "in_progress" ? <span className="ml-1 text-[11px] font-normal text-ash">（実施中）</span> : null}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-0.5 text-sm text-ash">なし</p>
            )}
          </div>
        </div>

        <ul className="mt-3 divide-y divide-line" aria-label="直近 7 日の記録">
          {[...days].reverse().map((d) => {
            const dTarget = rowTarget(d);
            const dIntake = rowIntake(d);
            const status = dayStatus(dIntake, dTarget?.target ?? null, dTarget?.tolerance ?? null, d.item_count);
            const weight = weightByDate.get(d.day);
            const trained = sessionsOf(d.day).length > 0;
            return (
              <li key={d.day}>
                <Link
                  href={hrefFor(d.day)}
                  replace
                  scroll={false}
                  className={cn(
                    "grid grid-cols-[4.75rem_1fr_auto] items-center gap-2 py-2 active:bg-rubber",
                    d.day === date && "font-bold",
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs">
                    <span
                      className={cn("h-2 w-2 shrink-0 rounded-full", d.day === today && status === "under" ? "bg-plate-blue-bright" : STATUS_DOT[status])}
                      aria-hidden="true"
                    />
                    {d.day === today ? "今日" : formatDateShort(d.day)}
                  </span>
                  <span className="min-w-0">
                    {d.item_count > 0 ? (
                      <>
                        <span className="num text-sm">
                          {formatNutrient("energyKcal", dIntake.energyKcal)}
                          <span className="text-[11px] font-normal text-ash">kcal</span>
                        </span>
                        <MacroInline values={dIntake} className="ml-1.5 text-[11px]" />
                      </>
                    ) : (
                      <span className="text-xs font-normal text-ash">記録なし</span>
                    )}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-normal text-ash">
                    {weight != null ? <span className="num text-chalk">{formatKg(weight)}kg</span> : null}
                    {trained ? <span className="rounded-md bg-plate-blue/15 px-1.5 py-0.5 font-bold text-plate-blue-bright">トレ</span> : null}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>

        {average ? (
          <p className="mt-2 text-xs leading-relaxed text-ash">
            記録した {loggedDays.length} 日の平均: <span className="num font-bold text-chalk">{formatNutrient("energyKcal", average.energyKcal)}kcal</span>
            <MacroInline values={average} className="ml-1.5" />
          </p>
        ) : null}
      </section>

      <div className="space-y-3">
        {MEAL_TYPES.map((type) => {
          const meal = byType[type];
          return (
            <MealSection
              key={type}
              mealType={type}
              meal={meal}
              photoUrls={urls}
              onPhotoError={reload}
              showAiDetail
              emptyText="記録なし"
              comments={
                meal ? (
                  <MealCommentThread
                    db={db}
                    comments={meal.comments}
                    viewerId={trainerId}
                    clientId={clientId}
                    mealId={meal.id}
                    otherLabel={clientName}
                    canWrite
                    composerLabel="この食事にコメントする"
                    placeholder="この食事へのコメント（クライアントに届きます）"
                    onChanged={() => void refresh()}
                  />
                ) : null
              }
            />
          );
        })}
      </div>

      <p className="text-center text-xs leading-relaxed text-ash">
        記録の追加・修正はクライアントが行います。「AI推定」はクライアントが写真から記録した推定値、「AI推定を修正」は推定値をクライアントが直した品です。
      </p>
    </div>
  );
}
