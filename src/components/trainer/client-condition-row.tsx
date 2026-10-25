import Link from "next/link";
import { ConditionBadge } from "@/components/condition/condition-badge";
import { MetricStrip } from "@/components/condition/metric-strip";
import { IconChevronRight } from "@/components/ui/icons";
import type { ConditionStatus, MetricValues } from "@/lib/condition";
import { relativeDateLabel } from "@/lib/dates";
import { formatKg } from "@/lib/format";
import type { DashboardRow } from "@/types/app";

/** トレーナーのホーム: クライアント 1 人分の今日のコンディション */
export function ClientConditionRow({
  row,
  values,
  status,
  today,
}: {
  row: DashboardRow;
  values: MetricValues | null;
  status: ConditionStatus | null;
  today: string;
}) {
  return (
    <Link href={`/trainer/clients/${row.client_id}`} className="panel block p-4 active:bg-rubber">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-[17px] font-bold">{row.display_name}</p>
        <div className="flex shrink-0 items-center gap-1">
          <ConditionBadge status={status} short="narrow" />
          <IconChevronRight size={18} className="text-ash" />
        </div>
      </div>

      {values ? (
        <div className="mt-3">
          <MetricStrip values={values} size="sm" />
        </div>
      ) : (
        <p className="mt-2 text-sm text-ash">
          今日はまだチェックインしていません
          {row.last_checkin_date ? `（最終入力 ${relativeDateLabel(row.last_checkin_date, today)}）` : ""}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ash">
        {row.body_weight_kg != null ? (
          <span>
            体重 <span className="num text-sm font-bold text-chalk">{formatKg(row.body_weight_kg)}</span>kg
          </span>
        ) : null}
        {row.last_session_date ? (
          <span className="min-w-0 truncate">
            最終トレーニング {relativeDateLabel(row.last_session_date, today)} {row.last_session_title}
            {row.last_session_status === "in_progress" ? "（実施中）" : ""}
          </span>
        ) : (
          <span>トレーニング記録なし</span>
        )}
      </div>

      {row.checkin_note ? (
        <p className="mt-2 line-clamp-2 rounded-lg bg-rubber/60 px-3 py-2 text-sm whitespace-pre-wrap">
          {row.checkin_note}
        </p>
      ) : null}
    </Link>
  );
}
