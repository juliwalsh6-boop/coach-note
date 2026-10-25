"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { MetricStrip } from "@/components/condition/metric-strip";
import { Button } from "@/components/ui/button";
import { IconCheck, IconEdit } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toaster";
import { playCue } from "@/lib/audio/cues";
import { toMetricValues } from "@/lib/condition";
import { cn } from "@/lib/cn";
import { formatKg } from "@/lib/format";
import type { Checkin } from "@/types/app";
import { CheckinForm } from "./checkin-form";

type CheckinCardProps = {
  clientId: string;
  date: string;
  initial: Checkin | null;
  latestWeightKg: number | null;
};

/** クライアントのホームに出す朝のチェックイン（未入力ならフォーム、入力済みなら結果） */
export function CheckinCard({ clientId, date, initial, latestWeightKg }: CheckinCardProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [checkin, setCheckin] = useState<Checkin | null>(initial);
  const [editing, setEditing] = useState(initial === null);
  const [justSaved, setJustSaved] = useState(false);
  const savedTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
    },
    [],
  );

  if (editing || !checkin) {
    return (
      <section className="panel p-5" aria-labelledby="checkin-title">
        <h2 id="checkin-title" className="text-xl font-bold">
          {checkin ? "チェックインを編集" : "朝のチェックイン"}
        </h2>
        <p className="mt-1 mb-6 text-sm text-ash">今の状態に近い数字をタップしてください。</p>
        <CheckinForm
          clientId={clientId}
          date={date}
          initial={checkin}
          latestWeightKg={latestWeightKg}
          onSaved={(saved) => {
            setCheckin(saved);
            setEditing(false);
            playCue({ type: "checkin_complete" });
            setJustSaved(true);
            if (savedTimer.current !== null) window.clearTimeout(savedTimer.current);
            savedTimer.current = window.setTimeout(() => setJustSaved(false), 1500);
            toast("今日のチェックイン完了", "success");
            router.refresh();
          }}
          onCancel={checkin ? () => setEditing(false) : undefined}
        />
      </section>
    );
  }

  return (
    <section className="panel p-5" aria-labelledby="checkin-done-title">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="relative h-8 w-8 shrink-0" aria-hidden="true">
            {justSaved ? <span className="animate-ring-burst absolute inset-0 rounded-full border-2 border-plate-green" /> : null}
            <span
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-full bg-plate-green text-iron",
                justSaved && "animate-pop",
              )}
            >
              <IconCheck size={18} strokeWidth={2.6} />
            </span>
          </span>
          <h2 id="checkin-done-title" className="text-[17px] leading-snug font-bold">
            今日の
            <wbr />
            <span className="whitespace-nowrap">チェックイン完了</span>
          </h2>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)} aria-label="チェックインを編集">
          <IconEdit size={18} />
          <span className="max-[359px]:sr-only">編集</span>
        </Button>
      </div>
      <div className="mt-4">
        <MetricStrip values={toMetricValues(checkin)} />
      </div>
      {checkin.body_weight_kg != null || checkin.note ? (
        <div className="mt-4 space-y-1 text-sm">
          {checkin.body_weight_kg != null ? (
            <p>
              <span className="text-ash">体重 </span>
              <span className="num font-bold">{formatKg(checkin.body_weight_kg)}</span>
              <span className="text-ash">kg</span>
            </p>
          ) : null}
          {checkin.note ? <p className="whitespace-pre-wrap text-ash">{checkin.note}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
