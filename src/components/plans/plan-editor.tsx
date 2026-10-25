"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconArrowDown, IconArrowUp, IconCalendar, IconMinus, IconPlus, IconTrash } from "@/components/ui/icons";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { DEFAULT_REST_SECONDS } from "@/lib/config";
import { deletePlan, savePlan, type PlanExerciseInput } from "@/lib/data/plans";
import { isValidISODate } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { COMMON_EXERCISES } from "@/lib/exercises";
import { formatKg, formatRest, formatTarget, parseDecimal, parseInteger } from "@/lib/format";
import { isUniform, MAX_SETS_PER_EXERCISE, planSetTargets, uniformTargets, type SetTarget } from "@/lib/set-targets";
import { createClient } from "@/lib/supabase/client";
import type { PlanExercise, PlanWithExercises } from "@/types/app";

/** セットごとの入力 1 行 */
type EditorSet = { key: string; weight: string; reps: string };

type EditorExercise = {
  key: string;
  id: string | null;
  name: string;
  /** same = 全セット同じ（重量・回数・セット数を1つずつ）、perSet = セットごとに重量・回数を入れる */
  mode: "same" | "perSet";
  weight: string;
  reps: string;
  sets: string;
  rows: EditorSet[];
  rest: number;
  note: string;
  showNote: boolean;
};

type FieldErrors = Record<string, string>;

const REST_OPTIONS = [0, 30, 45, 60, 75, 90, 105, 120, 150, 180, 240, 300];
const DEFAULT_SET_COUNT = 3;

let keySeed = 0;
function nextKey(prefix = "ex"): string {
  keySeed += 1;
  return `${prefix}-${keySeed}`;
}

function weightText(value: number | null): string {
  return value == null ? "" : formatKg(value);
}

function makeRows(count: number, weight: string, reps: string): EditorSet[] {
  return Array.from({ length: count }, () => ({ key: nextKey("set"), weight, reps }));
}

function fromPlanExercise(exercise: PlanExercise, keepId: boolean): EditorExercise {
  const targets = planSetTargets(exercise);
  const first = targets[0] ?? { weightKg: exercise.target_weight_kg, reps: exercise.target_reps };
  return {
    key: nextKey(),
    id: keepId ? exercise.id : null,
    name: exercise.name,
    mode: isUniform(targets) ? "same" : "perSet",
    weight: weightText(first.weightKg),
    reps: String(first.reps),
    sets: String(targets.length),
    rows: targets.map((t) => ({ key: nextKey("set"), weight: weightText(t.weightKg), reps: String(t.reps) })),
    rest: exercise.rest_seconds,
    note: exercise.note ?? "",
    showNote: Boolean(exercise.note),
  };
}

function emptyExercise(rest = DEFAULT_REST_SECONDS): EditorExercise {
  return {
    key: nextKey(),
    id: null,
    name: "",
    mode: "same",
    weight: "",
    reps: "10",
    sets: String(DEFAULT_SET_COUNT),
    rows: [],
    rest,
    note: "",
    showNote: false,
  };
}

/** 「セット」欄の値をセットごとの行数にする（空・不正なら 3、範囲外は 1〜20 に収める） */
function rowCountFrom(setsText: string): number {
  const parsed = parseInteger(setsText);
  if (parsed === null || Number.isNaN(parsed)) return DEFAULT_SET_COUNT;
  return Math.min(MAX_SETS_PER_EXERCISE, Math.max(1, parsed));
}

/** 「60」と「60.0」を同じ値として比べる */
function sameNumber(a: string, b: string): boolean {
  const x = parseDecimal(a);
  const y = parseDecimal(b);
  if (x === null || y === null) return x === y;
  if (Number.isNaN(x) || Number.isNaN(y)) return a.trim() === b.trim();
  return x === y;
}

function rowsAreUniform(rows: EditorSet[]): boolean {
  const [first, ...rest] = rows;
  return !first || rest.every((r) => sameNumber(r.weight, first.weight) && sameNumber(r.reps, first.reps));
}

/** 重量（空 = 自重 = null）。不正なら undefined */
function readWeight(text: string): number | null | undefined {
  const value = parseDecimal(text);
  if (value === null) return null;
  if (Number.isNaN(value) || value < 0 || value >= 1000) return undefined;
  return value;
}

/** 回数（1〜999）。不正なら undefined */
function readReps(text: string): number | undefined {
  const value = parseInteger(text);
  if (value === null || Number.isNaN(value) || value < 1 || value > 999) return undefined;
  return value;
}

function validateSame(e: EditorExercise, found: FieldErrors): SetTarget[] {
  const weight = readWeight(e.weight);
  const reps = readReps(e.reps);
  const sets = parseInteger(e.sets);
  if (weight === undefined) found[`${e.key}.weight`] = "0〜999";
  if (reps === undefined) found[`${e.key}.reps`] = "1〜999";
  if (sets === null || Number.isNaN(sets) || sets < 1 || sets > MAX_SETS_PER_EXERCISE) {
    found[`${e.key}.sets`] = `1〜${MAX_SETS_PER_EXERCISE}`;
    return [];
  }
  if (weight === undefined || reps === undefined) return [];
  return uniformTargets({ weightKg: weight, reps }, sets);
}

function validatePerSet(e: EditorExercise, found: FieldErrors): SetTarget[] {
  const targets: SetTarget[] = [];
  for (const row of e.rows) {
    const weight = readWeight(row.weight);
    const reps = readReps(row.reps);
    if (weight === undefined) found[`${e.key}.${row.key}.weight`] = "重量は0〜999";
    if (reps === undefined) found[`${e.key}.${row.key}.reps`] = "回数は1〜999";
    if (weight !== undefined && reps !== undefined) targets.push({ weightKg: weight, reps });
  }
  return targets;
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

  function dropErrors(match: (errorKey: string) => boolean) {
    setErrors((current) => {
      const keys = Object.keys(current).filter(match);
      if (keys.length === 0) return current;
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
  }

  function updateExercise(key: string, change: (exercise: EditorExercise) => EditorExercise) {
    setExercises((current) => current.map((e) => (e.key === key ? change(e) : e)));
  }

  function update(key: string, patch: Partial<EditorExercise>) {
    updateExercise(key, (e) => ({ ...e, ...patch }));
    const fields = Object.keys(patch).map((field) => `${key}.${field}`);
    dropErrors((errorKey) => fields.includes(errorKey));
  }

  function updateRow(exerciseKey: string, rowKey: string, patch: Partial<Omit<EditorSet, "key">>) {
    updateExercise(exerciseKey, (e) => ({
      ...e,
      rows: e.rows.map((row) => (row.key === rowKey ? { ...row, ...patch } : row)),
    }));
    const fields = Object.keys(patch).map((field) => `${exerciseKey}.${rowKey}.${field}`);
    dropErrors((errorKey) => fields.includes(errorKey));
  }

  function addRow(exerciseKey: string) {
    updateExercise(exerciseKey, (e) => {
      if (e.rows.length >= MAX_SETS_PER_EXERCISE) return e;
      const last = e.rows[e.rows.length - 1];
      return { ...e, rows: [...e.rows, { key: nextKey("set"), weight: last?.weight ?? "", reps: last?.reps ?? "10" }] };
    });
  }

  function removeLastRow(exerciseKey: string) {
    updateExercise(exerciseKey, (e) => (e.rows.length <= 1 ? e : { ...e, rows: e.rows.slice(0, -1) }));
  }

  /** 全セット同じ → セットごと（今の重量・回数をセット数ぶん並べる） */
  function switchToPerSet(exercise: EditorExercise) {
    update(exercise.key, {
      mode: "perSet",
      rows: makeRows(rowCountFrom(exercise.sets), exercise.weight.trim(), exercise.reps.trim()),
    });
    const fields = ["weight", "reps", "sets"].map((field) => `${exercise.key}.${field}`);
    dropErrors((errorKey) => fields.includes(errorKey));
  }

  /** セットごと → 全セット同じ（違う値があれば 1 セット目にそろえてよいか確認） */
  async function switchToSame(exercise: EditorExercise) {
    const first = exercise.rows[0];
    if (first && !rowsAreUniform(exercise.rows)) {
      const weight = readWeight(first.weight);
      const reps = readReps(first.reps);
      const preview = formatTarget(weight ?? null, reps ?? null);
      const ok = await confirm({
        title: "全セットをそろえますか？",
        message: `2セット目以降の重量・回数を、1セット目（${preview}）と同じにします。`,
        confirmLabel: "そろえる",
      });
      if (!ok) return;
    }
    update(exercise.key, {
      mode: "same",
      weight: first?.weight ?? exercise.weight,
      reps: first?.reps ?? exercise.reps,
      sets: String(exercise.rows.length || rowCountFrom(exercise.sets)),
    });
    dropErrors((errorKey) => errorKey.startsWith(`${exercise.key}.set-`));
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
      if (!e.name.trim()) found[`${e.key}.name`] = "種目名を入力してください";
      return {
        id: e.id,
        name: e.name.trim(),
        sets: e.mode === "same" ? validateSame(e, found) : validatePerSet(e, found),
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
                dropErrors((errorKey) => errorKey === "title");
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

                {exercise.mode === "same" ? (
                  <>
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
                    <div className="mt-1 pl-8 max-[359px]:pl-0">
                      <ModeSwitch onClick={() => switchToPerSet(exercise)}>セットごとに重量・回数を変える</ModeSwitch>
                    </div>
                  </>
                ) : (
                  <SetRowsEditor
                    exerciseKey={exercise.key}
                    exerciseNumber={index + 1}
                    rows={exercise.rows}
                    errors={errors}
                    onChangeRow={(rowKey, patch) => updateRow(exercise.key, rowKey, patch)}
                    onAddRow={() => addRow(exercise.key)}
                    onRemoveLastRow={() => removeLastRow(exercise.key)}
                    onMakeSame={() => void switchToSame(exercise)}
                  />
                )}

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

/** 「全セット同じ／セットごと」を切り替える文字ボタン */
function ModeSwitch({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="min-h-10 text-left text-sm font-bold text-plate-blue-bright underline underline-offset-4"
    >
      {children}
    </button>
  );
}

/** セットごとの重量・回数の入力（1 行 = 1 セット） */
function SetRowsEditor({
  exerciseKey,
  exerciseNumber,
  rows,
  errors,
  onChangeRow,
  onAddRow,
  onRemoveLastRow,
  onMakeSame,
}: {
  exerciseKey: string;
  exerciseNumber: number;
  rows: EditorSet[];
  errors: FieldErrors;
  onChangeRow: (rowKey: string, patch: Partial<Omit<EditorSet, "key">>) => void;
  onAddRow: () => void;
  onRemoveLastRow: () => void;
  onMakeSame: () => void;
}) {
  return (
    <div className="mt-3 pl-8 max-[359px]:pl-0">
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
        <span className="text-center text-[11px] font-bold text-ash">セット</span>
        <span className="text-xs font-bold text-ash">
          重量<span className="ml-1 font-normal">kg</span>
        </span>
        <span className="text-xs font-bold text-ash">
          回数<span className="ml-1 font-normal">回</span>
        </span>
        {rows.map((row, rowIndex) => {
          const setNumber = rowIndex + 1;
          const weightError = errors[`${exerciseKey}.${row.key}.weight`];
          const repsError = errors[`${exerciseKey}.${row.key}.reps`];
          return (
            <Fragment key={row.key}>
              <span className="num text-center text-base font-bold text-ash">{setNumber}</span>
              <input
                className="field num px-2 text-center text-lg font-bold"
                inputMode="decimal"
                autoComplete="off"
                placeholder="自重"
                aria-label={`${exerciseNumber}番目の種目の${setNumber}セット目の重量（kg）`}
                aria-invalid={weightError ? true : undefined}
                value={row.weight}
                onChange={(e) => onChangeRow(row.key, { weight: e.target.value })}
              />
              <input
                className="field num px-2 text-center text-lg font-bold"
                inputMode="numeric"
                autoComplete="off"
                aria-label={`${exerciseNumber}番目の種目の${setNumber}セット目の回数`}
                aria-invalid={repsError ? true : undefined}
                value={row.reps}
                onChange={(e) => onChangeRow(row.key, { reps: e.target.value })}
              />
              {weightError || repsError ? (
                <p className="col-span-2 col-start-2 -mt-1 text-xs text-plate-red-bright">
                  {[weightError, repsError].filter(Boolean).join("、")}
                </p>
              ) : null}
            </Fragment>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap gap-1">
        <Button variant="ghost" size="sm" disabled={rows.length >= MAX_SETS_PER_EXERCISE} onClick={onAddRow}>
          <IconPlus size={16} />
          セット追加
        </Button>
        <Button variant="ghost" size="sm" disabled={rows.length <= 1} onClick={onRemoveLastRow}>
          <IconMinus size={16} />
          セット削除
        </Button>
      </div>
      <ModeSwitch onClick={onMakeSame}>全セット同じにする</ModeSwitch>
    </div>
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
