import Link from "next/link";
import { IconChevronLeft } from "./icons";

type PageHeaderProps = {
  title: string;
  subtitle?: React.ReactNode;
  backHref?: string;
  backLabel?: string;
  action?: React.ReactNode;
};

export function PageHeader({ title, subtitle, backHref, backLabel = "戻る", action }: PageHeaderProps) {
  return (
    <header className="pt-4 pb-5">
      {backHref ? (
        <Link
          href={backHref}
          className="-ml-2 mb-2 inline-flex min-h-10 items-center gap-0.5 rounded-lg pr-3 pl-1 text-[15px] text-ash active:bg-rubber"
        >
          <IconChevronLeft size={20} />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-[26px] leading-tight font-bold tracking-tight text-balance">{title}</h1>
          {subtitle ? <div className="mt-1 text-sm text-ash">{subtitle}</div> : null}
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </div>
    </header>
  );
}

export function SectionTitle({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-3">
      <h2 className="min-w-0 text-[17px] font-bold">{children}</h2>
      {action ? <div className="shrink-0 whitespace-nowrap">{action}</div> : null}
    </div>
  );
}
