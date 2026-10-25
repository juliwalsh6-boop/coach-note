"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Confetti } from "@/components/celebration/confetti";
import { buttonClasses } from "@/components/ui/button";
import { IconCalendar, IconFlame, IconMedal } from "@/components/ui/icons";
import { SetText } from "@/components/ui/set-text";
import { playCue } from "@/lib/audio/cues";
import { cn } from "@/lib/cn";
import { formatKg, formatNumber } from "@/lib/format";
import type { PersonalRecord, WorkoutCelebrationData } from "@/lib/records";

export type CelebrationSummary = {
  title: string;
  volumeKg: number;
  doneSets: number;
  totalSets: number;
  minutes: number;
};

// 演出のタイミング（ミリ秒）
const CHARGE_MS = 1000; // 「溜め」の長さ（効果音 workout-charge.wav と同じ）
const DEN_MS = 260; // 「ギャン！」から「でーん！」まで（効果音 workout-complete.wav と同じ）
// ここから下は「ギャン！」の瞬間からの時間
const SHOW_WEEK = 950;
const ENABLE_CONTINUE = 1100;
const SHOW_RECORDS = 1700;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 0 から目標の数字まで数え上げる */
function useCountUp(target: number, duration: number, delay: number): number {
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  useEffect(() => {
    if (prefersReducedMotion()) return;
    let frame = 0;
    let start = 0;
    const timer = window.setTimeout(() => {
      const step = (now: number) => {
        if (!start) start = now;
        const progress = Math.min(1, (now - start) / duration);
        setValue(target * (1 - Math.pow(1 - progress, 3)));
        if (progress < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, delay);
    return () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [target, duration, delay]);
  return value;
}

function isMilestone(count: number): boolean {
  return count === 5 || count === 10 || (count > 0 && count % 25 === 0);
}

/**
 * トレーニング完了の演出（全画面）。
 * 1. 溜め: プレートが震えながら光を吸い込む（溜めの音・だんだん速くなる振動）
 * 2. ギャン！: 白く光ってプレートが一気に大きくなり、画面が揺れて紙吹雪（強い振動）
 * 3. でーん！: 見出しと数字が出る → 今週の回数・連続週数 → 自己ベスト
 * 記録の保存が終わるまでは「溜め」を続ける。
 */
export function WorkoutCelebration({
  summary,
  extras,
  saved,
  onContinue,
}: {
  summary: CelebrationSummary;
  /** 自己ベストなど、読み込み中は null */
  extras: WorkoutCelebrationData | null;
  /** 記録の保存が終わったか */
  saved: boolean;
  onContinue: () => void;
}) {
  const titleId = useId();
  const medalRef = useRef<HTMLDivElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);
  const [chargeDone, setChargeDone] = useState(false);
  const [stage, setStage] = useState(0);
  const chargePlayed = useRef(false);
  const impactPlayed = useRef(false);
  const impact = chargeDone && saved;

  // 1. 溜め
  useEffect(() => {
    if (chargePlayed.current) return;
    chargePlayed.current = true;
    playCue({ type: "workout_charge" });
  }, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setChargeDone(true), CHARGE_MS);
    return () => window.clearTimeout(timer);
  }, []);

  // 2. ギャン！ → でーん！（音は1つのファイルに続けて入っている）
  useEffect(() => {
    if (!impact || impactPlayed.current) return;
    impactPlayed.current = true;
    playCue({ type: "workout_complete" });
  }, [impact]);

  // 3. 続きの演出
  useEffect(() => {
    if (!impact) return;
    const quick = prefersReducedMotion();
    const timers = [
      window.setTimeout(() => setStage((s) => Math.max(s, 1)), quick ? 0 : SHOW_WEEK),
      window.setTimeout(() => {
        setStage((s) => Math.max(s, 2));
        continueRef.current?.focus({ preventScroll: true });
      }, quick ? 0 : ENABLE_CONTINUE),
      window.setTimeout(() => setStage((s) => Math.max(s, 3)), quick ? 0 : SHOW_RECORDS),
    ];
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [impact]);

  // 後ろの画面がスクロールしないようにする
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const records = extras?.records ?? [];
  const showRecords = impact && stage >= 3 && records.length > 0;

  // 自己ベストが出た瞬間に専用の音
  useEffect(() => {
    if (showRecords) playCue({ type: "personal_record" });
  }, [showRecords]);

  const first = extras?.totalWorkouts === 1;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-busy={!impact}
      className="animate-fade-in fixed inset-0 z-[80] overflow-x-hidden overflow-y-auto overscroll-contain bg-iron"
    >
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[75%] bg-[radial-gradient(circle_at_50%_30%,rgba(47,99,230,0.38),transparent_62%)]",
          !impact && "animate-charge-glow",
        )}
      />
      {impact ? <Confetti originRef={medalRef} /> : null}
      {impact ? <div aria-hidden="true" className="animate-flash pointer-events-none fixed inset-0 z-20 bg-white" /> : null}

      <div
        className={cn(
          "relative mx-auto flex min-h-full max-w-[480px] flex-col px-6 pt-[calc(env(safe-area-inset-top)+44px)] pb-[calc(env(safe-area-inset-bottom)+24px)]",
          impact && "animate-impact-shake",
        )}
      >
        <Medallion ref={medalRef} impact={impact} />

        <h2
          id={titleId}
          className={cn(
            "mt-8 text-center text-[30px] leading-tight font-extrabold tracking-tight",
            impact ? "animate-title-pop" : "opacity-0",
          )}
          style={impact ? { animationDelay: `${DEN_MS}ms` } : undefined}
        >
          {first ? (
            <>
              <span className="whitespace-nowrap">はじめての</span>
              <wbr />
              <span className="whitespace-nowrap">トレーニング完了！</span>
            </>
          ) : (
            "トレーニング完了！"
          )}
        </h2>

        {impact ? (
          <>
            <p className="animate-rise mt-2 text-center text-[15px] text-ash" style={{ animationDelay: `${DEN_MS + 140}ms` }}>
              {summary.title}
            </p>

            <dl className="mt-7 grid grid-cols-3 gap-2">
              <StatTile label="総挙上量" value={summary.volumeKg} unit="kg" delay={DEN_MS + 260} />
              <StatTile label="セット" value={summary.doneSets} suffix={`/${summary.totalSets}`} delay={DEN_MS + 360} />
              <StatTile label="時間" value={summary.minutes} unit="分" delay={DEN_MS + 460} />
            </dl>

            {stage >= 1 && extras && extras.totalWorkouts > 0 ? <WeekChips extras={extras} /> : null}
            {showRecords ? <RecordsCard records={records} /> : null}

            <div className="mt-auto pt-10">
              <button
                ref={continueRef}
                type="button"
                // 演出の途中で連打して飛ばしてしまわないよう、少し待ってから押せるようにする
                onClick={() => {
                  if (stage >= 2) onContinue();
                }}
                aria-disabled={stage < 2}
                className={cn(buttonClasses("success", "xl", true), "animate-rise")}
                style={{ animationDelay: `${ENABLE_CONTINUE - 150}ms` }}
              >
                続ける
              </button>
              <p
                className="animate-rise mt-3 text-center text-xs text-ash"
                style={{ animationDelay: `${ENABLE_CONTINUE}ms` }}
              >
                結果はトレーナーにも届いています
              </p>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

// 溜めのあいだに、外から吸い込まれる光の輪（だんだん間隔が詰まる）
const CONVERGE_DELAYS = [0, 260, 470, 640, 780, 890];

function Medallion({ ref, impact }: { ref: React.Ref<HTMLDivElement>; impact: boolean }) {
  return (
    <div ref={ref} className="relative mx-auto h-32 w-32 shrink-0" aria-hidden="true">
      {impact ? (
        <>
          {/* 後ろでゆっくり回る光の筋 */}
          <div className="animate-fade-in absolute -inset-28">
            <div className="animate-rays h-full w-full rounded-full bg-[repeating-conic-gradient(rgba(143,176,255,0.14)_0deg_8deg,transparent_8deg_22deg)] [mask-image:radial-gradient(circle,black_22%,transparent_68%)]" />
          </div>
          <span className="animate-shockwave absolute inset-0 rounded-full border-4 border-plate-blue-bright/70" />
          <span
            className="animate-shockwave absolute inset-0 rounded-full border-2 border-plate-yellow/70"
            style={{ animationDelay: "140ms" }}
          />
          <span
            className="animate-shockwave absolute inset-0 rounded-full border-2 border-chalk/50"
            style={{ animationDelay: `${DEN_MS}ms` }}
          />
        </>
      ) : (
        CONVERGE_DELAYS.map((delay) => (
          <span
            key={delay}
            className="animate-converge absolute inset-0 rounded-full border-2 border-plate-blue-bright"
            style={{ animationDelay: `${delay}ms` }}
          />
        ))
      )}
      <div className={cn("relative h-full w-full", impact ? "animate-slam" : "animate-charge")}>
        <div className={cn("h-full w-full", !impact && "animate-jitter")}>
          <svg viewBox="0 0 128 128" className="h-full w-full drop-shadow-[0_14px_32px_rgba(47,99,230,0.55)]">
            <circle cx="64" cy="64" r="62" className="fill-plate-blue" />
            <circle cx="64" cy="64" r="52" className="fill-[#244eba]" />
            <circle cx="64" cy="64" r="48" className="fill-plate-blue" />
            {impact ? (
              <path
                d="M39 66 L56 83 L90 47"
                pathLength={1}
                fill="none"
                strokeWidth={12}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="animate-check-draw stroke-chalk"
                style={{ animationDelay: "120ms" }}
              />
            ) : (
              <circle cx="64" cy="64" r="14" className="fill-chalk/90" />
            )}
          </svg>
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  unit,
  suffix,
  delay,
}: {
  label: string;
  value: number;
  unit?: string;
  suffix?: string;
  delay: number;
}) {
  const shown = useCountUp(value, 900, delay + 60);
  const text = formatNumber(Math.round(shown));
  const long = formatNumber(value).length + (suffix?.length ?? 0) >= 6;
  return (
    <div
      className="animate-rise rounded-2xl border border-line bg-steel/90 px-1 pt-2.5 pb-3 text-center"
      style={{ animationDelay: `${delay}ms` }}
    >
      <dt className="text-[11px] text-ash">{label}</dt>
      <dd className={cn("num mt-1.5 leading-none font-extrabold whitespace-nowrap", long ? "text-[17px]" : "text-[22px]")}>
        {text}
        {suffix ? <span className="text-ash">{suffix}</span> : null}
        {unit ? <span className="ml-0.5 font-sans text-[11px] font-bold text-ash">{unit}</span> : null}
      </dd>
    </div>
  );
}

function WeekChips({ extras }: { extras: WorkoutCelebrationData }) {
  const chips: { key: string; icon: React.ReactNode; text: string; strong?: boolean }[] = [];
  if (extras.weekStreak >= 2) {
    chips.push({ key: "streak", icon: <IconFlame size={16} />, text: `${extras.weekStreak}週連続`, strong: true });
  }
  if (extras.thisWeek > 0) {
    chips.push({ key: "week", icon: <IconCalendar size={16} />, text: `今週${extras.thisWeek}回目` });
  }
  if (isMilestone(extras.totalWorkouts)) {
    chips.push({ key: "total", icon: <IconMedal size={16} />, text: `通算${extras.totalWorkouts}回達成`, strong: true });
  } else if (extras.totalWorkouts > 1) {
    chips.push({ key: "total", icon: null, text: `通算${extras.totalWorkouts}回目` });
  }
  if (chips.length === 0) return null;
  return (
    <ul className="mt-5 flex flex-wrap justify-center gap-2" aria-label="これまでの記録">
      {chips.map((chip, index) => (
        <li
          key={chip.key}
          className={cn(
            "animate-pop inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold",
            chip.strong ? "bg-plate-yellow/15 text-plate-yellow" : "bg-rubber text-chalk",
          )}
          style={{ animationDelay: `${index * 110}ms` }}
        >
          {chip.icon}
          {chip.text}
        </li>
      ))}
    </ul>
  );
}

function recordText(record: PersonalRecord): { main: string; gain: string } {
  if (record.kind === "weight" && record.weightKg != null) {
    return {
      main: `${formatKg(record.weightKg)}kg × ${record.reps}回`,
      gain: `+${formatKg(record.weightKg - (record.previousWeightKg ?? 0))}kg`,
    };
  }
  const weight = record.weightKg == null ? "自重" : `${formatKg(record.weightKg)}kg`;
  return { main: `${weight} × ${record.reps}回`, gain: `+${record.reps - (record.previousReps ?? 0)}回` };
}

function RecordsCard({ records }: { records: PersonalRecord[] }) {
  return (
    <section className="animate-stamp relative mt-5 overflow-hidden rounded-2xl border border-plate-yellow/60 bg-plate-yellow/10 p-4">
      <span
        aria-hidden="true"
        className="animate-shine pointer-events-none absolute inset-y-0 left-0 w-1/4 bg-gradient-to-r from-transparent via-white/25 to-transparent"
        style={{ animationDelay: "250ms" }}
      />
      <h3 className="flex items-center gap-2 font-extrabold text-plate-yellow">
        <IconMedal size={20} />
        自己ベスト更新！
      </h3>
      <ul className="mt-3 space-y-2.5">
        {records.map((record) => {
          const { main, gain } = recordText(record);
          return (
            <li key={record.exerciseKey} className="flex items-center justify-between gap-3">
              <span className="min-w-0 truncate text-[15px] font-bold">{record.name}</span>
              <span className="flex shrink-0 items-center gap-2">
                <SetText className="num text-base font-extrabold" text={main} />
                <span className="rounded-full bg-plate-green/20 px-2 py-0.5 text-xs font-bold text-plate-green-bright">
                  {gain}
                </span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
