import { cn } from "@/lib/cn";
import {
  NUTRIENT_LABELS,
  NUTRIENT_SHORT,
  NUTRIENT_UNITS,
  formatNutrient,
  formatRemaining,
} from "@/lib/nutrition/format";
import {
  dayStatus,
  nutrientStatus,
  remainingNutrients,
  type DayStatus,
  type NutrientKey,
  type Nutrients,
} from "@/lib/nutrition/nutrients";
import type { TargetValues } from "@/lib/nutrition/rows";

/** P / F / C とカロリーの色 */
export const NUTRIENT_COLORS: Record<NutrientKey, { bar: string; text: string; dot: string }> = {
  energyKcal: { bar: "bg-plate-blue-bright", text: "text-plate-blue-bright", dot: "bg-plate-blue-bright" },
  proteinG: { bar: "bg-macro-p", text: "text-macro-p", dot: "bg-macro-p" },
  fatG: { bar: "bg-macro-f", text: "text-macro-f", dot: "bg-macro-f" },
  carbsG: { bar: "bg-macro-c", text: "text-macro-c", dot: "bg-macro-c" },
};

const DAY_STATUS_STYLE: Record<DayStatus, { label: string; className: string }> = {
  achieved: { label: "目標達成", className: "bg-plate-green/15 text-plate-green-bright" },
  over: { label: "超過あり", className: "bg-plate-red/18 text-plate-red-bright" },
  under: { label: "不足あり", className: "bg-plate-yellow/15 text-plate-yellow" },
  no_record: { label: "記録なし", className: "bg-rubber text-ash" },
  no_target: { label: "目標未設定", className: "bg-rubber text-ash" },
};

export function DayStatusBadge({ status, inProgress = false }: { status: DayStatus; inProgress?: boolean }) {
  // 今日の途中は「不足」ではなく「記録中」
  const style =
    inProgress && status === "under"
      ? { label: "記録中", className: "bg-plate-blue/15 text-plate-blue-bright" }
      : DAY_STATUS_STYLE[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap", style.className)}>
      {style.label}
    </span>
  );
}

/**
 * 目標に対する摂取量のバー。
 *  - 目標までは栄養素の色、超えた分は赤の斜線（色だけに頼らない）
 *  - うすい帯は「目標 ± 許容範囲」
 */
export function NutrientBar({
  nutrient,
  intake,
  target,
  tolerance,
  size = "md",
}: {
  nutrient: NutrientKey;
  intake: number;
  target: number;
  tolerance: number;
  size?: "sm" | "md";
}) {
  const scale = Math.max(target + tolerance, intake, 1);
  const filled = (Math.min(intake, target) / scale) * 100;
  const over = (Math.max(0, intake - target) / scale) * 100;
  const bandStart = (Math.max(0, target - tolerance) / scale) * 100;
  const bandEnd = (Math.min(scale, target + tolerance) / scale) * 100;
  const targetAt = (target / scale) * 100;

  return (
    <div className={cn("relative w-full overflow-hidden rounded-full bg-line/70", size === "md" ? "h-3" : "h-2")} aria-hidden="true">
      <div className="absolute inset-y-0 bg-chalk/12" style={{ left: `${bandStart}%`, width: `${Math.max(0, bandEnd - bandStart)}%` }} />
      <div className={cn("absolute inset-y-0 left-0 rounded-l-full", NUTRIENT_COLORS[nutrient].bar)} style={{ width: `${filled}%` }} />
      {over > 0 ? <div className="bar-over absolute inset-y-0" style={{ left: `${filled}%`, width: `${over}%` }} /> : null}
      <div className="absolute inset-y-0 w-[2px] bg-chalk/80" style={{ left: `calc(${targetAt}% - 1px)` }} />
    </div>
  );
}

function StatusTag({ status, inProgress }: { status: "within" | "under" | "over"; inProgress: boolean }) {
  if (status === "within") {
    return <span className="text-[11px] font-bold text-plate-green-bright">範囲内</span>;
  }
  if (status === "over") {
    return <span className="text-[11px] font-bold text-plate-red-bright">超過</span>;
  }
  return inProgress ? null : <span className="text-[11px] font-bold text-plate-yellow">不足</span>;
}

function MacroRow({
  nutrient,
  intake,
  target,
  inProgress,
}: {
  nutrient: Exclude<NutrientKey, "energyKcal">;
  intake: Nutrients;
  target: TargetValues | null;
  inProgress: boolean;
}) {
  const value = intake[nutrient];
  const goal = target?.target[nutrient] ?? null;
  const tol = target?.tolerance[nutrient] ?? 0;
  const status = goal == null ? null : nutrientStatus(value, goal, tol);
  const remaining = goal == null ? null : formatRemaining(nutrient, goal - value);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <p className="flex min-w-0 items-baseline gap-1.5 text-sm font-bold">
          <span className={cn("num text-[15px]", NUTRIENT_COLORS[nutrient].text)}>{NUTRIENT_SHORT[nutrient]}</span>
          <span className="truncate">{NUTRIENT_LABELS[nutrient]}</span>
          {status ? <StatusTag status={status} inProgress={inProgress} /> : null}
        </p>
        <p className="num shrink-0 text-[15px] font-bold">
          {formatNutrient(nutrient, value)}
          {goal != null ? <span className="text-xs font-normal text-ash"> / {formatNutrient(nutrient, goal)}g</span> : <span className="text-xs font-normal text-ash">g</span>}
        </p>
      </div>
      {goal != null ? (
        <>
          <div className="mt-1.5">
            <NutrientBar nutrient={nutrient} intake={value} target={goal} tolerance={tol} />
          </div>
          <p className={cn("mt-1 text-right text-xs", remaining?.over ? "font-bold text-plate-red-bright" : "text-ash")}>
            {remaining?.text}
            {tol > 0 ? <span className="ml-2 font-normal text-ash">許容 ±{formatNutrient(nutrient, tol)}g</span> : null}
          </p>
        </>
      ) : null}
    </div>
  );
}

/**
 * 1 日の目標・摂取量・残り（カロリーと PFC）。
 * 値はすべて保存された記録の合計（DB と同じ計算）から出す。
 */
export function NutritionSummary({
  intake,
  target,
  itemCount,
  inProgress,
  title,
  headerRight,
  emptyTargetMessage = "トレーナーが目標を設定すると、目標と残りの量がここに表示されます。",
}: {
  intake: Nutrients;
  target: TargetValues | null;
  itemCount: number;
  /** 今日（まだ途中）なら true。「不足」の代わりに「あと◯g」と出す */
  inProgress: boolean;
  title: React.ReactNode;
  headerRight?: React.ReactNode;
  emptyTargetMessage?: string;
}) {
  const status = dayStatus(intake, target?.target ?? null, target?.tolerance ?? null, itemCount);
  const kcalGoal = target?.target.energyKcal ?? null;
  const kcalRemaining = target ? remainingNutrients(target.target, intake).energyKcal : null;
  const kcalStatus = target ? nutrientStatus(intake.energyKcal, target.target.energyKcal, target.tolerance.energyKcal) : null;

  return (
    <section className="panel p-5" aria-label="今日の目標と摂取量">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0 text-sm font-bold">{title}</div>
        <div className="flex shrink-0 items-center gap-2">
          {headerRight}
          <DayStatusBadge status={status} inProgress={inProgress} />
        </div>
      </div>

      <div className="mt-4">
        <div className="flex items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs text-ash">摂取カロリー</p>
            <p className="num mt-0.5 text-[34px] leading-none font-extrabold">
              {formatNutrient("energyKcal", intake.energyKcal)}
              <span className="ml-1 font-sans text-sm font-bold text-ash">
                {kcalGoal != null ? `/ ${formatNutrient("energyKcal", kcalGoal)} kcal` : "kcal"}
              </span>
            </p>
          </div>
          {kcalRemaining != null ? (
            <div className="shrink-0 text-right">
              <p className="text-xs text-ash">{kcalRemaining < 0 ? "目標を超えた分" : "残り"}</p>
              <p className={cn("num mt-0.5 text-2xl leading-none font-extrabold", kcalRemaining < 0 ? "text-plate-red-bright" : "text-chalk")}>
                {kcalRemaining < 0 ? "+" : ""}
                {formatNutrient("energyKcal", Math.abs(kcalRemaining))}
                <span className="ml-0.5 font-sans text-xs font-bold text-ash">kcal</span>
              </p>
            </div>
          ) : null}
        </div>
        {target ? (
          <div className="mt-3">
            <NutrientBar
              nutrient="energyKcal"
              intake={intake.energyKcal}
              target={target.target.energyKcal}
              tolerance={target.tolerance.energyKcal}
            />
            <p className="mt-1 flex justify-between text-xs text-ash">
              <span>
                {kcalStatus ? <StatusTag status={kcalStatus} inProgress={inProgress} /> : null}
              </span>
              <span>許容 ±{formatNutrient("energyKcal", target.tolerance.energyKcal)}kcal</span>
            </p>
          </div>
        ) : null}
      </div>

      <div className="mt-4 space-y-3.5">
        <MacroRow nutrient="proteinG" intake={intake} target={target} inProgress={inProgress} />
        <MacroRow nutrient="fatG" intake={intake} target={target} inProgress={inProgress} />
        <MacroRow nutrient="carbsG" intake={intake} target={target} inProgress={inProgress} />
      </div>

      {!target ? <p className="mt-4 rounded-xl bg-rubber/60 px-3 py-2.5 text-xs leading-relaxed text-ash">{emptyTargetMessage}</p> : null}
    </section>
  );
}

/** 小さい PFC 表示（カードや一覧用） */
export function MacroInline({ values, className }: { values: Nutrients; className?: string }) {
  return (
    <span className={cn("num inline-flex flex-wrap gap-x-2 text-xs text-ash", className)}>
      {(["proteinG", "fatG", "carbsG"] as const).map((key) => (
        <span key={key} className="whitespace-nowrap">
          <span className={cn("font-bold", NUTRIENT_COLORS[key].text)}>{NUTRIENT_SHORT[key]}</span>
          {formatNutrient(key, values[key])}
          {NUTRIENT_UNITS[key]}
        </span>
      ))}
    </span>
  );
}
