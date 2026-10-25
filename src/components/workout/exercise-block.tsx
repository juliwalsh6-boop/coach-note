"use client";

import { Button } from "@/components/ui/button";
import { IconCheck, IconMinus, IconPlus } from "@/components/ui/icons";
import { WEIGHT_STEP_KG } from "@/lib/config";
import { cn } from "@/lib/cn";
import { formatDateShort } from "@/lib/dates";
import { formatRest, formatSet, formatTarget } from "@/lib/format";
import { sessionTargetSummary } from "@/lib/set-targets";
import { isSetDone, stepValue, type SetDraft } from "@/lib/workout";
import type { PreviousRecord, SessionExerciseWithSets, SetLog } from "@/types/app";
import { SetText } from "@/components/ui/set-text";
import { Stepper } from "./stepper";

type ExerciseBlockProps = {
  index: number;
  exercise: SessionExerciseWithSets;
  previous: PreviousRecord | null;
  drafts: Record<string, SetDraft>;
  focusedSetId: string | null;
  savingSetIds: ReadonlySet<string>;
  busy: boolean;
  registerSet: (setId: string, element: HTMLElement | null) => void;
  /** 完了した直後のセット（チェックが弾む演出） */
  celebrateSetId?: string | null;
  /** この種目のセットをすべて完了した直後 */
  celebrateExercise?: boolean;
  onFocusSet: (setId: string) => void;
  onDraftChange: (setId: string, patch: Partial<SetDraft>) => void;
  onComplete: (exerciseId: string, setId: string) => void;
  onUncomplete: (exerciseId: string, setId: string) => void;
  onSaveEdit: (exerciseId: string, setId: string) => void;
  onAddSet: (exerciseId: string) => void;
  onRemoveLastSet: (exerciseId: string) => void;
};

export function ExerciseBlock({
  index,
  exercise,
  previous,
  drafts,
  focusedSetId,
  savingSetIds,
  busy,
  registerSet,
  celebrateSetId = null,
  celebrateExercise = false,
  onFocusSet,
  onDraftChange,
  onComplete,
  onUncomplete,
  onSaveEdit,
  onAddSet,
  onRemoveLastSet,
}: ExerciseBlockProps) {
  const done = exercise.sets.filter(isSetDone).length;
  const total = exercise.sets.length;
  const allDone = total > 0 && done === total;
  const lastSet = exercise.sets[exercise.sets.length - 1];
  const canRemove = Boolean(lastSet && !isSetDone(lastSet) && exercise.sets.length > 1);

  return (
    <section
      aria-labelledby={`exercise-${exercise.id}`}
      className={cn("panel overflow-hidden", allDone && "border-plate-green/40")}
    >
      <header className="flex items-start gap-3 px-4 pt-4 pb-3">
        <span className="relative mt-0.5 h-8 w-8 shrink-0" aria-hidden="true">
          {allDone && celebrateExercise ? (
            <span className="animate-ring-burst absolute inset-0 rounded-full border-2 border-plate-green" />
          ) : null}
          <span
            className={cn(
              "num flex h-8 w-8 items-center justify-center rounded-full text-sm font-extrabold",
              allDone ? "bg-plate-green text-iron" : "bg-rubber text-chalk",
              allDone && celebrateExercise && "animate-pop",
            )}
          >
            {allDone ? <IconCheck size={18} strokeWidth={2.6} /> : index + 1}
          </span>
        </span>
        <div className="min-w-0 flex-1">
          <h2 id={`exercise-${exercise.id}`} className="text-lg leading-snug font-bold">
            {exercise.name}
          </h2>
          <p className="mt-0.5 text-sm text-ash">
            目標{" "}
            <SetText className="num font-bold text-chalk" text={sessionTargetSummary(exercise)} />
          </p>
          <p className="text-xs text-ash">休憩 {formatRest(exercise.rest_seconds)}</p>
        </div>
        <span className="num shrink-0 pt-1 text-sm font-bold text-ash">
          {done}/{total}
        </span>
      </header>

      {exercise.note ? (
        <p className="mx-4 mb-3 rounded-xl bg-rubber/70 px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap">
          <span className="mr-1.5 text-xs font-bold text-plate-blue-bright">メモ</span>
          {exercise.note}
        </p>
      ) : null}

      {previous ? (
        <div className="mx-4 mb-3 flex items-start gap-3 rounded-xl border border-line px-3 py-2">
          <p className="shrink-0 text-xs leading-5 text-ash">
            前回
            <br />
            {formatDateShort(previous.performedDate)}
          </p>
          <ol className="num flex flex-wrap gap-x-3 gap-y-0.5 text-sm leading-5">
            {previous.sets.map((s) => (
              <li key={s.setNumber}>
                <SetText text={formatSet(s.weightKg, s.reps)} />
              </li>
            ))}
          </ol>
        </div>
      ) : null}

      <ol className="border-t border-line">
        {exercise.sets.map((set) => {
          const draft = drafts[set.id] ?? { weight: "", reps: "" };
          const previousSet = previous?.sets.find((s) => s.setNumber === set.set_number) ?? null;
          const focused = set.id === focusedSetId;
          return (
            <li
              key={set.id}
              ref={(element) => registerSet(set.id, element)}
              className="scroll-mt-focus border-b border-line last:border-b-0"
            >
              {focused ? (
                <SetEditor
                  exercise={exercise}
                  set={set}
                  draft={draft}
                  previousText={previousSet ? formatSet(previousSet.weightKg, previousSet.reps) : null}
                  saving={savingSetIds.has(set.id)}
                  onDraftChange={(patch) => onDraftChange(set.id, patch)}
                  onComplete={() => onComplete(exercise.id, set.id)}
                  onUncomplete={() => onUncomplete(exercise.id, set.id)}
                  onSaveEdit={() => onSaveEdit(exercise.id, set.id)}
                />
              ) : (
                <SetRow
                  set={set}
                  draft={draft}
                  saving={savingSetIds.has(set.id)}
                  celebrate={celebrateSetId === set.id}
                  onClick={() => onFocusSet(set.id)}
                />
              )}
            </li>
          );
        })}
      </ol>

      <div className="flex flex-wrap gap-1 border-t border-line px-2 py-1.5">
        <Button variant="ghost" size="sm" disabled={busy} onClick={() => onAddSet(exercise.id)}>
          <IconPlus size={16} />
          セット追加
        </Button>
        {canRemove ? (
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => onRemoveLastSet(exercise.id)}>
            <IconMinus size={16} />
            セット削除
          </Button>
        ) : null}
      </div>
    </section>
  );
}

function SetRow({
  set,
  draft,
  saving,
  celebrate,
  onClick,
}: {
  set: SetLog;
  draft: SetDraft;
  saving: boolean;
  celebrate: boolean;
  onClick: () => void;
}) {
  const done = isSetDone(set);
  const weight = done ? set.actual_weight_kg : draft.weight === "" ? null : Number(draft.weight);
  const reps = done ? set.actual_reps : draft.reps === "" ? null : Number(draft.reps);

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex min-h-14 w-full items-center gap-3 px-4 py-2.5 text-left active:bg-rubber",
        done && celebrate && "animate-flash-green",
      )}
      aria-label={`${set.set_number}セット目を${done ? "編集" : "入力"}`}
    >
      <span
        className={cn(
          "num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold",
          done ? "bg-plate-green/20 text-plate-green-bright" : "border border-line text-ash",
          done && celebrate && "animate-pop",
        )}
      >
        {done ? <IconCheck size={15} strokeWidth={2.8} /> : set.set_number}
      </span>
      <span className={cn("num flex-1 text-[17px] font-bold", done ? "text-chalk" : "text-ash")}>
        <SetText text={formatSet(Number.isNaN(weight) ? null : weight, Number.isNaN(reps) ? null : reps)} />
        <span className="ml-0.5 text-sm font-normal">回</span>
      </span>
      <span className="text-xs text-ash">{saving ? "保存中…" : done ? "完了" : "予定"}</span>
    </button>
  );
}

function SetEditor({
  exercise,
  set,
  draft,
  previousText,
  saving,
  onDraftChange,
  onComplete,
  onUncomplete,
  onSaveEdit,
}: {
  exercise: SessionExerciseWithSets;
  set: SetLog;
  draft: SetDraft;
  previousText: string | null;
  saving: boolean;
  onDraftChange: (patch: Partial<SetDraft>) => void;
  onComplete: () => void;
  onUncomplete: () => void;
  onSaveEdit: () => void;
}) {
  const done = isSetDone(set);

  return (
    <div className={cn("px-4 pt-3 pb-4", done ? "bg-plate-green/[0.06]" : "bg-plate-blue/[0.07]")}>
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <p className="text-sm font-bold">
          <span className="num text-base">SET {set.set_number}</span>
          {done ? <span className="ml-2 text-xs text-plate-green-bright">完了済み</span> : null}
        </p>
        <div className="text-right text-xs leading-5 text-ash">
          <p>
            目標 <SetText className="num font-bold text-chalk" text={formatTarget(set.target_weight_kg, set.target_reps)} />
          </p>
          {previousText ? (
            <p>
              前回 <SetText className="num" text={previousText} />
            </p>
          ) : null}
        </div>
      </div>
      <div className="space-y-2">
        <Stepper
          label="重量"
          unit="kg"
          inputMode="decimal"
          value={draft.weight}
          placeholder={set.target_weight_kg == null ? "自重" : undefined}
          onChange={(weight) => onDraftChange({ weight })}
          onStep={(delta) =>
            onDraftChange({
              weight: stepValue(draft.weight, delta * WEIGHT_STEP_KG, set.target_weight_kg ?? exercise.target_weight_kg ?? 0),
            })
          }
        />
        <Stepper
          label="回数"
          unit="回"
          inputMode="numeric"
          value={draft.reps}
          onChange={(reps) => onDraftChange({ reps })}
          onStep={(delta) =>
            onDraftChange({ reps: stepValue(draft.reps, delta, set.target_reps ?? exercise.target_reps ?? 0) })
          }
        />
      </div>
      {done ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" size="lg" disabled={saving} onClick={onUncomplete}>
            未完了に戻す
          </Button>
          <Button variant="primary" size="lg" loading={saving} onClick={onSaveEdit}>
            修正を保存
          </Button>
        </div>
      ) : (
        <div className="mt-4">
          <Button variant="primary" size="xl" block loading={saving} onClick={onComplete}>
            {saving ? null : <IconCheck size={22} strokeWidth={2.6} />}
            セット完了
          </Button>
        </div>
      )}
    </div>
  );
}
