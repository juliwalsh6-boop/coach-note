"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconCamera, IconChevronLeft, IconChevronRight, IconImage, IconSearch, IconStore, IconUtensils } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { markMealCommentsRead } from "@/lib/data/meal-comments";
import { deleteMealPhoto } from "@/lib/data/meal-photos";
import { getMealDay, getNutritionDays } from "@/lib/data/meals";
import { addDaysISO, formatDateLong, relativeDateLabel } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import type { FoodChannel } from "@/lib/nutrition/foods";
import { MEAL_TYPES, type MealType } from "@/lib/nutrition/meal-types";
import { dayTotals, loggedMealTypes, mealsByType, rowIntake, rowTarget } from "@/lib/nutrition/rows";
import { createClient } from "@/lib/supabase/client";
import type { MealItem, MealPhoto, MealWithDetails, NutritionDayRow } from "@/types/app";
import { AddFoodSheet } from "./add-food-sheet";
import { CopyMealSheet } from "./copy-meal-sheet";
import { ItemEditSheet } from "./item-edit-sheet";
import { MealCommentThread } from "./meal-comment-thread";
import { MealSection } from "./meal-section";
import { NutritionSummary } from "./nutrition-summary";
import { PhotoAnalysisSheet } from "./photo-analysis-sheet";
import { SuggestSheet } from "./suggest-sheet";
import { usePhotoUrls } from "./use-photo-urls";
import { WeekStrip } from "./week-strip";

type SheetState =
  | { kind: "add"; mealType: MealType }
  | { kind: "edit"; item: MealItem }
  | { kind: "photo"; file: File; mealType: MealType }
  | { kind: "suggest"; channel: FoodChannel }
  | { kind: "copy"; meal: MealWithDetails }
  | null;

type MealDayClientProps = {
  clientId: string;
  date: string;
  today: string;
  /** いまの時刻に合う食事区分（サーバーで日本時間から決める） */
  currentMealType: MealType;
  initialMeals: MealWithDetails[];
  initialDays: NutritionDayRow[];
  hasTrainer: boolean;
  trainerLabel: string;
};

/** クライアントの「食事」画面（1 日分）。追加・編集・削除はページを移動せずシートで行う */
export function MealDayClient({
  clientId,
  date,
  today,
  currentMealType,
  initialMeals,
  initialDays,
  hasTrainer,
  trainerLabel,
}: MealDayClientProps) {
  const router = useRouter();
  const { toast } = useToast();
  const db = useMemo(() => createClient(), []);
  const [meals, setMeals] = useState(initialMeals);
  const [days, setDays] = useState(initialDays);
  const [sheet, setSheet] = useState<SheetState>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const cameraInput = useRef<HTMLInputElement>(null);
  const libraryInput = useRef<HTMLInputElement>(null);
  const photoMealType = useRef<MealType>(currentMealType);

  const isToday = date === today;
  const dayRow = useMemo(() => days.find((d) => d.day === date) ?? null, [days, date]);
  const target = useMemo(() => (dayRow ? rowTarget(dayRow) : null), [dayRow]);
  // 1 日の合計は DB の集計（保存された記録の合計）を使う。集計を取得できていなければ記録から計算する（同じ値）
  const intake = useMemo(() => (dayRow ? rowIntake(dayRow) : dayTotals(meals)), [dayRow, meals]);
  const itemCount = dayRow ? dayRow.item_count : meals.reduce((n, m) => n + m.items.length, 0);
  const byType = mealsByType(meals);
  const logged = useMemo(() => loggedMealTypes(meals), [meals]);
  const defaultMealType = isToday ? currentMealType : "dinner";
  const photoPaths = meals.flatMap((m) => m.photos.map((p) => p.storage_path));
  const { urls, reload } = usePhotoUrls(db, photoPaths);

  const refresh = useCallback(async () => {
    try {
      const [nextMeals, nextDays] = await Promise.all([
        getMealDay(db, clientId, date),
        getNutritionDays(db, clientId, addDaysISO(date, -6), date),
      ]);
      setMeals(nextMeals);
      setDays(nextDays);
      setLoadError(null);
    } catch (e) {
      setLoadError(toErrorMessage(e));
    }
  }, [db, clientId, date]);

  // トレーナーからのコメントを表示したら既読にする（NEW の表示はこの画面にいる間は残す）
  const unreadMealIds = meals
    .filter((m) => m.comments.some((c) => c.author_id !== clientId && c.read_at === null))
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

  function openPhoto(source: "camera" | "library", mealType: MealType = defaultMealType) {
    photoMealType.current = mealType;
    (source === "camera" ? cameraInput : libraryInput).current?.click();
  }

  function onFileChosen(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = ""; // 同じ写真をもう一度選べるように
    if (file) setSheet({ kind: "photo", file, mealType: photoMealType.current });
  }

  async function removePhoto(photo: MealPhoto) {
    try {
      await deleteMealPhoto(db, photo);
      toast("写真を削除しました", "success");
      await refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    }
  }

  const canRecord = date <= today;

  return (
    <div className="space-y-5 pb-4">
      <header className="flex items-center justify-between gap-2 pt-4">
        <Link
          href={`/client/meals?date=${addDaysISO(date, -1)}`}
          replace
          scroll={false}
          className="flex h-11 w-11 items-center justify-center rounded-xl text-ash active:bg-rubber"
          aria-label="前の日"
        >
          <IconChevronLeft size={24} />
        </Link>
        <div className="min-w-0 text-center">
          <h1 className="text-[24px] leading-tight font-bold">{isToday ? "今日の食事" : `${relativeDateLabel(date, today)}の食事`}</h1>
          <p className="text-xs text-ash">{formatDateLong(date)}</p>
        </div>
        {isToday ? (
          <span className="h-11 w-11" aria-hidden="true" />
        ) : (
          <Link
            href={`/client/meals?date=${addDaysISO(date, 1)}`}
            replace
            scroll={false}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-ash active:bg-rubber"
            aria-label="次の日"
          >
            <IconChevronRight size={24} />
          </Link>
        )}
      </header>

      <WeekStrip days={days} selected={date} today={today} hrefFor={(d) => `/client/meals?date=${d}`} />

      {!isToday ? (
        <div className="flex justify-center">
          <Link href="/client/meals" replace scroll={false} className="text-sm text-plate-blue-bright underline underline-offset-4">
            今日に戻る
          </Link>
        </div>
      ) : null}

      {loadError ? <Notice tone="error">{loadError}</Notice> : null}

      <NutritionSummary
        intake={intake}
        target={target}
        itemCount={itemCount}
        inProgress={isToday}
        title={isToday ? "今日の目標と残り" : "この日の目標と摂取量"}
        emptyTargetMessage={
          hasTrainer
            ? "トレーナーが目標を設定すると、目標と残りの量がここに表示されます。記録はいまから始められます。"
            : "トレーナーとつながると、目標と残りの量がここに表示されます。記録はいまから始められます。"
        }
      />

      {canRecord ? (
        <section aria-label="記録する" className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button size="lg" onClick={() => openPhoto("camera")}>
              <IconCamera size={20} />
              撮影して記録
            </Button>
            <Button size="lg" variant="secondary" onClick={() => openPhoto("library")}>
              <IconImage size={20} />
              写真を選ぶ
            </Button>
          </div>
          <Button size="lg" variant="secondary" block onClick={() => setSheet({ kind: "add", mealType: defaultMealType })}>
            <IconSearch size={20} />
            食品・メニューを検索して追加
          </Button>
          <input ref={cameraInput} type="file" accept="image/*" capture="environment" className="hidden" onChange={onFileChosen} />
          <input ref={libraryInput} type="file" accept="image/*" className="hidden" onChange={onFileChosen} />
        </section>
      ) : null}

      {canRecord ? (
        <section className="panel p-4" aria-labelledby="suggest-title">
          <h2 id="suggest-title" className="font-bold">
            残りに合わせて選ぶ
          </h2>
          <p className="mt-0.5 text-xs text-ash">自炊できない日は、残りの PFC に合う組み合わせを提案します。</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setSheet({ kind: "suggest", channel: "convenience" })}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-rubber text-sm font-bold active:bg-line"
            >
              <IconStore size={22} className="text-plate-blue-bright" />
              コンビニで選ぶ
            </button>
            <button
              type="button"
              onClick={() => setSheet({ kind: "suggest", channel: "restaurant" })}
              className="flex min-h-16 flex-col items-center justify-center gap-1 rounded-2xl bg-rubber text-sm font-bold active:bg-line"
            >
              <IconUtensils size={22} className="text-plate-blue-bright" />
              外食チェーンで選ぶ
            </button>
          </div>
        </section>
      ) : null}

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
              onAdd={canRecord ? (mealType) => setSheet({ kind: "add", mealType }) : undefined}
              onEditItem={(item) => setSheet({ kind: "edit", item })}
              onCopy={(m) => setSheet({ kind: "copy", meal: m })}
              onDeletePhoto={removePhoto}
              comments={
                meal && meal.comments.length > 0 ? (
                  <MealCommentThread
                    db={db}
                    comments={meal.comments}
                    viewerId={clientId}
                    clientId={clientId}
                    mealId={meal.id}
                    otherLabel={trainerLabel}
                    canWrite={hasTrainer}
                    composerLabel="トレーナーに返信"
                    placeholder="返信を書く"
                    onChanged={() => void refresh()}
                  />
                ) : null
              }
            />
          );
        })}
      </div>

      {sheet?.kind === "add" ? (
        <AddFoodSheet
          db={db}
          clientId={clientId}
          date={date}
          initialMealType={sheet.mealType}
          onClose={() => setSheet(null)}
          onAdded={() => void refresh()}
        />
      ) : null}

      {sheet?.kind === "edit" ? (
        <ItemEditSheet
          db={db}
          item={sheet.item}
          onClose={() => setSheet(null)}
          onSaved={(message) => {
            setSheet(null);
            toast(message, "success");
            void refresh();
          }}
        />
      ) : null}

      {sheet?.kind === "photo" ? (
        <PhotoAnalysisSheet
          db={db}
          clientId={clientId}
          date={date}
          initialMealType={sheet.mealType}
          file={sheet.file}
          onClose={() => setSheet(null)}
          onSaved={(message) => {
            setSheet(null);
            toast(message, "success");
            void refresh();
          }}
        />
      ) : null}

      {sheet?.kind === "suggest" ? (
        <SuggestSheet
          db={db}
          date={date}
          initialChannel={sheet.channel}
          initialMealType={defaultMealType}
          target={target}
          intake={intake}
          loggedMealTypes={logged}
          onClose={() => setSheet(null)}
          onAdded={() => void refresh()}
        />
      ) : null}

      {sheet?.kind === "copy" ? (
        <CopyMealSheet
          db={db}
          meal={sheet.meal}
          today={today}
          defaultMealType={currentMealType}
          onClose={() => setSheet(null)}
          onCopied={(message, copiedTo) => {
            setSheet(null);
            toast(message, "success");
            if (copiedTo === date) void refresh();
            else router.push(`/client/meals${copiedTo === today ? "" : `?date=${copiedTo}`}`);
          }}
        />
      ) : null}

      <p className={cn("text-center text-xs leading-relaxed text-ash", !canRecord && "pt-2")}>
        カロリー・PFC は記録した内容から計算した値です。写真の AI 解析は推定値です。
      </p>
    </div>
  );
}
