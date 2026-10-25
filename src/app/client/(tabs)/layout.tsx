import { BottomNav } from "@/components/ui/bottom-nav";
import { requireRole } from "@/lib/auth";
import { countUnreadComments } from "@/lib/data/comments";

export default async function ClientTabsLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await requireRole("client");
  const unread = await countUnreadComments(supabase, userId).catch(() => 0);

  return (
    <>
      <main className="mx-auto max-w-[480px] px-4 pt-safe pb-[calc(env(safe-area-inset-bottom)+96px)]">{children}</main>
      <BottomNav
        items={[
          { href: "/client", label: "ホーム", icon: "home" },
          { href: "/client/history", label: "履歴", icon: "history", matchPrefix: true },
          { href: "/client/comments", label: "コメント", icon: "message", badge: unread },
          { href: "/client/account", label: "アカウント", icon: "user" },
        ]}
      />
    </>
  );
}
