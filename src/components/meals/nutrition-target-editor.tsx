"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { IconEdit, IconTrash } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { deleteTarget, saveTarget } from "@/lib/data/nutrition-targets";
import { addDaysISO, formatDateLong, formatDateShort } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { formatKg } from "@/lib/format";
import { NUTRIENT_LABELS, NUTRIENT_SHORT, formatNutrient } from "@/lib/nutrition/format";
import { NUTRIENT_KEYS, defaultTolerance, type NutrientKey } from "@/lib/nutrition/nutrients";
import { targetValues, type TargetValues } from "@/lib/nutrition/rows";
import {
  MAX_DAYS_AHEAD,
  NOTE_MAX,
  initialTargetForm,
  macroEnergyCheck,
  parsedTargetTexts,
  proteinPerKg,
  validateTargetForm,
  type TargetFormField,
  type TargetFormValues,
} from "@/lib/nutrition/target-form";
import { createClient } from "@/lib/supabase/client";
import type { NutritionTarget } from "@/types/app";
import { NUTRIENT_COLORS } from "./nutrition-summary";

function unitOf(key: NutrientKey): string {
  return key === "energyKcal" ? "kcal" : "g";
}

function TargetValuesLine({ values }: { values: TargetValues }) {
  return (
    <p className="num flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
      <span>
        <span className="text-lg font-extrabold">{formatNutrient("energyKcal", values.target.energyKcal)}</span>
        <span className="text-xs text-ash">kcal ±{formatNutrient("energyKcal", values.tolerance.energyKcal)}</span>
      </span>
      {(["proteinG", "fatG", "carbsG"] as const).map((key) => (
        <span key={key} className="whitespace-nowrap">
          <span className={cn("font-bold", NUTRIENT_COLORS[key].text)}>{NUTRIENT_SHORT[key]}</span>{" "}
          <span className="font-bold">{formatNutrient(key, values.target[key])}</span>
          <span className="text-xs text-ash">g ±{formatNutrient(key, values.tolerance[key])}</span>
        </span>
      ))}
    </p>
  );
}

function NumberField({
  label,
  nutrient,
  value,
  placeholder,
  error,
  prefix,
  onChange,
}: {
  label: string;
  nutrient: NutrientKey;
  value: string;
  placeholder: string;
  error?: string;
  prefix?: string;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <div>
      <div
        className={cn(
          "min-w-0 rounded-xl bg-iron px-3 pt-2 pb-1.5 focus-within:ring-1 focus-within:ring-plate-blue-bright",
          error && "ring-1 ring-plate-red",
        )}
      >
        <label htmlFor={id} className="flex items-baseline gap-1 text-[11px] font-bold text-ash">
          <span className={cn("num", NUTRIENT_COLORS[nutrient].text)}>{NUTRIENT_SHORT[nutrient]}</span>
          {label}
        </label>
        <div className="flex items-baseline gap-1">
          {prefix ? <span className="text-sm text-ash">{prefix}</span> : null}
          <input
            id={id}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            enterKeyHint="next"
            className="num scroll-mt-focus w-full min-w-0 bg-transparent py-0.5 text-xl font-bold text-chalk placeholder:text-base placeholder:font-normal placeholder:text-ash/70 focus:outline-none"
            value={value}
            placeholder={placeholder}
            aria-invalid={error ? true : undefined}
            onChange={(e) => onChange(e.target.value)}
          />
          <span className="shrink-0 text-xs text-ash">{unitOf(nutrient)}</span>
        </div>
      </div>
      {error ? <p className="mt-1 text-xs text-plate-red-bright">{error}</p> : null}
    </div>
  );
}

/**
 * トレーナー: クライアントの栄養目標の設定と履歴。
 * 目標は「適用開始日」ごとの履歴で、変更しても過去の日の目標・記録は書き換わらない。
 */
export function NutritionTargetEditor({
  clientId,
  clientName,
  today,
  targets,
  bodyWeightKg,
}: {
  clientId: string;
  clientName: string;
  today: string;
  /** 適用開始日の新しい順 */
  targets: NutritionTarget[];
  bodyWeightKg: number | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const db = useMemo(() => createClient(), []);
  const dateId = useId();
  const noteId = useId();

  const current = targets.find((t) => t.effective_from <= today) ?? null;
  const upcoming = targets.filter((t) => t.effective_from > today).sort((a, b) => a.effective_from.localeCompare(b.effective_from));
  const past = targets.filter((t) => t.effective_from <= today && t.id !== current?.id);

  const [values, setValues] = useState<TargetFormValues>(() => initialTargetForm(current ? targetValues(current) : null, today));
  const [errors, setErrors] = useState<Partial<Record<TargetFormField, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const parsed = parsedTargetTexts(values.target);
  const energyCheck = macroEnergyCheck(parsed);
  const autoTolerance =
    parsed.energyKcal != null && parsed.proteinG != null && parsed.fatG != null && parsed.carbsG != null
      ? defaultTolerance({ energyKcal: parsed.energyKcal, proteinG: parsed.proteinG, fatG: parsed.fatG, carbsG: parsed.carbsG })
      : null;
  const perKg = proteinPerKg(parsed.proteinG, bodyWeightKg);
  const sameDate = targets.find((t) => t.effective_from === values.effectiveFrom) ?? null;

  function setTarget(key: NutrientKey, text: string) {
    setValues((v) => ({ ...v, target: { ...v.target, [key]: text } }));
    setErrors((e) => ({ ...e, [`target.${key}`]: undefined }));
  }

  function setTolerance(key: NutrientKey, text: string) {
    setValues((v) => ({ ...v, tolerance: { ...v.tolerance, [key]: text } }));
    setErrors((e) => ({ ...e, [`tolerance.${key}`]: undefined }));
  }

  function editUpcoming(target: NutritionTarget) {
    const initial = initialTargetForm(targetValues(target), today);
    setValues({ ...initial, effectiveFrom: target.effective_from, note: target.note ?? "" });
    setErrors({});
    document.getElementById("target-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function submit() {
    const result = validateTargetForm(values, today);
    if (!result.ok) {
      setErrors(result.errors);
      toast("入力内容を確認してください", "error");
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      await saveTarget(db, {
        clientId,
        effectiveFrom: result.effectiveFrom,
        target: result.target,
        tolerance: result.tolerance,
        note: result.note,
      });
      toast(
        result.effectiveFrom === today
          ? "目標を保存しました。今日から新しい目標で表示されます"
          : `目標を保存しました。${formatDateShort(result.effectiveFrom)}から適用されます`,
        "success",
      );
      setValues((v) => ({
        ...v,
        tolerance: {
          energyKcal: String(result.tolerance.energyKcal),
          proteinG: String(result.tolerance.proteinG),
          fatG: String(result.tolerance.fatG),
          carbsG: String(result.tolerance.carbsG),
        },
      }));
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  async function remove(target: NutritionTarget) {
    const ok = await confirm({
      title: `${formatDateShort(target.effective_from)}からの目標を削除しますか？`,
      message: "まだ始まっていない予定の目標です。削除すると、その日以降もいまの目標が続きます。",
      confirmLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(target.id);
    try {
      await deleteTarget(db, target.id);
      toast("予定の目標を削除しました", "success");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-6">
      <section className="panel p-5" aria-labelledby="current-target-title">
        <h2 id="current-target-title" className="text-sm font-bold">
          いまの目標
        </h2>
        {current ? (
          <>
            <div className="mt-2">
              <TargetValuesLine values={targetValues(current)} />
            </div>
            <p className="mt-2 text-xs text-ash">{formatDateLong(current.effective_from)}から適用中</p>
            {current.note ? <p className="mt-2 rounded-lg bg-rubber/60 px-3 py-2 text-sm whitespace-pre-wrap">{current.note}</p> : null}
          </>
        ) : (
          <p className="mt-2 text-sm text-ash">
            まだ目標がありません。下のフォームで設定すると、{clientName}さんの食事の画面に目標と残りの量が表示されます。
          </p>
        )}
      </section>

      <section id="target-form" className="scroll-mt-4 space-y-4" aria-labelledby="target-form-title">
        <div>
          <h2 id="target-form-title" className="text-[17px] font-bold">
            {current ? "目標を変更する" : "目標を設定する"}
          </h2>
          <p className="mt-1 text-xs leading-relaxed text-ash">
            適用開始日から新しい目標で判定します。それより前の日の目標と記録はそのまま残り、書き換わりません。
          </p>
        </div>

        <div>
          <label htmlFor={dateId} className="text-sm font-bold">
            適用開始日
          </label>
          <input
            id={dateId}
            type="date"
            className="field scroll-mt-focus mt-1.5"
            min={today}
            max={addDaysISO(today, MAX_DAYS_AHEAD)}
            value={values.effectiveFrom}
            aria-invalid={errors.effectiveFrom ? true : undefined}
            onChange={(e) => {
              const next = e.target.value;
              setValues((v) => ({ ...v, effectiveFrom: next }));
              setErrors((er) => ({ ...er, effectiveFrom: undefined }));
            }}
          />
          {errors.effectiveFrom ? <p className="mt-1 text-xs text-plate-red-bright">{errors.effectiveFrom}</p> : null}
          {sameDate && !errors.effectiveFrom ? (
            <p className="mt-1 text-xs text-plate-yellow">この日から適用する目標はすでにあります。保存すると上書きします。</p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold">1 日の目標</p>
          <div className="grid grid-cols-2 gap-2">
            {NUTRIENT_KEYS.map((key) => (
              <NumberField
                key={key}
                label={NUTRIENT_LABELS[key]}
                nutrient={key}
                value={values.target[key]}
                placeholder={key === "energyKcal" ? "例: 2200" : key === "proteinG" ? "例: 140" : key === "fatG" ? "例: 60" : "例: 270"}
                error={errors[`target.${key}`]}
                onChange={(text) => setTarget(key, text)}
              />
            ))}
          </div>
          {energyCheck ? (
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-ash">
              <span className={energyCheck.mismatch ? "text-plate-yellow" : undefined}>
                P・F・C から計算すると {formatNutrient("energyKcal", energyCheck.macroKcal)}kcal
                {energyCheck.mismatch ? `（目標カロリーと ${formatNutrient("energyKcal", Math.abs(energyCheck.diff))}kcal の差があります）` : ""}
              </span>
              {energyCheck.mismatch ? (
                <button
                  type="button"
                  className="min-h-8 rounded-lg bg-rubber px-2.5 font-bold text-chalk active:bg-line"
                  onClick={() => setTarget("energyKcal", String(energyCheck.macroKcal))}
                >
                  カロリーをこの値にする
                </button>
              ) : null}
            </div>
          ) : null}
          {bodyWeightKg != null ? (
            <p className="text-xs text-ash">
              直近の体重 {formatKg(bodyWeightKg)}kg
              {perKg != null ? ` → たんぱく質は体重 1kg あたり ${perKg}g` : ""}
            </p>
          ) : null}
        </div>

        <div className="space-y-2">
          <p className="text-sm font-bold">
            許容範囲（±）
            <span className="ml-1.5 text-xs font-normal text-ash">この幅に入れば「目標範囲内」</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            {NUTRIENT_KEYS.map((key) => (
              <NumberField
                key={key}
                label={NUTRIENT_LABELS[key]}
                nutrient={key}
                prefix="±"
                value={values.tolerance[key]}
                placeholder={autoTolerance ? `自動 ${formatNutrient(key, autoTolerance[key])}` : "自動"}
                error={errors[`tolerance.${key}`]}
                onChange={(text) => setTolerance(key, text)}
              />
            ))}
          </div>
          <p className="text-xs leading-relaxed text-ash">空欄にすると、目標のおよそ ±10% を自動で使います。</p>
        </div>

        <div>
          <label htmlFor={noteId} className="text-sm font-bold">
            メモ<span className="ml-1.5 text-xs font-normal text-ash">任意・クライアントには表示されません</span>
          </label>
          <textarea
            id={noteId}
            className="field scroll-mt-focus mt-1.5 min-h-[88px]"
            maxLength={NOTE_MAX}
            placeholder="例: 減量期。週 0.5kg ペース"
            value={values.note}
            onChange={(e) => setValues((v) => ({ ...v, note: e.target.value }))}
          />
          {errors.note ? <p className="mt-1 text-xs text-plate-red-bright">{errors.note}</p> : null}
        </div>

        <Button size="lg" block loading={saving} onClick={() => void submit()}>
          {values.effectiveFrom === today ? "今日から適用して保存" : `${values.effectiveFrom ? formatDateShort(values.effectiveFrom) : ""}から適用して保存`}
        </Button>
      </section>

      {upcoming.length > 0 ? (
        <section aria-labelledby="upcoming-title">
          <h2 id="upcoming-title" className="mb-2 text-[17px] font-bold">
            予定の目標
          </h2>
          <ul className="space-y-2">
            {upcoming.map((t) => (
              <li key={t.id} className="panel p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-bold">{formatDateLong(t.effective_from)}から</p>
                  <span className="rounded-full bg-plate-blue/15 px-2 py-0.5 text-[11px] font-bold text-plate-blue-bright">予定</span>
                </div>
                <div className="mt-2">
                  <TargetValuesLine values={targetValues(t)} />
                </div>
                {t.note ? <p className="mt-2 text-sm whitespace-pre-wrap text-ash">{t.note}</p> : null}
                <div className="mt-3 flex justify-end gap-2">
                  <Button size="sm" variant="secondary" onClick={() => editUpcoming(t)}>
                    <IconEdit size={16} />
                    編集
                  </Button>
                  <Button size="sm" variant="danger" loading={deletingId === t.id} onClick={() => void remove(t)}>
                    {deletingId === t.id ? null : <IconTrash size={16} />}
                    削除
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {past.length > 0 ? (
        <section aria-labelledby="history-title">
          <h2 id="history-title" className="mb-1 text-[17px] font-bold">
            これまでの目標
          </h2>
          <p className="mb-2 text-xs text-ash">過去の日の達成状況は、その日に適用されていた目標で判定しています（変更できません）。</p>
          <ul className="space-y-2">
            {past.map((t) => (
              <li key={t.id} className="rounded-2xl bg-steel px-4 py-3">
                <p className="text-xs text-ash">{formatDateLong(t.effective_from)}から</p>
                <div className="mt-1 opacity-85">
                  <TargetValuesLine values={targetValues(t)} />
                </div>
                {t.note ? <p className="mt-1 text-xs whitespace-pre-wrap text-ash">{t.note}</p> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {targets.length === 0 ? null : (
        <Notice tone="info">
          目標を保存すると、{clientName}さんの食事の画面（目標・残り・組み合わせの提案）にすぐ反映されます。
        </Notice>
      )}
    </div>
  );
}
