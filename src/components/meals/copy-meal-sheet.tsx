"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { copyMeal } from "@/lib/data/meals";
import type { DB } from "@/lib/data/db";
import { addDaysISO, formatDateShort, relativeDateLabel } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { formatNutrient } from "@/lib/nutrition/format";
import { isMealType, MEAL_TYPE_LABELS, type MealType } from "@/lib/nutrition/meal-types";
import { mealTotals } from "@/lib/nutrition/rows";
import type { MealWithDetails } from "@/types/app";
import { MealTypePicker } from "./item-editor";
import { MacroInline } from "./nutrition-summary";

/** 過去の食事をもう一度記録する（日付と食事区分を選んでコピー） */
export function CopyMealSheet({
  db,
  meal,
  today,
  defaultMealType,
  onClose,
  onCopied,
}: {
  db: DB;
  meal: MealWithDetails;
  today: string;
  defaultMealType: MealType;
  onClose: () => void;
  onCopied: (message: string, date: string) => void;
}) {
  const sourceType = isMealType(meal.meal_type) ? meal.meal_type : defaultMealType;
  const [date, setDate] = useState(today);
  const [mealType, setMealType] = useState<MealType>(meal.eaten_on === today ? defaultMealType : sourceType);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);
  const totals = mealTotals(meal);
  const dateOptions = [today, addDaysISO(today, -1)];

  async function submit() {
    setSaving(true);
    setError(null);
    requestId.current ??= crypto.randomUUID();
    try {
      await copyMeal(db, { sourceMealId: meal.id, date, mealType, requestId: requestId.current });
      onCopied(`${relativeDateLabel(date, today)}の${MEAL_TYPE_LABELS[mealType]}に記録しました`, date);
    } catch (e) {
      setError(toErrorMessage(e));
      setSaving(false);
    }
  }

  return (
    <Sheet
      open
      title="もう一度記録する"
      description={`${formatDateShort(meal.eaten_on)}の${MEAL_TYPE_LABELS[sourceType]}（${meal.items.length}品）`}
      onClose={onClose}
      busy={saving}
      footer={
        <Button size="lg" block loading={saving} onClick={() => void submit()}>
          {relativeDateLabel(date, today)}の{MEAL_TYPE_LABELS[mealType]}に記録
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="rounded-2xl bg-iron p-3.5">
          <ul className="space-y-1 text-sm">
            {meal.items.map((item) => (
              <li key={item.id} className="flex justify-between gap-3">
                <span className="min-w-0 break-words">{item.name}</span>
                <span className="num shrink-0 text-ash">{formatNutrient("energyKcal", Number(item.energy_kcal))}kcal</span>
              </li>
            ))}
          </ul>
          <p className="mt-2 border-t border-line pt-2">
            <span className="num font-bold">{formatNutrient("energyKcal", totals.energyKcal)}kcal</span>
            <MacroInline values={totals} className="ml-2" />
          </p>
          <p className="mt-1 text-xs text-ash">写真とAIの推定値はコピーしません。量はあとから直せます。</p>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold">日付</p>
          <div className="grid grid-cols-2 gap-1 rounded-2xl bg-iron p-1">
            {dateOptions.map((d) => (
              <button
                key={d}
                type="button"
                aria-pressed={date === d}
                onClick={() => setDate(d)}
                className={cn("min-h-10 rounded-xl text-sm font-bold", date === d ? "bg-plate-blue text-white" : "text-ash")}
              >
                {relativeDateLabel(d, today)}
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-sm font-bold">食事</p>
          <MealTypePicker value={mealType} onChange={setMealType} />
        </div>

        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </Sheet>
  );
}
