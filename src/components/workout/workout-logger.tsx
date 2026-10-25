"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, LinkButton } from "@/components/ui/button";
import { IconChevronLeft, IconVolume, IconVolumeOff } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { useElapsedSeconds } from "@/hooks/use-elapsed";
import { useRestTimer } from "@/hooks/use-rest-timer";
import { useWakeLock } from "@/hooks/use-wake-lock";
import { playCue, unlockAudio, type NextUp } from "@/lib/audio/cues";
import { setSoundEnabled, useSoundEnabled } from "@/lib/audio/settings";
import {
  addSet,
  completeSession,
  discardSession,
  getWorkoutCelebration,
  removeLastSet,
  updateSet,
} from "@/lib/data/sessions";
import { todayISO } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { formatClock, formatKg, parseDecimal, parseInteger, totalVolume } from "@/lib/format";
import type { WorkoutCelebrationData } from "@/lib/records";
import { createClient } from "@/lib/supabase/client";
import {
  countProgress,
  draftFor,
  buildDrafts,
  firstPendingSet,
  isSetDone,
  nextPendingSet,
  type SetDraft,
} from "@/lib/workout";
import type { PreviousRecordMap, SessionDetail, SessionExerciseWithSets, SetLog } from "@/types/app";
import { ExerciseBlock } from "./exercise-block";
import { RestBar } from "./rest-bar";
import { WorkoutCelebration, type CelebrationSummary } from "./workout-celebration";

type WorkoutLoggerProps = {
  session: SessionDetail;
  previous: PreviousRecordMap;
};

type ParsedDraft = { ok: true; weight: number | null; reps: number } | { ok: false; message: string };

function parseDraft(draft: SetDraft): ParsedDraft {
  const weight = parseDecimal(draft.weight);
  if (weight !== null && (Number.isNaN(weight) || weight < 0 || weight >= 1000)) {
    return { ok: false, message: "重量は 0〜999 の数字で入力してください" };
  }
  const reps = parseInteger(draft.reps);
  if (reps === null || Number.isNaN(reps) || reps < 0 || reps > 999) {
    return { ok: false, message: "回数を入力してください" };
  }
  return { ok: true, weight, reps };
}

function patchSet(
  exercises: SessionExerciseWithSets[],
  setId: string,
  patch: Partial<SetLog>,
): SessionExerciseWithSets[] {
  return exercises.map((exercise) =>
    exercise.sets.some((s) => s.id === setId)
      ? { ...exercise, sets: exercise.sets.map((s) => (s.id === setId ? { ...s, ...patch } : s)) }
      : exercise,
  );
}

function weightText(value: number | null): string {
  return value == null ? "" : formatKg(value);
}

/**
 * 重量を変えて完了したら、まだ触っていない後続セットの重量にも反映する。
 * 反映するのはコーチの目標重量が同じセットだけ（セットごとに重量が違う指示は崩さない）。
 */
function carryWeight(
  drafts: Record<string, SetDraft>,
  exercise: SessionExerciseWithSets,
  completed: SetLog,
  weight: number | null,
): Record<string, SetDraft> {
  const next = { ...drafts };
  for (const set of exercise.sets) {
    if (set.set_number <= completed.set_number || set.completed_at !== null) continue;
    if (set.target_weight_kg !== completed.target_weight_kg) continue;
    const draft = next[set.id];
    if (draft && draft.weight === weightText(set.target_weight_kg)) {
      next[set.id] = { ...draft, weight: weightText(weight) };
    }
  }
  return next;
}

export function WorkoutLogger({ session, previous }: WorkoutLoggerProps) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const supabase = useMemo(() => createClient(), []);
  const isCompletedSession = session.status === "completed";

  const [exercises, setExercises] = useState(session.exercises);
  const [drafts, setDrafts] = useState(() => buildDrafts(session.exercises));
  const [focusedSetId, setFocusedSetId] = useState<string | null>(
    () => firstPendingSet(session.exercises)?.set.id ?? null,
  );
  const [savingSetIds, setSavingSetIds] = useState<ReadonlySet<string>>(() => new Set());
  const [busyExerciseId, setBusyExerciseId] = useState<string | null>(null);
  const [finishing, setFinishing] = useState<"complete" | "discard" | null>(null);
  // セット・種目を完了した直後の小さな演出
  const [celebrating, setCelebrating] = useState<{ setId: string; exerciseId: string | null; key: number } | null>(null);
  const celebrateTimer = useRef<number | null>(null);
  // トレーニング完了の演出
  const [celebration, setCelebration] = useState<{
    summary: CelebrationSummary;
    extras: WorkoutCelebrationData | null;
    saved: boolean;
  } | null>(null);

  const soundOn = useSoundEnabled();
  const timer = useRestTimer(session.id, playCue);
  const elapsed = useElapsedSeconds(session.started_at, !isCompletedSession);
  useWakeLock(!isCompletedSession);

  const progress = countProgress(exercises);

  // セット完了後、次のセットへスクロール
  const setElements = useRef(new Map<string, HTMLElement>());
  const scrollTarget = useRef<string | null>(null);
  const registerSet = useCallback((setId: string, element: HTMLElement | null) => {
    if (element) setElements.current.set(setId, element);
    else setElements.current.delete(setId);
  }, []);

  useEffect(() => {
    const target = scrollTarget.current;
    if (!target || target !== focusedSetId) return;
    scrollTarget.current = null;
    const element = setElements.current.get(target);
    if (!element) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.setTimeout(() => element.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" }), 60);
  }, [focusedSetId]);

  function markSaving(setId: string, saving: boolean) {
    setSavingSetIds((current) => {
      const next = new Set(current);
      if (saving) next.add(setId);
      else next.delete(setId);
      return next;
    });
  }

  function celebrate(setId: string, exerciseId: string | null) {
    setCelebrating({ setId, exerciseId, key: Date.now() });
    if (celebrateTimer.current !== null) window.clearTimeout(celebrateTimer.current);
    celebrateTimer.current = window.setTimeout(() => setCelebrating(null), 1300);
  }

  useEffect(
    () => () => {
      if (celebrateTimer.current !== null) window.clearTimeout(celebrateTimer.current);
    },
    [],
  );

  function updateDraft(setId: string, patch: Partial<SetDraft>) {
    setDrafts((current) => ({
      ...current,
      [setId]: { ...(current[setId] ?? { weight: "", reps: "" }), ...patch },
    }));
  }

  function findSet(exerciseId: string, setId: string) {
    const exercise = exercises.find((e) => e.id === exerciseId);
    const set = exercise?.sets.find((s) => s.id === setId);
    return exercise && set ? { exercise, set } : null;
  }

  async function handleComplete(exerciseId: string, setId: string) {
    const found = findSet(exerciseId, setId);
    if (!found || savingSetIds.has(setId)) return;
    const { exercise, set } = found;
    const parsed = parseDraft(drafts[setId] ?? draftFor(exercise, set));
    if (!parsed.ok) {
      toast(parsed.message, "error");
      return;
    }

    // タップした瞬間に音を出せるようにしてから鳴らす（iPhone 対策）
    unlockAudio();

    const completedAt = new Date().toISOString();
    const updated = patchSet(exercises, setId, {
      actual_weight_kg: parsed.weight,
      actual_reps: parsed.reps,
      completed_at: completedAt,
    });
    // この種目の最後のセットなら、少し豪華な音と演出にする
    const exerciseFinished = updated.find((e) => e.id === exerciseId)?.sets.every(isSetDone) ?? false;
    playCue(exerciseFinished ? { type: "exercise_complete", exerciseName: exercise.name } : { type: "set_complete" });
    celebrate(setId, exerciseFinished ? exerciseId : null);
    const nextDrafts = carryWeight(drafts, exercise, set, parsed.weight);
    setExercises(updated);
    setDrafts(nextDrafts);

    const next = nextPendingSet(updated, setId);
    setFocusedSetId(next?.set.id ?? null);
    if (next) scrollTarget.current = next.set.id;

    if (!isCompletedSession) {
      if (next && exercise.rest_seconds > 0) {
        const nextDraft = nextDrafts[next.set.id];
        const nextWeight = nextDraft ? parseDecimal(nextDraft.weight) : next.set.target_weight_kg;
        const nextReps = nextDraft ? parseInteger(nextDraft.reps) : next.set.target_reps;
        const nextUp: NextUp = {
          exerciseName: next.exercise.name,
          setNumber: next.set.set_number,
          weightKg: nextWeight != null && !Number.isNaN(nextWeight) ? nextWeight : null,
          reps: nextReps != null && !Number.isNaN(nextReps) ? nextReps : null,
        };
        timer.start(exercise.rest_seconds, { label: `${exercise.name} ${set.set_number}セット目のあと`, next: nextUp });
      } else if (!next) {
        toast("全セット完了！最後に「トレーニング完了」を押してください", "success");
      }
    }

    markSaving(setId, true);
    try {
      const saved = await updateSet(supabase, setId, {
        actual_weight_kg: parsed.weight,
        actual_reps: parsed.reps,
        completed_at: completedAt,
      });
      setExercises((current) => patchSet(current, setId, saved));
    } catch (e) {
      setExercises((current) => patchSet(current, setId, { completed_at: null }));
      setFocusedSetId(setId);
      toast(`保存できませんでした。${toErrorMessage(e)}`, "error");
    } finally {
      markSaving(setId, false);
    }
  }

  async function handleUncomplete(exerciseId: string, setId: string) {
    const found = findSet(exerciseId, setId);
    if (!found) return;
    const { set } = found;
    setExercises((current) => patchSet(current, setId, { completed_at: null }));
    markSaving(setId, true);
    try {
      await updateSet(supabase, setId, {
        actual_weight_kg: set.actual_weight_kg,
        actual_reps: set.actual_reps,
        completed_at: null,
      });
    } catch (e) {
      setExercises((current) => patchSet(current, setId, { completed_at: set.completed_at }));
      toast(toErrorMessage(e), "error");
    } finally {
      markSaving(setId, false);
    }
  }

  async function handleSaveEdit(exerciseId: string, setId: string) {
    const found = findSet(exerciseId, setId);
    if (!found) return;
    const { exercise, set } = found;
    const parsed = parseDraft(drafts[setId] ?? draftFor(exercise, set));
    if (!parsed.ok) {
      toast(parsed.message, "error");
      return;
    }
    markSaving(setId, true);
    try {
      const saved = await updateSet(supabase, setId, {
        actual_weight_kg: parsed.weight,
        actual_reps: parsed.reps,
        completed_at: set.completed_at,
      });
      setExercises((current) => patchSet(current, setId, saved));
      setFocusedSetId(firstPendingSet(patchSet(exercises, setId, saved))?.set.id ?? null);
      toast("記録を修正しました", "success");
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      markSaving(setId, false);
    }
  }

  async function handleAddSet(exerciseId: string) {
    setBusyExerciseId(exerciseId);
    try {
      const row = await addSet(supabase, exerciseId);
      const exercise = exercises.find((e) => e.id === exerciseId);
      setExercises((current) =>
        current.map((e) => (e.id === exerciseId ? { ...e, sets: [...e.sets, row] } : e)),
      );
      if (exercise) {
        const withNew = { ...exercise, sets: [...exercise.sets, row] };
        setDrafts((current) => ({ ...current, [row.id]: draftFor(withNew, row) }));
      }
      setFocusedSetId(row.id);
      scrollTarget.current = row.id;
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setBusyExerciseId(null);
    }
  }

  async function handleRemoveLastSet(exerciseId: string) {
    setBusyExerciseId(exerciseId);
    try {
      const removedId = await removeLastSet(supabase, exerciseId);
      const updated = exercises.map((e) =>
        e.id === exerciseId ? { ...e, sets: e.sets.filter((s) => s.id !== removedId) } : e,
      );
      setExercises(updated);
      if (focusedSetId === removedId) {
        setFocusedSetId(firstPendingSet(updated)?.set.id ?? null);
      }
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setBusyExerciseId(null);
    }
  }

  async function handleFinish() {
    // タップした瞬間に音を出せるようにしておく（このあと「溜め」の音を鳴らすため）
    unlockAudio();
    const { done, total } = countProgress(exercises);
    if (done < total) {
      const ok = await confirm({
        title: done === 0 ? "まだ1セットも記録されていません" : `未完了のセットが${total - done}つあります`,
        message: "このままトレーニングを完了しますか？",
        confirmLabel: "完了する",
        cancelLabel: "続ける",
      });
      if (!ok) return;
    }
    setFinishing("complete");
    timer.skip();

    // 保存を待たずに演出（溜め）を始める。保存が終わるまで溜めが続き、終わったら「ギャン！」
    const allSets = exercises.flatMap((e) => e.sets);
    setCelebration({
      summary: {
        title: session.title,
        volumeKg: totalVolume(allSets),
        doneSets: done,
        totalSets: total,
        minutes: Math.max(1, Math.round((Date.now() - Date.parse(session.started_at)) / 60_000)),
      },
      extras: null,
      saved: false,
    });

    try {
      await completeSession(supabase, session.id);
    } catch (e) {
      setCelebration(null);
      toast(`保存できませんでした。${toErrorMessage(e)}`, "error");
      setFinishing(null);
      return;
    }
    setCelebration((c) => (c ? { ...c, saved: true } : c));
    router.prefetch(`/client/history/${session.id}?done=1`);

    // 自己ベスト・今週の回数は後から読み込んで、演出の途中で出す
    const current = exercises.flatMap((e) =>
      e.sets
        .filter(isSetDone)
        .map((s) => ({ exerciseKey: e.exercise_key, name: e.name, weightKg: s.actual_weight_kg, reps: s.actual_reps })),
    );
    getWorkoutCelebration(supabase, {
      sessionId: session.id,
      clientId: session.client_id,
      startedAt: session.started_at,
      today: todayISO(),
      current,
    })
      .then((extras) => setCelebration((c) => (c ? { ...c, extras } : c)))
      .catch(() =>
        setCelebration((c) => (c ? { ...c, extras: { records: [], totalWorkouts: 0, thisWeek: 0, weekStreak: 0 } } : c)),
      );
  }

  function closeCelebration() {
    router.push(`/client/history/${session.id}?done=1`);
    router.refresh();
  }

  async function handleDiscard() {
    const ok = await confirm({
      title: "このトレーニングを破棄しますか？",
      message: "記録したセットもすべて削除されます。",
      confirmLabel: "破棄する",
      tone: "danger",
    });
    if (!ok) return;
    setFinishing("discard");
    try {
      await discardSession(supabase, session.id);
      timer.skip();
      router.replace("/client");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
      setFinishing(null);
    }
  }

  function toggleSound() {
    const next = !soundOn;
    setSoundEnabled(next);
    if (next) {
      unlockAudio();
      playCue({ type: "set_complete" });
    }
  }

  const allDone = progress.total > 0 && progress.done === progress.total;

  return (
    <div className="pb-[calc(env(safe-area-inset-bottom)+240px)]">
      <header className="sticky top-0 z-30 -mx-4 border-b border-line bg-iron/95 px-4 pt-safe backdrop-blur-md">
        <div className="flex h-14 items-center gap-2">
          <Link
            href="/client"
            aria-label="ホームに戻る"
            className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ash active:bg-rubber"
          >
            <IconChevronLeft size={24} />
          </Link>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] leading-tight font-bold">{session.title}</p>
            <p className="num text-xs text-ash">
              {progress.done}/{progress.total} セット
              {elapsed !== null && !isCompletedSession ? <span className="ml-2">経過 {formatClock(elapsed)}</span> : null}
            </p>
          </div>
          <button
            type="button"
            onClick={toggleSound}
            aria-label={soundOn ? "音を消す" : "音を出す"}
            aria-pressed={soundOn}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ash active:bg-rubber"
          >
            {soundOn ? <IconVolume size={22} /> : <IconVolumeOff size={22} />}
          </button>
        </div>
        <div className="relative -mx-4 h-1 overflow-hidden bg-line" aria-hidden="true">
          <div
            className="h-full bg-plate-green transition-[width] duration-300"
            style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }}
          />
          {celebrating ? (
            <div
              key={celebrating.key}
              className="animate-shine absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/80 to-transparent"
            />
          ) : null}
        </div>
      </header>

      <div className="space-y-4 pt-4">
        {isCompletedSession ? (
          <Notice tone="success">このトレーニングは完了済みです。記録の修正だけできます。</Notice>
        ) : null}

        {exercises.map((exercise, index) => (
          <ExerciseBlock
            key={exercise.id}
            index={index}
            exercise={exercise}
            previous={previous[exercise.exercise_key] ?? null}
            drafts={drafts}
            focusedSetId={focusedSetId}
            savingSetIds={savingSetIds}
            busy={busyExerciseId === exercise.id}
            registerSet={registerSet}
            celebrateSetId={celebrating?.setId ?? null}
            celebrateExercise={celebrating?.exerciseId === exercise.id}
            onFocusSet={setFocusedSetId}
            onDraftChange={updateDraft}
            onComplete={(exerciseId, setId) => void handleComplete(exerciseId, setId)}
            onUncomplete={(exerciseId, setId) => void handleUncomplete(exerciseId, setId)}
            onSaveEdit={(exerciseId, setId) => void handleSaveEdit(exerciseId, setId)}
            onAddSet={(exerciseId) => void handleAddSet(exerciseId)}
            onRemoveLastSet={(exerciseId) => void handleRemoveLastSet(exerciseId)}
          />
        ))}

        <div className="space-y-3 pt-4">
          {isCompletedSession ? (
            <LinkButton href={`/client/history/${session.id}`} size="xl" block variant="secondary">
              記録を閉じる
            </LinkButton>
          ) : (
            <>
              <Button
                size="xl"
                block
                variant={allDone ? "success" : "primary"}
                loading={finishing === "complete" && !celebration}
                disabled={finishing !== null}
                onClick={() => void handleFinish()}
                className={allDone && finishing === null ? "animate-glow" : undefined}
              >
                トレーニング完了
              </Button>
              <div className="text-center">
                <button
                  type="button"
                  disabled={finishing !== null}
                  onClick={() => void handleDiscard()}
                  className="min-h-11 px-4 text-sm text-plate-red-bright underline-offset-4 active:underline disabled:opacity-50"
                >
                  このトレーニングを破棄
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      <RestBar timer={timer} />
      {celebration ? (
        <WorkoutCelebration
          summary={celebration.summary}
          extras={celebration.extras}
          saved={celebration.saved}
          onContinue={closeCelebration}
        />
      ) : null}
    </div>
  );
}
