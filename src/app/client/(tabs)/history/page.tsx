import type { Metadata } from "next";
import { CheckinHistory } from "@/components/history/checkin-history";
import { SessionList } from "@/components/history/session-list";
import { EmptyState } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { listCheckins } from "@/lib/data/checkins";
import { listSessions } from "@/lib/data/sessions";

export const metadata: Metadata = { title: "履歴" };

export default async function ClientHistoryPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { tab } = await searchParams;
  const activeTab = tab === "condition" ? "condition" : "training";
  const { supabase, userId } = await requireRole("client");

  return (
    <>
      <PageHeader title="履歴" />
      <LinkTabs
        activeKey={activeTab}
        items={[
          { key: "training", label: "トレーニング", href: "/client/history" },
          { key: "condition", label: "コンディション", href: "/client/history?tab=condition" },
        ]}
      />
      {activeTab === "training" ? (
        <TrainingHistory sessions={await listSessions(supabase, userId, 50)} />
      ) : (
        <ConditionHistory checkins={await listCheckins(supabase, userId, 60)} />
      )}
    </>
  );
}

function TrainingHistory({ sessions }: { sessions: Awaited<ReturnType<typeof listSessions>> }) {
  if (sessions.length === 0) {
    return <EmptyState title="まだトレーニングの記録がありません" description="ホームのメニューからスタートすると、ここに残ります。" />;
  }
  return <SessionList sessions={sessions} hrefFor={(id) => `/client/history/${id}`} />;
}

function ConditionHistory({ checkins }: { checkins: Awaited<ReturnType<typeof listCheckins>> }) {
  if (checkins.length === 0) {
    return <EmptyState title="まだチェックインの記録がありません" description="毎朝ホームから入力すると、ここに残ります。" />;
  }
  return <CheckinHistory checkins={checkins} />;
}
