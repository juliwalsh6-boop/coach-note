import type { Metadata } from "next";
import Link from "next/link";
import { MealsSetupNotice } from "@/components/meals/meals-setup-notice";
import { ClientConditionRow } from "@/components/trainer/client-condition-row";
import { ClientNutritionRow } from "@/components/trainer/client-nutrition-row";
import { LinkButton } from "@/components/ui/button";
import { IconChevronLeft, IconChevronRight, IconUserPlus } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { LinkTabs } from "@/components/ui/tabs";
import { requireRole } from "@/lib/auth";
import {
  CONDITION_SHORT_LABELS,
  CONDITION_ORDER,
  CONDITION_RULE_TEXT,
  evaluateCondition,
  toMetricValues,
  type ConditionStatus,
} from "@/lib/condition";
import { getDashboard, getNutritionOverview } from "@/lib/data/trainer";
import type { DB } from "@/lib/data/db";
import { addDaysISO, formatDateLong, isValidISODate, relativeDateLabel, todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";
import { isMissingSchemaError } from "@/lib/errors";
import { dayStatus } from "@/lib/nutrition/nutrients";
import { rowIntake, rowTarget } from "@/lib/nutrition/rows";
import type { NutritionOverviewRow } from "@/types/app";

export const metadata: Metadata = { title: "クライアント" };

const SUMMARY_STYLES: Record<ConditionStatus | "none", string> = {
  recovery: "text-plate-red-bright",
  caution: "text-plate-yellow",
  good: "text-plate-green-bright",
  none: "text-ash",
};

/** コンディション / 食事 の切り替え */
function ViewTabs({ view }: { view: "condition" | "meals" }) {
  return (
    <LinkTabs
      activeKey={view}
      items={[
        { key: "condition", label: "コンディション", href: "/trainer" },
        { key: "meals", label: "食事", href: "/trainer?view=meals" },
      ]}
    />
  );
}

export default async function TrainerHomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { view, date: rawDate } = await searchParams;
  const { supabase } = await requireRole("trainer");
  const today = todayISO();

  if (view === "meals") {
    const requested = typeof rawDate === "string" && isValidISODate(rawDate) ? rawDate : today;
    const date = requested > today || requested < addDaysISO(today, -60) ? today : requested;
    return <MealsOverview supabase={supabase} date={date} today={today} />;
  }

  const rows = await getDashboard(supabase, today);

  const items = rows
    .map((row) => {
      const values = toMetricValues(row);
      const status = values ? evaluateCondition(values) : null;
      return { row, values, status };
    })
    .sort((a, b) => {
      const order = CONDITION_ORDER[a.status ?? "none"] - CONDITION_ORDER[b.status ?? "none"];
      return order !== 0 ? order : a.row.display_name.localeCompare(b.row.display_name, "ja");
    });

  const counts: Record<ConditionStatus | "none", number> = { recovery: 0, caution: 0, good: 0, none: 0 };
  for (const item of items) counts[item.status ?? "none"] += 1;

  return (
    <>
      <PageHeader
        title="クライアント"
        subtitle={
          <>
            {formatDateLong(today)}の<wbr />
            <span className="whitespace-nowrap">コンディション</span>
          </>
        }
        action={
          <LinkButton href="/trainer/invite" variant="secondary" size="sm" aria-label="クライアントを招待">
            <IconUserPlus size={18} />
            招待
          </LinkButton>
        }
      />

      <ViewTabs view="condition" />

      {items.length === 0 ? (
        <EmptyState
          title="まだクライアントがいません"
          description="招待リンクを作って、LINE などでクライアントに送ってください。登録するとここに表示されます。"
          action={
            <LinkButton href="/trainer/invite" size="lg">
              クライアントを招待する
            </LinkButton>
          }
        />
      ) : (
        <>
          <ul className="mb-5 grid grid-cols-4 gap-2" aria-label="今日のコンディションの内訳">
            {(["recovery", "caution", "good", "none"] as const).map((key) => (
              <li key={key} className="rounded-2xl bg-steel px-2 py-3 text-center">
                <p className={cn("num text-2xl leading-none font-bold", SUMMARY_STYLES[key])}>{counts[key]}</p>
                <p className="mt-1.5 text-[11px] leading-tight text-ash">{CONDITION_SHORT_LABELS[key]}</p>
              </li>
            ))}
          </ul>

          <ul className="space-y-3">
            {items.map(({ row, values, status }) => (
              <li key={row.client_id}>
                <ClientConditionRow row={row} values={values} status={status} today={today} />
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs leading-relaxed text-ash">{CONDITION_RULE_TEXT}</p>
        </>
      )}
    </>
  );
}

/** 食事の一覧: 担当クライアントごとの目標・摂取量・記録の有無・体重・最終記録・未返信のコメント */
async function MealsOverview({ supabase, date, today }: { supabase: DB; date: string; today: string }) {
  let rows: NutritionOverviewRow[];
  try {
    rows = await getNutritionOverview(supabase, date);
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    return (
      <>
        <PageHeader title="クライアント" subtitle="食事" />
        <ViewTabs view="meals" />
        <MealsSetupNotice role="trainer" />
      </>
    );
  }

  // 未返信のコメントがある人 → 記録の無い人 → 名前順
  const sorted = [...rows].sort((a, b) => {
    if ((a.awaiting_reply_count > 0) !== (b.awaiting_reply_count > 0)) return a.awaiting_reply_count > 0 ? -1 : 1;
    if ((a.item_count === 0) !== (b.item_count === 0)) return a.item_count === 0 ? -1 : 1;
    return a.display_name.localeCompare(b.display_name, "ja");
  });
  const logged = rows.filter((r) => r.item_count > 0).length;
  const achieved = rows.filter((r) => {
    const target = rowTarget(r);
    return dayStatus(rowIntake(r), target?.target ?? null, target?.tolerance ?? null, r.item_count) === "achieved";
  }).length;
  const awaiting = rows.reduce((sum, r) => sum + r.awaiting_reply_count, 0);
  const noTarget = rows.filter((r) => r.target_energy_kcal == null).length;
  const dateHref = (d: string) => `/trainer?view=meals${d === today ? "" : `&date=${d}`}`;

  return (
    <>
      <PageHeader title="クライアント" subtitle={<>{formatDateLong(date)}の食事</>} />
      <ViewTabs view="meals" />

      <div className="mb-4 flex items-center justify-between gap-2">
        <Link
          href={dateHref(addDaysISO(date, -1))}
          replace
          scroll={false}
          className="flex min-h-10 items-center gap-0.5 rounded-xl pr-3 pl-1.5 text-sm text-ash active:bg-rubber"
        >
          <IconChevronLeft size={18} />
          前の日
        </Link>
        <p className="text-sm font-bold">{relativeDateLabel(date, today)}</p>
        {date < today ? (
          <Link
            href={dateHref(addDaysISO(date, 1))}
            replace
            scroll={false}
            className="flex min-h-10 items-center gap-0.5 rounded-xl pr-1.5 pl-3 text-sm text-ash active:bg-rubber"
          >
            次の日
            <IconChevronRight size={18} />
          </Link>
        ) : (
          <span className="w-[72px]" aria-hidden="true" />
        )}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="まだクライアントがいません"
          description="招待リンクを作って、LINE などでクライアントに送ってください。"
          action={
            <LinkButton href="/trainer/invite" size="lg">
              クライアントを招待する
            </LinkButton>
          }
        />
      ) : (
        <>
          <ul className="mb-5 grid grid-cols-4 gap-2" aria-label="食事の記録の内訳">
            {[
              { label: "記録あり", value: logged, className: "text-chalk" },
              { label: "目標達成", value: achieved, className: "text-plate-green-bright" },
              { label: "未返信", value: awaiting, className: awaiting > 0 ? "text-plate-blue-bright" : "text-ash" },
              { label: "目標未設定", value: noTarget, className: noTarget > 0 ? "text-plate-yellow" : "text-ash" },
            ].map((item) => (
              <li key={item.label} className="rounded-2xl bg-steel px-2 py-3 text-center">
                <p className={cn("num text-2xl leading-none font-bold", item.className)}>{item.value}</p>
                <p className="mt-1.5 text-[11px] leading-tight text-ash">{item.label}</p>
              </li>
            ))}
          </ul>

          <ul className="space-y-3">
            {sorted.map((row) => (
              <li key={row.client_id}>
                <ClientNutritionRow row={row} date={date} today={today} />
              </li>
            ))}
          </ul>

          <p className="mt-6 text-xs leading-relaxed text-ash">
            摂取量は、クライアントが保存した記録の合計です。「目標達成」は、カロリーと P・F・C がすべて目標 ± 許容範囲に入っている日です。
          </p>
        </>
      )}
    </>
  );
}
