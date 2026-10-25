"use client";

import { Button } from "@/components/ui/button";
import { SetText } from "@/components/ui/set-text";
import type { RestTimer } from "@/hooks/use-rest-timer";
import { cn } from "@/lib/cn";
import { formatClock, formatRest, formatTarget } from "@/lib/format";

/** 画面下に固定表示する休憩タイマー */
export function RestBar({ timer }: { timer: RestTimer }) {
  if (timer.remaining === null) {
    if (!timer.justFinished) return null;
    return (
      <div className="fixed inset-x-0 bottom-0 z-40 pb-safe">
        <div className="mx-auto max-w-[480px] px-3 pb-3">
          <div
            role="status"
            className="animate-rest-done rounded-[20px] border border-plate-green/60 bg-steel px-5 py-5 text-center text-xl font-bold text-chalk"
          >
            休憩終了
          </div>
        </div>
      </div>
    );
  }

  const { remaining, totalSeconds, info } = timer;
  const urgent = remaining <= 10;
  const progress = totalSeconds > 0 ? Math.min(100, (remaining / totalSeconds) * 100) : 0;
  const next = info?.next ?? null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 pb-safe">
      <div className="mx-auto max-w-[480px] px-3 pb-3">
        <section
          aria-label="休憩タイマー"
          className="rounded-[20px] border border-line bg-steel/95 p-4 shadow-[0_-8px_32px_rgba(0,0,0,0.5)] backdrop-blur-md"
        >
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-ash">
                <span className="num tracking-wider text-plate-blue-bright">REST</span>
                <span className="ml-2">{formatRest(totalSeconds)}</span>
              </p>
              <p
                className={cn(
                  "num mt-1 text-[56px] leading-none font-extrabold transition-colors",
                  urgent ? "text-plate-yellow" : "text-chalk",
                )}
                aria-live="off"
              >
                {formatClock(remaining)}
              </p>
            </div>
            {next ? (
              <div className="min-w-0 max-w-[55%] pb-1 text-right">
                <p className="text-xs text-ash">次</p>
                <p className="truncate text-sm font-bold">{next.exerciseName}</p>
                <p className="text-xs text-ash">
                  {next.setNumber}セット目 <SetText className="num" text={formatTarget(next.weightKg, next.reps)} />
                </p>
              </div>
            ) : null}
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
            <div
              className={cn(
                "h-full rounded-full transition-[width] duration-300 ease-linear",
                urgent ? "bg-plate-yellow" : "bg-plate-blue",
              )}
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            <Button variant="secondary" onClick={() => timer.addSeconds(-15)}>
              −15秒
            </Button>
            <Button variant="secondary" onClick={() => timer.addSeconds(15)}>
              ＋15秒
            </Button>
            <Button variant="primary" onClick={() => timer.skip()}>
              スキップ
            </Button>
          </div>
        </section>
      </div>
    </div>
  );
}
