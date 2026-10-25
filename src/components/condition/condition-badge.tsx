import { cn } from "@/lib/cn";
import { CONDITION_LABELS, CONDITION_SHORT_LABELS, type ConditionStatus } from "@/lib/condition";

const STYLES: Record<ConditionStatus | "none", { badge: string; dot: string }> = {
  good: { badge: "bg-plate-green/15 text-plate-green-bright", dot: "bg-plate-green" },
  caution: { badge: "bg-plate-yellow/15 text-plate-yellow", dot: "bg-plate-yellow" },
  recovery: { badge: "bg-plate-red/18 text-plate-red-bright", dot: "bg-plate-red" },
  none: { badge: "bg-rubber text-ash", dot: "bg-ash/60" },
};

export function ConditionBadge({
  status,
  short = false,
  className,
}: {
  status: ConditionStatus | null;
  /** 「良好」「注意」などの短い表記にする（"narrow" は 360px 未満の画面だけ短くする） */
  short?: boolean | "narrow";
  className?: string;
}) {
  const key = status ?? "none";
  const style = STYLES[key];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold whitespace-nowrap",
        style.badge,
        className,
      )}
    >
      <span className={cn("h-2 w-2 rounded-full", style.dot)} aria-hidden="true" />
      {short === "narrow" ? (
        <>
          <span className="max-[359px]:hidden">{CONDITION_LABELS[key]}</span>
          <span className="hidden max-[359px]:inline">{CONDITION_SHORT_LABELS[key]}</span>
        </>
      ) : short ? (
        CONDITION_SHORT_LABELS[key]
      ) : (
        CONDITION_LABELS[key]
      )}
    </span>
  );
}
