"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { METRICS, type MetricKey, type MetricValues } from "@/lib/condition";
import { unlockAudio } from "@/lib/audio/cues";
import { saveCheckin } from "@/lib/data/checkins";
import { toErrorMessage } from "@/lib/errors";
import { formatKg, parseDecimal } from "@/lib/format";
import { createClient } from "@/lib/supabase/client";
import type { Checkin } from "@/types/app";
import { ScaleInput } from "./scale-input";

type CheckinFormProps = {
  clientId: string;
  date: string;
  initial: Checkin | null;
  latestWeightKg: number | null;
  onSaved: (checkin: Checkin) => void;
  onCancel?: () => void;
};

type PartialValues = Record<MetricKey, number | null>;

function initialValues(initial: Checkin | null): PartialValues {
  return {
    sleep: initial?.sleep ?? null,
    fatigue: initial?.fatigue ?? null,
    soreness: initial?.soreness ?? null,
    stress: initial?.stress ?? null,
    motivation: initial?.motivation ?? null,
  };
}

function isComplete(values: PartialValues): values is MetricValues {
  return METRICS.every((m) => values[m.key] != null);
}

export function CheckinForm({ clientId, date, initial, latestWeightKg, onSaved, onCancel }: CheckinFormProps) {
  const [values, setValues] = useState<PartialValues>(() => initialValues(initial));
  const [weight, setWeight] = useState(initial?.body_weight_kg != null ? formatKg(initial.body_weight_kg) : "");
  const [note, setNote] = useState(initial?.note ?? "");
  const [error, setError] = useState<string | null>(null);
  const [weightError, setWeightError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const remaining = METRICS.filter((m) => values[m.key] == null).length;

  async function submit() {
    if (!isComplete(values)) {
      setError("5つの項目をすべて選んでください。");
      return;
    }
    const weightValue = parseDecimal(weight);
    if (weightValue !== null && (Number.isNaN(weightValue) || weightValue <= 0 || weightValue >= 500)) {
      setWeightError("体重は数字で入力してください（例: 72.4）");
      return;
    }
    setWeightError(null);
    setError(null);
    setSaving(true);
    unlockAudio(); // 保存できたら音を鳴らすため、タップした瞬間に準備しておく
    try {
      const saved = await saveCheckin(createClient(), clientId, date, {
        ...values,
        bodyWeightKg: weightValue,
        note: note.trim() === "" ? null : note.trim(),
      });
      onSaved(saved);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-6"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {METRICS.map((metric) => (
        <ScaleInput
          key={metric.key}
          metric={metric}
          value={values[metric.key]}
          onChange={(v) => setValues((current) => ({ ...current, [metric.key]: v }))}
        />
      ))}

      <div className="grid grid-cols-[1fr] gap-5">
        <FormField
          label="体重"
          optional
          error={weightError}
          hint={latestWeightKg != null && !initial?.body_weight_kg ? `前回 ${formatKg(latestWeightKg)}kg` : undefined}
        >
          {(props) => (
            <div className="relative">
              <input
                {...props}
                className="field num pr-12 text-lg"
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder={latestWeightKg != null ? formatKg(latestWeightKg) : "例: 72.4"}
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
              />
              <span className="pointer-events-none absolute top-1/2 right-4 -translate-y-1/2 text-sm text-ash">kg</span>
            </div>
          )}
        </FormField>
        <FormField label="メモ" optional>
          {(props) => (
            <textarea
              {...props}
              className="field min-h-[84px] resize-none"
              maxLength={500}
              rows={3}
              placeholder="体調で気になることがあれば"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          )}
        </FormField>
      </div>

      {error ? <Notice tone="error">{error}</Notice> : null}

      <div className="flex flex-col gap-2">
        <Button type="submit" size="lg" block loading={saving} disabled={remaining > 0}>
          {remaining > 0 ? `あと${remaining}項目` : initial ? "チェックインを更新" : "チェックインを保存"}
        </Button>
        {onCancel ? (
          <Button variant="ghost" block onClick={onCancel} disabled={saving}>
            キャンセル
          </Button>
        ) : null}
      </div>
    </form>
  );
}
