"use client";

import { useId } from "react";
import { Stepper } from "@/components/workout/stepper";
import { cn } from "@/lib/cn";
import {
  draftAmount,
  draftNutrients,
  numberText,
  withAmount,
  withUnit,
  withValue,
  type ItemDraft,
} from "@/lib/nutrition/draft";
import { NUTRIENT_LABELS, NUTRIENT_SHORT, formatNutrient } from "@/lib/nutrition/format";
import { MEAL_TYPES, MEAL_TYPE_LABELS, type MealType } from "@/lib/nutrition/meal-types";
import { energyFromMacros, itemWeightG, type NutrientKey } from "@/lib/nutrition/nutrients";
import { NUTRIENT_COLORS } from "./nutrition-summary";

/** 朝食・昼食・夕食・間食の切り替え */
export function MealTypePicker({
  value,
  onChange,
  label = "食事",
}: {
  value: MealType;
  onChange: (value: MealType) => void;
  label?: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="grid grid-cols-4 gap-1 rounded-2xl bg-iron p-1">
      {MEAL_TYPES.map((type) => {
        const active = type === value;
        return (
          <button
            key={type}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => onChange(type)}
            className={cn(
              "min-h-10 rounded-xl text-sm font-bold transition-colors",
              active ? "bg-plate-blue text-white" : "text-ash active:bg-rubber",
            )}
          >
            {MEAL_TYPE_LABELS[type]}
          </button>
        );
      })}
    </div>
  );
}

function stepAmount(draft: ItemDraft, delta: 1 | -1): string {
  const current = draftAmount(draft) ?? 0;
  if (draft.basis.unit === "g") {
    const next = Math.max(5, Math.round((current + delta * 10) / 5) * 5);
    return numberText(next);
  }
  const next = Math.max(0.5, Math.round((current + delta * 0.5) * 2) / 2);
  return numberText(next);
}

const SERVING_CHIPS = [0.5, 1, 1.5, 2];

/** 量の入力（1食単位なら 0.5 刻み、g なら 10g 刻み） */
export function AmountField({
  draft,
  onChange,
  allowUnitChange = false,
}: {
  draft: ItemDraft;
  onChange: (draft: ItemDraft) => void;
  allowUnitChange?: boolean;
}) {
  const unit = draft.basis.unit;
  const amount = draftAmount(draft);
  const weight = amount != null ? itemWeightG(unit, amount, draft.servingWeightG) : null;
  const unitLabel = unit === "g" ? "g" : draft.servingLabel?.replace(/^.*?1/, "") || "食";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-bold">量</p>
        {allowUnitChange ? (
          <div role="radiogroup" aria-label="単位" className="flex gap-1 rounded-xl bg-iron p-1">
            {(["serving", "g"] as const).map((u) => (
              <button
                key={u}
                type="button"
                role="radio"
                aria-checked={unit === u}
                onClick={() => onChange(withUnit(draft, u))}
                className={cn("min-h-8 rounded-lg px-3 text-xs font-bold", unit === u ? "bg-rubber text-chalk" : "text-ash")}
              >
                {u === "g" ? "グラム" : "1食・個"}
              </button>
            ))}
          </div>
        ) : weight != null && unit === "serving" ? (
          <p className="num text-xs text-ash">約 {numberText(weight)}g</p>
        ) : null}
      </div>
      <Stepper
        label={unit === "g" ? "重さ" : draft.servingLabel ? `数量（${draft.servingLabel}）` : "数量"}
        unit={unitLabel}
        value={draft.amountText}
        inputMode="decimal"
        onChange={(text) => onChange(withAmount(draft, text))}
        onStep={(delta) => onChange(withAmount(draft, stepAmount(draft, delta)))}
      />
      {unit === "serving" ? (
        <div className="flex gap-1.5">
          {SERVING_CHIPS.map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => onChange(withAmount(draft, numberText(value)))}
              className={cn(
                "num min-h-9 flex-1 rounded-lg text-sm font-bold",
                amount === value ? "bg-plate-blue/25 text-chalk" : "bg-rubber text-ash active:bg-line",
              )}
            >
              ×{value}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function NutrientInput({
  nutrient,
  draft,
  onChange,
}: {
  nutrient: NutrientKey;
  draft: ItemDraft;
  onChange: (draft: ItemDraft) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0 rounded-xl bg-iron px-3 pt-2 pb-1.5 focus-within:ring-1 focus-within:ring-plate-blue-bright">
      <label htmlFor={id} className="flex items-baseline gap-1 text-[11px] font-bold text-ash">
        <span className={cn("num", NUTRIENT_COLORS[nutrient].text)}>{NUTRIENT_SHORT[nutrient]}</span>
        {NUTRIENT_LABELS[nutrient]}
      </label>
      <div className="flex items-baseline gap-1">
        <input
          id={id}
          type="text"
          inputMode="decimal"
          autoComplete="off"
          enterKeyHint="done"
          className="num scroll-mt-focus w-full min-w-0 bg-transparent py-0.5 text-xl font-bold text-chalk focus:outline-none"
          value={draft.valueTexts[nutrient]}
          placeholder="0"
          onChange={(e) => onChange(withValue(draft, nutrient, e.target.value))}
          onFocus={(e) => e.currentTarget.select()}
        />
        <span className="shrink-0 text-xs text-ash">{nutrient === "energyKcal" ? "kcal" : "g"}</span>
      </div>
    </div>
  );
}

/** カロリーと PFC の入力（いまの量に対する値） */
export function NutrientFields({
  draft,
  onChange,
  hint,
}: {
  draft: ItemDraft;
  onChange: (draft: ItemDraft) => void;
  hint?: React.ReactNode;
}) {
  const values = draftNutrients(draft);
  const fromMacros = values ? Math.round(energyFromMacros(values)) : null;
  const mismatch =
    values && fromMacros != null && values.energyKcal > 0
      ? Math.abs(values.energyKcal - fromMacros) > Math.max(30, values.energyKcal * 0.2)
      : false;

  return (
    <div className="space-y-2">
      <p className="text-sm font-bold">
        栄養値<span className="ml-1.5 text-xs font-normal text-ash">この量あたり</span>
      </p>
      <div className="grid grid-cols-2 gap-2">
        <NutrientInput nutrient="energyKcal" draft={draft} onChange={onChange} />
        <NutrientInput nutrient="proteinG" draft={draft} onChange={onChange} />
        <NutrientInput nutrient="fatG" draft={draft} onChange={onChange} />
        <NutrientInput nutrient="carbsG" draft={draft} onChange={onChange} />
      </div>
      {values && fromMacros != null ? (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ash">
          <span className={mismatch ? "text-plate-yellow" : undefined}>
            PFC から計算すると {formatNutrient("energyKcal", fromMacros)}kcal
            {mismatch ? "（入力したカロリーと差があります）" : ""}
          </span>
          {mismatch ? (
            <button
              type="button"
              className="min-h-8 rounded-lg bg-rubber px-2.5 font-bold text-chalk active:bg-line"
              onClick={() => onChange(withValue(draft, "energyKcal", String(fromMacros)))}
            >
              この値にする
            </button>
          ) : null}
        </div>
      ) : null}
      {hint ? <p className="text-xs leading-relaxed text-ash">{hint}</p> : null}
    </div>
  );
}

/** 名前の入力 */
export function NameField({
  draft,
  onChange,
  placeholder = "例: 鶏むね肉のソテー",
  error,
}: {
  draft: ItemDraft;
  onChange: (draft: ItemDraft) => void;
  placeholder?: string;
  error?: string | null;
}) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-bold">
        名前
      </label>
      <input
        id={id}
        type="text"
        className="field scroll-mt-focus"
        maxLength={80}
        autoComplete="off"
        enterKeyHint="next"
        placeholder={placeholder}
        value={draft.name}
        aria-invalid={error ? true : undefined}
        onChange={(e) => onChange({ ...draft, name: e.target.value })}
      />
      {error ? <p className="text-xs text-plate-red-bright">{error}</p> : null}
    </div>
  );
}
