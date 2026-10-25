"use client";

import { useId } from "react";
import { cn } from "@/lib/cn";
import { metricLevel, type MetricDefinition, type MetricLevel } from "@/lib/condition";

const SELECTED: Record<MetricLevel, string> = {
  good: "bg-plate-green text-iron border-plate-green",
  fair: "bg-chalk text-iron border-chalk",
  poor: "bg-plate-red text-white border-plate-red",
};

const SCALE = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

/** 1〜10 をワンタップで選ぶ入力 */
export function ScaleInput({
  metric,
  value,
  onChange,
}: {
  metric: MetricDefinition;
  value: number | null;
  onChange: (value: number) => void;
}) {
  const labelId = useId();
  const level = value == null ? null : metricLevel(metric.direction, value);

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <span id={labelId} className="text-[15px] font-bold">
          {metric.label}
        </span>
        <span className="text-xs text-ash">
          {value == null ? "未選択" : value === 1 ? metric.lowLabel : value === 10 ? metric.highLabel : `${value} / 10`}
        </span>
      </div>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-10 gap-1">
        {SCALE.map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={`${metric.label} ${n}`}
              onClick={() => onChange(n)}
              className={cn(
                "num flex h-11 items-center justify-center rounded-[10px] border text-[15px] font-bold transition-colors duration-75",
                selected && level ? SELECTED[level] : "border-transparent bg-rubber text-ash active:bg-line",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      <div className="flex justify-between text-[11px] leading-tight text-ash">
        <span>1 = {metric.lowLabel}</span>
        <span>10 = {metric.highLabel}</span>
      </div>
    </div>
  );
}
