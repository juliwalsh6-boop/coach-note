"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconTrash } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { deleteMealItem, updateMealItem } from "@/lib/data/meals";
import type { DB } from "@/lib/data/db";
import { toErrorMessage } from "@/lib/errors";
import { draftFromSaved, draftToPayload, validateDraft, type ItemDraft } from "@/lib/nutrition/draft";
import { formatGram, formatKcal } from "@/lib/nutrition/format";
import type { MealItem } from "@/types/app";
import { AmountField, NameField, NutrientFields } from "./item-editor";
import { ItemOriginBadge } from "./meal-item-row";

type AiEstimate = {
  name?: string;
  estimated_weight_g?: number | null;
  energy_kcal?: number;
  protein_g?: number;
  fat_g?: number;
  carbs_g?: number;
  note?: string;
};

function readAiEstimate(value: MealItem["ai_estimate"]): AiEstimate | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as AiEstimate) : null;
}

/** 記録した 1 品の編集・削除 */
export function ItemEditSheet({
  db,
  item,
  onClose,
  onSaved,
}: {
  db: DB;
  item: MealItem;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const confirm = useConfirm();
  const [draft, setDraft] = useState<ItemDraft>(() => draftFromSaved(item, item.id));
  const [saving, setSaving] = useState<"save" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const ai = readAiEstimate(item.ai_estimate);
  const dirty = JSON.stringify(draft) !== JSON.stringify(draftFromSaved(item, item.id));

  async function save() {
    const problem = validateDraft(draft);
    if (problem) {
      setNameError(problem.field === "name" ? problem.message : null);
      setError(problem.field === "name" ? null : problem.message);
      return;
    }
    setError(null);
    setNameError(null);
    setSaving("save");
    try {
      const payload = draftToPayload(draft);
      await updateMealItem(db, item.id, {
        name: payload.name,
        unit: payload.unit,
        refAmount: payload.refAmount,
        ref: payload.ref,
        amount: payload.amount,
        servingLabel: payload.servingLabel,
        servingWeightG: payload.servingWeightG,
      });
      onSaved("変更を保存しました");
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(null);
    }
  }

  async function remove() {
    const ok = await confirm({
      title: `「${item.name}」を削除しますか？`,
      message: "1日の合計からも差し引かれます。トレーナーの画面からも消えます。",
      confirmLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    setSaving("delete");
    try {
      await deleteMealItem(db, item.id);
      onSaved("削除しました");
    } catch (e) {
      setError(toErrorMessage(e));
      setSaving(null);
    }
  }

  return (
    <Sheet
      open
      size="full"
      title="食べたものを編集"
      description={<ItemOriginBadge item={item} />}
      onClose={onClose}
      busy={saving !== null}
      confirmClose={dirty ? { title: "変更を保存せずに閉じますか？", confirmLabel: "閉じる", cancelLabel: "編集を続ける" } : null}
      footer={
        <div className="flex gap-2">
          <Button variant="danger" size="lg" onClick={() => void remove()} loading={saving === "delete"} disabled={saving !== null} aria-label="削除">
            {saving === "delete" ? null : <IconTrash size={18} />}
          </Button>
          <Button size="lg" block onClick={() => void save()} loading={saving === "save"} disabled={saving !== null || !dirty}>
            保存する
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        <NameField draft={draft} onChange={setDraft} error={nameError} />
        <AmountField draft={draft} onChange={setDraft} />
        <NutrientFields draft={draft} onChange={setDraft} />

        {ai ? (
          <div className="rounded-xl bg-iron px-3.5 py-3 text-xs leading-relaxed text-ash">
            <p className="font-bold text-chalk">AI の推定（解析したときの値）</p>
            <p className="num mt-1">
              {ai.name}
              {ai.estimated_weight_g ? ` ${formatGram(ai.estimated_weight_g)}g` : ""} · {formatKcal(ai.energy_kcal ?? 0)}kcal · P
              {formatGram(ai.protein_g ?? 0)} F{formatGram(ai.fat_g ?? 0)} C{formatGram(ai.carbs_g ?? 0)}
            </p>
            {ai.note ? <p className="mt-1">{ai.note}</p> : null}
            <p className="mt-1">写真からの推定値です。量や油・調味料は実際と違うことがあります。</p>
          </div>
        ) : null}

        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </Sheet>
  );
}
