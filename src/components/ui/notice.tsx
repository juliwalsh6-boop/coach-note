import { cn } from "@/lib/cn";

type NoticeTone = "info" | "success" | "error" | "warning";

const TONE_CLASSES: Record<NoticeTone, string> = {
  info: "border-line bg-rubber/60 text-chalk",
  success: "border-plate-green/40 bg-plate-green/10 text-plate-green-bright",
  error: "border-plate-red/50 bg-plate-red/10 text-plate-red-bright",
  warning: "border-plate-yellow/40 bg-plate-yellow/10 text-plate-yellow",
};

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: NoticeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", TONE_CLASSES[tone], className)}
    >
      {children}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-[20px] border border-dashed border-line px-5 py-8 text-center">
      <p className="font-bold">{title}</p>
      {description ? <p className="mt-1.5 text-sm text-ash">{description}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}
