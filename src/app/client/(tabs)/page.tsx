import type { Metadata } from "next";
import Link from "next/link";
import { JoinByCodeForm } from "@/components/auth/join-by-code-form";
import { CheckinCard } from "@/components/checkin/checkin-card";
import { TodayMealCard } from "@/components/meals/today-meal-card";
import { PlanExerciseList, planDateLabel } from "@/components/plans/plan-card";
import { LinkButton } from "@/components/ui/button";
import { IconChevronRight } from "@/components/ui/icons";
import { SectionTitle } from "@/components/ui/page-header";
import { StartWorkoutButton } from "@/components/workout/start-workout-button";
import { requireRole } from "@/lib/auth";
import { getCheckin, getLatestBodyWeight } from "@/lib/data/checkins";
import { listComments } from "@/lib/data/comments";
import { getNutritionDays } from "@/lib/data/meals";
import { listPlansForClient } from "@/lib/data/plans";
import { listMyTrainers } from "@/lib/data/profiles";
import { listRecentSessions } from "@/lib/data/sessions";
import { addDaysISO, formatDateLong, formatDateTime, greeting, todayISO } from "@/lib/dates";
import type { PlanSummary, WorkoutSession } from "@/types/app";

export const metadata: Metadata = { title: "ホーム" };

export default async function ClientHomePage() {
  const { supabase, userId, profile } = await requireRole("client");
  const today = todayISO();

  const [checkin, latestWeight, plans, recentSessions, trainers, comments, nutritionDays] = await Promise.all([
    getCheckin(supabase, userId, today),
    getLatestBodyWeight(supabase, userId),
    listPlansForClient(supabase, userId),
    listRecentSessions(supabase, userId, addDaysISO(today, -1)),
    listMyTrainers(supabase),
    listComments(supabase, userId, 1),
    // 食事のカード（取得できないときはカードを出さないだけで、ホームの他の表示には影響させない）
    getNutritionDays(supabase, userId, today, today).catch(() => null),
  ]);

  const inProgress = recentSessions.filter((s) => s.status === "in_progress");
  const doneTodayByPlan = new Map<string, WorkoutSession>();
  for (const s of recentSessions) {
    if (s.status === "completed" && s.performed_date === today && s.plan_id && !doneTodayByPlan.has(s.plan_id)) {
      doneTodayByPlan.set(s.plan_id, s);
    }
  }
  const inProgressPlanIds = new Set(inProgress.map((s) => s.plan_id));

  const todayPlans = plans.filter((p) => p.scheduled_date === today);
  const anytimePlans = plans.filter((p) => p.scheduled_date === null);
  const upcomingPlans = plans
    .filter((p) => p.scheduled_date !== null && p.scheduled_date > today && p.scheduled_date <= addDaysISO(today, 7))
    .sort((a, b) => (a.scheduled_date ?? "").localeCompare(b.scheduled_date ?? ""));

  const latestComment = comments[0] ?? null;
  const hasTrainer = trainers.length > 0;

  return (
    <div className="space-y-8">
      <header className="pt-5">
        <p className="text-sm text-ash">{formatDateLong(today)}</p>
        <h1 className="mt-1 text-[26px] leading-tight font-bold">
          {greeting()}、{profile.display_name}さん
        </h1>
        {hasTrainer ? (
          <p className="mt-1 text-sm text-ash">担当トレーナー: {trainers.map((t) => t.display_name).join("、")}</p>
        ) : null}
      </header>

      {!hasTrainer ? (
        <section className="panel border-plate-yellow/40 p-5">
          <h2 className="font-bold">トレーナーとつながっていません</h2>
          <p className="mt-1 text-sm text-ash">
            トレーナーから届いた招待リンクを開くか、招待コードを入力してください。つながるとメニューが届きます。
          </p>
          <JoinByCodeForm />
        </section>
      ) : null}

      <CheckinCard
        key={today}
        clientId={userId}
        date={today}
        initial={checkin}
        latestWeightKg={latestWeight}
      />

      {nutritionDays ? <TodayMealCard row={nutritionDays[0] ?? null} /> : null}

      {inProgress.length > 0 ? (
        <section>
          <SectionTitle>実施中のトレーニング</SectionTitle>
          <div className="space-y-3">
            {inProgress.map((session) => (
              <div key={session.id} className="panel border-plate-blue/60 p-5">
                <p className="text-xs font-bold text-plate-blue-bright">実施中</p>
                <p className="mt-1 text-lg font-bold">{session.title}</p>
                <div className="mt-4">
                  <LinkButton href={`/client/workout/${session.id}`} size="lg" block>
                    続きから再開
                  </LinkButton>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section>
        <SectionTitle>今日のメニュー</SectionTitle>
        {todayPlans.length > 0 ? (
          <div className="space-y-3">
            {todayPlans.map((plan) => (
              <PlanStartCard
                key={plan.id}
                plan={plan}
                today={today}
                doneToday={doneTodayByPlan.get(plan.id) ?? null}
                inProgress={inProgressPlanIds.has(plan.id)}
                emphasis
              />
            ))}
          </div>
        ) : (
          <p className="rounded-[20px] border border-dashed border-line px-5 py-6 text-center text-sm text-ash">
            {anytimePlans.length > 0
              ? "今日の日付のメニューはありません。下のメニューから選んで始められます。"
              : "今日のメニューはまだ届いていません。"}
          </p>
        )}
      </section>

      {anytimePlans.length > 0 ? (
        <section>
          <SectionTitle>いつでもできるメニュー</SectionTitle>
          <div className="space-y-3">
            {anytimePlans.map((plan) => (
              <PlanStartCard
                key={plan.id}
                plan={plan}
                today={today}
                doneToday={doneTodayByPlan.get(plan.id) ?? null}
                inProgress={inProgressPlanIds.has(plan.id)}
              />
            ))}
          </div>
        </section>
      ) : null}

      {upcomingPlans.length > 0 ? (
        <section>
          <SectionTitle>これからの予定</SectionTitle>
          <div className="space-y-3">
            {upcomingPlans.map((plan) => (
              <PlanStartCard key={plan.id} plan={plan} today={today} doneToday={null} inProgress={false} />
            ))}
          </div>
        </section>
      ) : null}

      {latestComment ? (
        <section>
          <SectionTitle
            action={
              <Link href="/client/comments" className="flex items-center text-sm text-ash">
                すべて見る
                <IconChevronRight size={18} />
              </Link>
            }
          >
            トレーナーからの
            <wbr />
            <span className="whitespace-nowrap">コメント</span>
          </SectionTitle>
          <Link href="/client/comments" className="panel block p-5 active:bg-rubber">
            <div className="flex items-center gap-2 text-xs text-ash">
              {latestComment.read_at === null ? (
                <span className="rounded-full bg-plate-blue px-2 py-0.5 font-bold text-white">NEW</span>
              ) : null}
              {formatDateTime(latestComment.created_at)}
            </div>
            <p className="mt-2 line-clamp-4 text-[15px] leading-relaxed whitespace-pre-wrap">{latestComment.body}</p>
          </Link>
        </section>
      ) : null}
    </div>
  );
}

function PlanStartCard({
  plan,
  today,
  doneToday,
  inProgress,
  emphasis = false,
}: {
  plan: PlanSummary;
  today: string;
  doneToday: WorkoutSession | null;
  inProgress: boolean;
  emphasis?: boolean;
}) {
  return (
    <article className={emphasis ? "panel border-plate-blue/40 p-5" : "panel p-5"}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs text-ash">
            {planDateLabel(plan, today)}
            <span className="mx-1.5 text-line">/</span>
            {plan.exercises.length}種目
          </p>
          <h3 className="mt-0.5 text-lg leading-snug font-bold">{plan.title}</h3>
        </div>
        {doneToday ? (
          <span className="shrink-0 rounded-full bg-plate-green/15 px-2.5 py-1 text-xs font-bold text-plate-green-bright">
            今日完了
          </span>
        ) : null}
      </div>
      {plan.note ? <p className="mt-2 text-sm whitespace-pre-wrap text-ash">{plan.note}</p> : null}
      <PlanExerciseList plan={plan} />
      <div className="mt-5">
        {inProgress ? null : (
          <StartWorkoutButton
            planId={plan.id}
            label={doneToday ? "もう一度行う" : "スタート"}
            variant={doneToday ? "secondary" : "primary"}
          />
        )}
        {doneToday ? (
          <Link
            href={`/client/history/${doneToday.id}`}
            className="mt-3 block text-center text-sm text-ash underline underline-offset-4"
          >
            今日の記録を見る
          </Link>
        ) : null}
      </div>
    </article>
  );
}
