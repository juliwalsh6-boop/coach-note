import { BottomNav } from "@/components/ui/bottom-nav";
import { requireRole } from "@/lib/auth";
import { countUnreadComments } from "@/lib/data/comments";
import { countUnreadMealCommentsForClient } from "@/lib/data/meal-comments";

export default async function ClientTabsLayout({ children }: { children: React.ReactNode }) {
  const { supabase, userId } = await requireRole("client");
  const [unread, unreadMeal] = await Promise.all([
    countUnreadComments(supabase, userId).catch(() => 0),
    countUnreadMealCommentsForClient(supabase, userId).catch(() => 0),
  ]);

  return (
    <>
      <main className="mx-auto max-w-[480px] px-4 pt-safe pb-[calc(env(safe-area-inset-bottom)+96px)]">{children}</main>
      <BottomNav
        items={[
          { href: "/client", label: "ホーム", icon: "home" },
          { href: "/client/meals", label: "食事", icon: "meal" },
          { href: "/client/history", label: "履歴", icon: "history", matchPrefix: true },
          { href: "/client/comments", label: "コメント", icon: "message", badge: unread + unreadMeal },
          { href: "/client/account", label: "アカウント", icon: "user" },
        ]}
      />
    </>
  );
}
