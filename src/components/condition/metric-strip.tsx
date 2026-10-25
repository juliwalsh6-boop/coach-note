import { cn } from "@/lib/cn";
import { METRICS, metricLevel, type MetricLevel, type MetricValues } from "@/lib/condition";

const LEVEL_TEXT: Record<MetricLevel, string> = {
  good: "text-plate-green-bright",
  fair: "text-chalk",
  poor: "text-plate-red-bright",
};

const LEVEL_BAR: Record<MetricLevel, string> = {
  good: "bg-plate-green",
  fair: "bg-ash/50",
  poor: "bg-plate-red",
};

/** 睡眠・疲労・筋肉痛・ストレス・やる気の 5 つを横並びで表示 */
export function MetricStrip({ values, size = "md" }: { values: MetricValues | null; size?: "sm" | "md" }) {
  return (
    <dl className="grid grid-cols-5 gap-1.5 max-[359px]:gap-1">
      {METRICS.map((metric) => {
        const value = values ? values[metric.key] : null;
        const level = value == null ? null : metricLevel(metric.direction, value);
        return (
          <div key={metric.key} className="min-w-0 rounded-xl bg-rubber/70 px-1 pt-1.5 pb-2 text-center max-[359px]:px-0">
            {/* 320px 幅でも「ストレス」が省略されないよう、狭い画面では字を詰める */}
            <dt className="text-[11px] leading-tight whitespace-nowrap text-ash max-[359px]:text-[10px] max-[359px]:tracking-[-0.06em]">
              {metric.label}
            </dt>
            <dd
              className={cn(
                "num mt-0.5 leading-none font-bold",
                size === "md" ? "text-[22px]" : "text-lg",
                level ? LEVEL_TEXT[level] : "text-ash/60",
              )}
            >
              {value ?? "—"}
            </dd>
            <div className="mx-auto mt-1.5 h-[3px] w-6 rounded-full bg-line" aria-hidden="true">
              {value != null && level ? (
                <div className={cn("h-full rounded-full", LEVEL_BAR[level])} style={{ width: `${value * 10}%` }} />
              ) : null}
            </div>
          </div>
        );
      })}
    </dl>
  );
}
