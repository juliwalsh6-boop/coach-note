import { cn } from "@/lib/cn";
import { deviationLabels, type SetDeviation } from "@/lib/set-targets";

/**
 * 目標との差を小さなラベルで並べる（例: +2.5kg −2回）。
 * 目標より多い・重いときは青、少ない・軽いときは黄色。
 */
export function DeviationChips({
  deviation,
  align = "start",
  className,
}: {
  deviation: SetDeviation;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <span className={cn("flex flex-wrap gap-1", align === "end" && "justify-end", className)}>
      {deviationLabels(deviation).map((label) => (
        <span
          key={label.text}
          className={cn(
            "num rounded-full px-1.5 py-px text-[11px] leading-4 font-bold whitespace-nowrap",
            label.direction === "up" ? "bg-plate-blue/20 text-plate-blue-bright" : "bg-plate-yellow/15 text-plate-yellow",
          )}
        >
          <span aria-hidden="true">{label.text}</span>
          <span className="sr-only">{label.description}</span>
        </span>
      ))}
    </span>
  );
}
