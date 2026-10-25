import { ConditionBadge } from "@/components/condition/condition-badge";
import { MetricStrip } from "@/components/condition/metric-strip";
import { evaluateCondition, toMetricValues } from "@/lib/condition";
import { formatDateShort } from "@/lib/dates";
import { formatKg } from "@/lib/format";
import type { Checkin } from "@/types/app";

/** チェックインの履歴（新しい順） */
export function CheckinHistory({ checkins, showStatus = false }: { checkins: Checkin[]; showStatus?: boolean }) {
  return (
    <ul className="space-y-3">
      {checkins.map((checkin) => {
        const values = toMetricValues(checkin);
        return (
          <li key={checkin.id} className="panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="num font-bold">{formatDateShort(checkin.checkin_date)}</p>
              <div className="flex items-center gap-2">
                {checkin.body_weight_kg != null ? (
                  <span className="num text-sm">
                    {formatKg(checkin.body_weight_kg)}
                    <span className="text-xs text-ash">kg</span>
                  </span>
                ) : null}
                {showStatus && values ? <ConditionBadge status={evaluateCondition(values)} short /> : null}
              </div>
            </div>
            <MetricStrip values={values} size="sm" />
            {checkin.note ? <p className="mt-3 text-sm whitespace-pre-wrap text-ash">{checkin.note}</p> : null}
          </li>
        );
      })}
    </ul>
  );
}
