import Link from "next/link";
import { cn } from "@/lib/cn";

export type TabItem = { key: string; label: string; href: string; count?: number };

/** URL のクエリで切り替えるタブ（サーバーで描画できる） */
export function LinkTabs({ items, activeKey }: { items: TabItem[]; activeKey: string }) {
  return (
    <div className="-mx-4 mb-5 overflow-x-auto px-4 [scrollbar-width:none]">
      <div role="tablist" className="inline-flex min-w-full gap-1 rounded-2xl bg-steel p-1">
        {items.map((item) => {
          const active = item.key === activeKey;
          return (
            <Link
              key={item.key}
              href={item.href}
              role="tab"
              aria-selected={active}
              replace
              scroll={false}
              className={cn(
                "flex min-h-10 flex-1 items-center justify-center gap-1.5 rounded-xl px-3 text-sm font-bold whitespace-nowrap transition-colors",
                active ? "bg-rubber text-chalk" : "text-ash",
              )}
            >
              {item.label}
              {item.count ? <span className="num text-xs text-plate-blue-bright">{item.count}</span> : null}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
