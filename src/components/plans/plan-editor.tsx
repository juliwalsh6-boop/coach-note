"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconArrowDown, IconArrowUp, IconCalendar, IconPlus, IconTrash } from "@/components/ui/icons";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { DEFAULT_REST_SECONDS } from "@/lib/config";
import { deletePlan, savePlan, type PlanExerciseInput } from "@/lib/data/plans";
import { isValidISODate } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { COMMON_EXERCISES } from "@/lib/exercises";
import { formatKg, formatRest, parseDecimal, parseInteger } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { PlanExercise, PlanWithExercises } from "@/types/app";

type EditorExercise = {
  key: string;
  id: string | null;
  name: string;
  weight: string;
  reps: string;
  sets: string;
  rest: number;
  note: string;
  showNote: boolean;
};

type FieldErrors = Record<string, string>;

const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300];

let keySeed = 0;
function nextKey(): string {
  keySeed += 1;
  return `ex-${keySeed}`;
}

function fromPlanExercise(exercise: PlanExercise, keepId: boolean): EditorExercise {
  return {
    key: nextKey(),
    id: keepId ? exercise.id : null,
    name: exercise.name,
    weight: exercise.target_weight_kg == null ? "" : formatKg(exercise.target_weight_kg),
    reps: String(exercise.target_reps),
    sets: String(exercise.target_sets),
    rest: exercise.rest_seconds,
    note: exercise.note ?? "",
    showNote: Boolean(exercise.note),
  };
}

function emptyExercise(rest = DEFAULT_REST_SECONDS): EditorExercise {
  return { key: nextKey(), id: null, name: "", weight: "", reps: "10", sets: "3", rest, note: "", showNote: false };
}

type PlanEditorProps = {
  clientId: string;
  clientName: string;
  today: string;
  /** 編集するメニュー（新規作成なら null） */
  plan: PlanWithExercises | null;
  /** 複製元のメニュー（新規作成時のみ） */
  template?: PlanWithExercises | null;
  suggestions: string[];
};

export function PlanEditor({ clientId, clientName, today, plan, template = null, suggestions }: PlanEditorProps) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const source = plan ?? template;
  const isEdit = plan !== null;

  const [title, setTitle] = useState(() => (plan ? plan.title : template ? `${template.title}（コピー）` : ""));
  const [dateMode, setDateMode] = useState<"date" | "anytime">(() =>
    plan && plan.scheduled_date === null ? "anytime" : "date",
  );
  const [date, setDate] = useState(() => plan?.scheduled_date ?? today);
  const [note, setNote] = useState(() => source?.note ?? "");
  const [exercises, setExercises] = useState<EditorExercise[]>(() =>
    source && source.exercises.length > 0
      ? source.exercises.map((e) => fromPlanExercise(e, isEdit))
      : [emptyExercise()],
  );
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const nameInputs = useRef(new Map<string, HTMLInputElement>());

  const backHref = `/trainer/clients/${clientId}`;
  const suggestionList = Array.from(new Set([...suggestions, ...COMMON_EXERCISES]));

  function update(key: string, patch: Partial<EditorExercise>) {
    setExercises((current) => current.map((e) => (e.key === key ? { ...e, ...patch } : e)));
    if (Object.keys(patch).some((field) => errors[`${key}.${field}`])) {
      setErrors((current) => {
        const next = { ...current };
        for (const field of Object.keys(patch)) delete next[`${key}.${field}`];
        return next;
      });
    }
  }

  function move(index: number, delta: -1 | 1) {
    setExercises((current) => {
      const target = index + delta;
      if (target < 0 || target >= current.length) return current;
      const next = [...current];
      const [item] = next.splice(index, 1);
      if (item) next.splice(target, 0, item);
      return next;
    });
  }

  async function remove(exercise: EditorExercise) {
    const name = exercise.name.trim();
    if (name && !(await confirm({ title: `「${name}」をメニューから外しますか？`, confirmLabel: "外す", tone: "danger" }))) {
      return;
    }
    setExercises((current) => current.filter((e) => e.key !== exercise.key));
  }

  function addExercise() {
    const last = exercises[exercises.length - 1];
    const created = emptyExercise(last?.rest ?? DEFAULT_REST_SECONDS);
    setExercises((current) => [...current, created]);
    window.setTimeout(() => nameInputs.current.get(created.key)?.focus(), 50);
  }

  function validate(): { input: PlanExerciseInput[]; errors: FieldErrors; general: string | null } {
    const found: FieldErrors = {};
    let general: string | null = null;
    if (!title.trim()) found.title = "メニュー名を入力してください";
    if (dateMode === "date" && !isValidISODate(date)) found.date = "日付を選んでください";
    if (exercises.length === 0) general = "種目を1つ以上追加してください";

    const input: PlanExerciseInput[] = exercises.map((e) => {
      const weight = parseDecimal(e.weight);
      const reps = parseInteger(e.reps);
      const sets = parseInteger(e.sets);
      if (!e.name.trim()) found[`${e.key}.name`] = "種目名を入力してください";
      if (weight !== null && (Number.isNaN(weight) || weight < 0 || weight >= 1000)) {
        found[`${e.key}.weight`] = "0〜999";
      }
      if (reps === null || Number.isNaN(reps) || reps < 1 || reps > 999) found[`${e.key}.reps`] = "1〜999";
      if (sets === null || Number.isNaN(sets) || sets < 1 || sets > 20) found[`${e.key}.sets`] = "1〜20";
      return {
        id: e.id,
        name: e.name.trim(),
        target_weight_kg: weight !== null && !Number.isNaN(weight) ? weight : null,
        target_reps: reps ?? 0,
        target_sets: sets ?? 0,
        rest_seconds: e.rest,
        note: e.note.trim() === "" ? null : e.note.trim(),
      };
    });
    return { input, errors: found, general };
  }

  async function save() {
    const result = validate();
    setErrors(result.errors);
    if (result.general || Object.keys(result.errors).length > 0) {
      setFormError(result.general ?? "入力内容を確認してください（赤枠の項目）");
      return;
    }
    setFormError(null);
    setSaving(true);
    try {
      await savePlan(createClient(), {
        planId: plan?.id ?? null,
        clientId,
        title: title.trim(),
        scheduledDate: dateMode === "date" ? date : null,
        note: note.trim() === "" ? null : note.trim(),
        exercises: result.input,
      });
      toast(isEdit ? "メニューを更新しました" : "メニューを作成しました", "success");
      router.push(backHref);
      router.refresh();
    } catch (e) {
      setFormError(toErrorMessage(e));
      setSaving(false);
    }
  }

  async function removePlan() {
    if (!plan) return;
    const ok = await confirm({
      title: "このメニューを削除しますか？",
      message: "クライアントの画面からも消えます。実施済みのトレーニング記録は残ります。",
      confirmLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deletePlan(createClient(), plan.id);
      toast("メニューを削除しました", "success");
      router.push(backHref);
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
      setDeleting(false);
    }
  }

  return (
    <>
      <form
        id="plan-form"
        className="space-y-6"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <section className="panel space-y-5 p-5">
          <div className="space-y-1.5">
            <label htmlFor="plan-title" className="text-sm font-bold">
              メニュー名
            </label>
            <input
              id="plan-title"
              className="field text-lg font-bold"
              maxLength={60}
              placeholder="例: 胸・肩・三頭"
              aria-invalid={errors.title ? true : undefined}
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                if (errors.title) {
                  setErrors((current) => {
                    const next = { ...current };
                    delete next.title;
                    return next;
                  });
                }
              }}
            />
            {errors.title ? <p className="text-xs text-plate-red-bright">{errors.title}</p> : null}
          </div>

          <fieldset className="space-y-2">
            <legend className="mb-1.5 text-sm font-bold">実施日</legend>
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-iron p-1">
              {(
                [
                  ["date", "日付を指定"],
                  ["anytime", "いつでも"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={dateMode === mode}
                  onClick={() => setDateMode(mode)}
                  className={cn(
                    "min-h-10 rounded-xl text-sm font-bold transition-colors",
                    dateMode === mode ? "bg-rubber text-chalk" : "text-ash",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            {dateMode === "date" ? (
              <div className="relative">
                <input
                  type="date"
                  className="field num pl-11"
                  aria-label="実施日"
                  aria-invalid={errors.date ? true : undefined}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
                <IconCalendar size={20} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ash" />
              </div>
            ) : (
              <p className="text-xs text-ash">クライアントのホームの「いつでもできるメニュー」に表示されます。</p>
            )}
            {errors.date ? <p className="text-xs text-plate-red-bright">{errors.date}</p> : null}
          </fieldset>

          <div className="space-y-1.5">
            <label htmlFor="plan-note" className="flex items-baseline gap-2 text-sm font-bold">
              メニュー全体のメモ
              <span className="text-xs font-normal text-ash">任意</span>
            </label>
            <textarea
              id="plan-note"
              className="field min-h-[72px] resize-none"
              rows={2}
              maxLength={1000}
              placeholder="例: 3セット目はRPE8を目安に"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-[17px] font-bold">
            種目 <span className="num text-ash">{exercises.length}</span>
          </h2>
          <ol className="space-y-3">
            {exercises.map((exercise, index) => (
              <li key={exercise.key} className="panel p-4">
                <div className="flex items-start gap-2">
                  <span className="num mt-3 w-6 shrink-0 text-center text-sm font-bold text-ash">{index + 1}</span>
                  <div className="min-w-0 flex-1 space-y-1">
                    <input
                      ref={(el) => {
                        if (el) nameInputs.current.set(exercise.key, el);
                        else nameInputs.current.delete(exercise.key);
                      }}
                      className="field font-bold"
                      list="exercise-suggestions"
                      maxLength={60}
                      placeholder="種目名（例: ベンチプレス）"
                      aria-label={`${index + 1}番目の種目名`}
                      aria-invalid={errors[`${exercise.key}.name`] ? true : undefined}
                      value={exercise.name}
                      onChange={(e) => update(exercise.key, { name: e.target.value })}
                    />
                    {errors[`${exercise.key}.name`] ? (
                      <p className="text-xs text-plate-red-bright">{errors[`${exercise.key}.name`]}</p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 pl-8 max-[359px]:pl-0">
                  <NumberField
                    label="重量"
                    unit="kg"
                    inputMode="decimal"
                    placeholder="自重"
                    value={exercise.weight}
                    error={errors[`${exercise.key}.weight`]}
                    onChange={(weight) => update(exercise.key, { weight })}
                  />
                  <NumberField
                    label="回数"
                    unit="回"
                    inputMode="numeric"
                    value={exercise.reps}
                    error={errors[`${exercise.key}.reps`]}
                    onChange={(reps) => update(exercise.key, { reps })}
                  />
                  <NumberField
                    label="セット"
                    unit=""
                    inputMode="numeric"
                    value={exercise.sets}
                    error={errors[`${exercise.key}.sets`]}
                    onChange={(sets) => update(exercise.key, { sets })}
                  />
                </div>

                <div className="mt-3 flex items-center gap-2 pl-8 max-[359px]:pl-0">
                  <label className="shrink-0 text-xs font-bold text-ash" htmlFor={`rest-${exercise.key}`}>
                    休憩
                  </label>
                  <select
                    id={`rest-${exercise.key}`}
                    className="field num min-h-10 w-auto flex-1 py-1.5"
                    value={exercise.rest}
                    onChange={(e) => update(exercise.key, { rest: Number(e.target.value) })}
                  >
                    {Array.from(new Set([...REST_OPTIONS, exercise.rest]))
                      .sort((a, b) => a - b)
                      .map((seconds) => (
                        <option key={seconds} value={seconds}>
                          {formatRest(seconds)}
                        </option>
                      ))}
                  </select>
                  {!exercise.showNote ? (
                    <Button variant="ghost" size="sm" onClick={() => update(exercise.key, { showNote: true })}>
                      メモを追加
                    </Button>
                  ) : null}
                </div>

                {exercise.showNote ? (
                  <div className="mt-3 pl-8 max-[359px]:pl-0">
                    <textarea
                      className="field min-h-[64px] resize-none text-sm"
                      rows={2}
                      maxLength={300}
                      placeholder="フォームの注意点など（クライアントの画面に表示）"
                      aria-label={`${index + 1}番目の種目のメモ`}
                      value={exercise.note}
                      onChange={(e) => update(exercise.key, { note: e.target.value })}
                    />
                  </div>
                ) : null}

                <div className="mt-3 flex items-center justify-end gap-1 border-t border-line pt-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`${index + 1}番目の種目を上へ`}
                  >
                    <IconArrowUp size={16} />
                    上へ
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={index === exercises.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`${index + 1}番目の種目を下へ`}
                  >
                    <IconArrowDown size={16} />
                    下へ
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={exercises.length === 1}
                    onClick={() => void remove(exercise)}
                    aria-label={`${index + 1}番目の種目を削除`}
                  >
                    <IconTrash size={16} />
                    削除
                  </Button>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-3">
            <Button variant="secondary" size="lg" block onClick={addExercise} disabled={exercises.length >= 30}>
              <IconPlus size={20} />
              種目を追加
            </Button>
          </div>
          <datalist id="exercise-suggestions">
            {suggestionList.map((name) => (
              <option key={name} value={name} />
            ))}
          </datalist>
        </section>

        {formError ? <Notice tone="error">{formError}</Notice> : null}

        {isEdit ? (
          <div className="space-y-3 border-t border-line pt-6">
            <Link
              href={`/trainer/clients/${clientId}/plans/new?from=${plan.id}`}
              className="block text-center text-sm text-plate-blue-bright underline underline-offset-4"
            >
              このメニューを複製して新しく作る
            </Link>
            <Button variant="danger" block loading={deleting} onClick={() => void removePlan()}>
              このメニューを削除
            </Button>
          </div>
        ) : null}
      </form>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-iron/95 pb-safe backdrop-blur-md">
        <div className="mx-auto flex max-w-[480px] items-center gap-2 px-4 py-3">
          <Link href={backHref} className="flex min-h-14 items-center px-3 text-sm font-bold text-ash">
            キャンセル
          </Link>
          <div className="flex-1">
            <Button type="submit" form="plan-form" size="lg" block loading={saving}>
              {isEdit ? "変更を保存" : `${clientName}さんに渡す`}
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}

function NumberField({
  label,
  unit,
  value,
  onChange,
  inputMode,
  placeholder,
  error,
}: {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  inputMode: "decimal" | "numeric";
  placeholder?: string;
  error?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 block text-xs font-bold text-ash">
        {label}
        {unit ? <span className="ml-1 font-normal">{unit}</span> : null}
      </span>
      {/* 単位は見出し側に出し、入力欄の幅はすべて数字に使う（102.5 も欠けない） */}
      <input
        className="field num px-2 text-center text-lg font-bold"
        inputMode={inputMode}
        autoComplete="off"
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      {error ? <span className="mt-1 block text-xs text-plate-red-bright">{error}</span> : null}
    </label>
  );
}
