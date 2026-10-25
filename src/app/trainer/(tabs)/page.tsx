import type { Metadata } from "next";
import { ClientConditionRow } from "@/components/trainer/client-condition-row";
import { LinkButton } from "@/components/ui/button";
import { IconUserPlus } from "@/components/ui/icons";
import { EmptyState } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import {
  CONDITION_SHORT_LABELS,
  CONDITION_ORDER,
  CONDITION_RULE_TEXT,
  evaluateCondition,
  toMetricValues,
  type ConditionStatus,
} from "@/lib/condition";
import { getDashboard } from "@/lib/data/trainer";
import { formatDateLong, todayISO } from "@/lib/dates";
import { cn } from "@/lib/cn";

export const metadata: Metadata = { title: "クライアント" };

const SUMMARY_STYLES: Record<ConditionStatus | "none", string> = {
  recovery: "text-plate-red-bright",
  caution: "text-plate-yellow",
  good: "text-plate-green-bright",
  none: "text-ash",
};

export default async function TrainerHomePage() {
  const { supabase } = await requireRole("trainer");
  const today = todayISO();
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
