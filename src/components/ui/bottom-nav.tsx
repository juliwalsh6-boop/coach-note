"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import {
  IconHistory,
  IconHome,
  IconMessage,
  IconUser,
  IconUserPlus,
  IconUsers,
} from "./icons";

const ICONS = {
  home: IconHome,
  history: IconHistory,
  message: IconMessage,
  user: IconUser,
  users: IconUsers,
  userPlus: IconUserPlus,
} as const;

export type NavItem = {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  /** このパスで始まるページでも選択状態にする（ホームは完全一致） */
  matchPrefix?: boolean;
  /** 別のパスで始まるページでも選択状態にする */
  alsoActiveFor?: string[];
  badge?: number;
};

function isActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.href) return true;
  if (item.matchPrefix && pathname.startsWith(`${item.href}/`)) return true;
  return (item.alsoActiveFor ?? []).some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="メインメニュー"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-iron/95 backdrop-blur-md pb-safe"
    >
      <ul className="mx-auto flex max-w-[480px]">
        {items.map((item) => {
          const active = isActive(pathname, item);
          const Icon = ICONS[item.icon];
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex h-16 flex-col items-center justify-center gap-0.5 text-[11px] font-bold transition-colors",
                  active ? "text-chalk" : "text-ash",
                )}
              >
                {active ? (
                  <span className="absolute top-0 h-[3px] w-8 rounded-b-full bg-plate-blue-bright" aria-hidden="true" />
                ) : null}
                <span className="relative">
                  <Icon size={24} />
                  {item.badge ? (
                    <span className="num absolute -top-1.5 -right-2.5 min-w-[18px] rounded-full bg-plate-red px-1 text-center text-[10px] leading-[18px] text-white">
                      {item.badge > 9 ? "9+" : item.badge}
                    </span>
                  ) : null}
                </span>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
