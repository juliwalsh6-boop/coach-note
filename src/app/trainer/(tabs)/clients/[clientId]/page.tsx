import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CommentComposer } from "@/components/comments/comment-composer";
import { TrainerCommentList } from "@/components/comments/trainer-comment-list";
import { ConditionBadge } from "@/components/condition/condition-badge";
import { MetricStrip } from "@/components/condition/metric-strip";
import { CheckinHistory } from "@/components/history/checkin-history";
import { SessionList } from "@/components/history/session-list";
import { PlanExerciseList, planDateLabel } from "@/components/plans/plan-card";
import { RemoveClientButton } from "@/components/trainer/remove-client-button";
import { LinkButton } from "@/components/ui/button";
import { IconEdit, IconPlus } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import { CONDITION_RULE_TEXT, evaluateCondition, toMetricValues } from "@/lib/condition";
import { getCheckin, listCheckins } from "@/lib/data/checkins";
import { listComments } from "@/lib/data/comments";
import { listPlansForClient } from "@/lib/data/plans";
import { getClientForTrainer } from "@/lib/data/profiles";
import { listSessions } from "@/lib/data/sessions";
import type { DB } from "@/lib/data/db";
import { formatKg } from "@/lib/format";
import { todayISO } from "@/lib/dates";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "クライアント" };

const TABS = ["plans", "sessions", "condition", "comments"] as const;
type TabKey = (typeof TABS)[number];

function isTab(value: unknown): value is TabKey {
  return typeof value === "string" && (TABS as readonly string[]).includes(value);
}

export default async function TrainerClientPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ clientId }, { tab }] = await Promise.all([params, searchParams]);
  if (!isUuid(clientId)) notFound();
  const activeTab: TabKey = isTab(tab) ? tab : "plans";

  const { supabase, userId } = await requireRole("trainer");
  const today = todayISO();
  const [client, todayCheckin] = await Promise.all([
    getClientForTrainer(supabase, clientId),
    getCheckin(supabase, clientId, today),
  ]);
  if (!client) notFound();

  const values = todayCheckin ? toMetricValues(todayCheckin) : null;
  const status = values ? evaluateCondition(values) : null;
  const base = `/trainer/clients/${clientId}`;

  return (
    <>
      <PageHeader title={client.display_name} backHref="/trainer" backLabel="クライアント一覧" />

      <section className="panel mb-6 p-5" aria-label="今日のコンディション">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-bold">今日のコンディション</h2>
          <ConditionBadge status={status} short />
        </div>
        {todayCheckin && values ? (
          <>
            <MetricStrip values={values} />
            {todayCheckin.body_weight_kg != null || todayCheckin.note ? (
              <div className="mt-3 space-y-1 text-sm">
                {todayCheckin.body_weight_kg != null ? (
                  <p>
                    <span className="text-ash">体重 </span>
                    <span className="num font-bold">{formatKg(todayCheckin.body_weight_kg)}</span>
                    <span className="text-ash">kg</span>
                  </p>
                ) : null}
                {todayCheckin.note ? <p className="whitespace-pre-wrap text-ash">{todayCheckin.note}</p> : null}
              </div>
            ) : null}
          </>
        ) : (
          <p className="text-sm text-ash">まだチェックインしていません。</p>
        )}
        <p className="mt-3 text-[11px] leading-relaxed text-ash">{CONDITION_RULE_TEXT}</p>
      </section>

      <LinkTabs
        activeKey={activeTab}
        items={[
          { key: "plans", label: "メニュー", href: base },
          { key: "sessions", label: "記録", href: `${base}?tab=sessions` },
          { key: "condition", label: "体調", href: `${base}?tab=condition` },
          { key: "comments", label: "コメント", href: `${base}?tab=comments` },
        ]}
      />

      {activeTab === "plans" ? <PlansTab supabase={supabase} clientId={clientId} today={today} /> : null}
      {activeTab === "sessions" ? <SessionsTab supabase={supabase} clientId={clientId} /> : null}
      {activeTab === "condition" ? <ConditionTab supabase={supabase} clientId={clientId} /> : null}
      {activeTab === "comments" ? <CommentsTab supabase={supabase} clientId={clientId} trainerId={userId} /> : null}

      <div className="mt-10 border-t border-line pt-6">
        <RemoveClientButton clientId={clientId} clientName={client.display_name} />
      </div>
    </>
  );
}

async function PlansTab({ supabase, clientId, today }: { supabase: DB; clientId: string; today: string }) {
  const plans = await listPlansForClient(supabase, clientId);
  const newHref = `/trainer/clients/${clientId}/plans/new`;

  return (
    <div className="space-y-3">
      <LinkButton href={newHref} size="lg" block>
        <IconPlus size={20} />
        メニューを作成
      </LinkButton>
      {plans.length === 0 ? (
        <EmptyState title="メニューはまだありません" description="作成したメニューは、クライアントのホーム画面にすぐ表示されます。" />
      ) : (
        <ul className="space-y-3">
          {plans.map((plan) => {
            const past = plan.scheduled_date !== null && plan.scheduled_date < today;
            return (
              <li key={plan.id}>
                <Link
                  href={`/trainer/clients/${clientId}/plans/${plan.id}`}
                  className={past ? "panel block p-4 opacity-70 active:bg-rubber" : "panel block p-4 active:bg-rubber"}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs text-ash">
                        {planDateLabel(plan, today)}
                        <span className="mx-1.5 text-line">/</span>
                        {plan.exercises.length}種目
                      </p>
                      <p className="mt-0.5 text-[17px] font-bold">{plan.title}</p>
                    </div>
                    <span className="flex shrink-0 items-center gap-1 text-sm text-ash">
                      <IconEdit size={16} />
                      編集
                    </span>
                  </div>
                  <PlanExerciseList plan={plan} max={6} />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

async function SessionsTab({ supabase, clientId }: { supabase: DB; clientId: string }) {
  const sessions = await listSessions(supabase, clientId, 50);
  if (sessions.length === 0) {
    return <EmptyState title="まだトレーニングの記録がありません" description="クライアントがメニューを始めると、ここに表示されます。" />;
  }
  return <SessionList sessions={sessions} hrefFor={(id) => `/trainer/clients/${clientId}/sessions/${id}`} />;
}

async function ConditionTab({ supabase, clientId }: { supabase: DB; clientId: string }) {
  const checkins = await listCheckins(supabase, clientId, 60);
  if (checkins.length === 0) {
    return <EmptyState title="まだチェックインの記録がありません" />;
  }
  return <CheckinHistory checkins={checkins} showStatus />;
}

async function CommentsTab({ supabase, clientId, trainerId }: { supabase: DB; clientId: string; trainerId: string }) {
  const comments = await listComments(supabase, clientId, 100);
  const mine = comments.filter((c) => c.trainer_id === trainerId);
  return (
    <div className="space-y-6">
      <CommentComposer trainerId={trainerId} clientId={clientId} />
      {mine.length === 0 ? (
        <p className="text-center text-sm text-ash">まだコメントはありません。</p>
      ) : (
        <TrainerCommentList comments={mine} clientId={clientId} />
      )}
    </div>
  );
}
