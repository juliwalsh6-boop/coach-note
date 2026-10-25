import { BottomNav } from "@/components/ui/bottom-nav";

export default function TrainerTabsLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <main className="mx-auto max-w-[480px] px-4 pt-safe pb-[calc(env(safe-area-inset-bottom)+96px)]">{children}</main>
      <BottomNav
        items={[
          { href: "/trainer", label: "クライアント", icon: "users", alsoActiveFor: ["/trainer/clients"] },
          { href: "/trainer/invite", label: "招待", icon: "userPlus" },
          { href: "/trainer/account", label: "アカウント", icon: "user" },
        ]}
      />
    </>
  );
}
