"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconAlert, IconChevronRight, IconPlus, IconRefresh, IconSparkle, IconX } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/cn";
import { newPhotoPath, removeUploadedPhoto, uploadMealPhoto } from "@/lib/data/meal-photos";
import { addMealItems, findPhotoByHash } from "@/lib/data/meals";
import type { DB } from "@/lib/data/db";
import { formatDateShort } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { compressImage, ImageProcessingError, type CompressedImage } from "@/lib/images/compress";
import { CONFIDENCE_LABELS, toAiEstimate, type AnalysisConfidence } from "@/lib/nutrition/analysis";
import { requestMealAnalysis } from "@/lib/nutrition/analysis-api";
import {
  draftAmount,
  draftFromAnalysis,
  draftNutrients,
  emptyManualDraft,
  validateDraft,
  type ItemDraft,
} from "@/lib/nutrition/draft";
import { formatNutrient } from "@/lib/nutrition/format";
import { isMealType, MEAL_TYPE_LABELS, type MealType } from "@/lib/nutrition/meal-types";
import { sumNutrients } from "@/lib/nutrition/nutrients";
import { draftToItemInput } from "./add-food-sheet";
import { AmountField, MealTypePicker, NameField, NutrientFields } from "./item-editor";
import { MacroInline } from "./nutrition-summary";

type Phase =
  | { name: "preparing" }
  | { name: "duplicate"; date: string; mealType: string }
  | { name: "uploading"; progress: number }
  | { name: "analyzing" }
  | { name: "review" }
  | { name: "manual"; reason: string }
  | { name: "failed"; message: string };

type AnalysisMeta = {
  model: string;
  analyzedAt: string;
  overall: AnalysisConfidence;
  warnings: string[];
  isFoodPhoto: boolean;
};

const CONFIDENCE_STYLE: Record<AnalysisConfidence, string> = {
  high: "bg-plate-green/15 text-plate-green-bright",
  medium: "bg-plate-yellow/15 text-plate-yellow",
  low: "bg-plate-red/15 text-plate-red-bright",
};

let draftCounter = 0;
function nextKey(prefix: string): string {
  draftCounter += 1;
  return `${prefix}-${draftCounter}`;
}

/**
 * 写真で記録: 圧縮 → AI 解析 → 内容の確認・修正 → 記録する。
 * 「記録する」を押すまでは何も保存しない。AI が使えない・失敗したときは、写真をつけたまま手入力に切り替える。
 */
export function PhotoAnalysisSheet({
  db,
  clientId,
  date,
  initialMealType,
  file,
  onClose,
  onSaved,
}: {
  db: DB;
  clientId: string;
  date: string;
  initialMealType: MealType;
  file: File;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const [phase, setPhase] = useState<Phase>({ name: "preparing" });
  const [image, setImage] = useState<CompressedImage | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [meta, setMeta] = useState<AnalysisMeta | null>(null);
  const [drafts, setDrafts] = useState<ItemDraft[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [keepPhoto, setKeepPhoto] = useState(true);
  const [saving, setSaving] = useState<{ progress: number } | null>(null);
  const [error, setError] = useState<{ key: string | null; message: string } | null>(null);
  const requestId = useRef<string | null>(null);
  const uploadedPath = useRef<string | null>(null);
  const saved = useRef(false);
  const abort = useRef<AbortController | null>(null);

  async function analyze(target: CompressedImage) {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    setError(null);
    setPhase({ name: "uploading", progress: 0 });
    const response = await requestMealAnalysis(
      target.blob,
      (ratio) => setPhase(ratio >= 1 ? { name: "analyzing" } : { name: "uploading", progress: ratio }),
      controller.signal,
    );
    if (controller.signal.aborted) return;
    if (response.ok) {
      const { analysis } = response;
      setMeta({
        model: response.model,
        analyzedAt: response.analyzedAt,
        overall: analysis.overallConfidence,
        warnings: analysis.warnings,
        isFoodPhoto: analysis.isFoodPhoto,
      });
      setDrafts(analysis.items.map((item) => draftFromAnalysis(item, nextKey("ai"))));
      setPhase({ name: "review" });
    } else {
      setMeta(null);
      setDrafts([{ ...emptyManualDraft(nextKey("manual")), fromPhoto: true }]);
      setExpanded(null);
      setPhase({ name: "manual", reason: toErrorMessage(response.error) });
    }
  }

  // 写真を選んだら: 圧縮 → 同じ写真が記録済みか確認 → 解析
  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    compressImage(file)
      .then(async (compressed) => {
        if (cancelled) return;
        objectUrl = URL.createObjectURL(compressed.blob);
        setImage(compressed);
        setPreviewUrl(objectUrl);
        const existing = await findPhotoByHash(db, clientId, compressed.hash).catch(() => null);
        if (cancelled) return;
        if (existing) {
          setPhase({ name: "duplicate", date: existing.date, mealType: existing.mealType });
        } else {
          await analyze(compressed);
        }
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const code = e instanceof ImageProcessingError ? e.code : "invalid_image";
        setPhase({ name: "failed", message: toErrorMessage(code) });
      });
    return () => {
      cancelled = true;
      abort.current?.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
    // 写真ごとに 1 回だけ実行する
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);

  // 保存せずに閉じたら、アップロード済みのファイルを消す
  useEffect(() => {
    return () => {
      if (!saved.current && uploadedPath.current) void removeUploadedPhoto(db, uploadedPath.current);
    };
  }, [db]);

  function updateDraft(key: string, draft: ItemDraft) {
    setDrafts((current) => current.map((d) => (d.key === key ? draft : d)));
  }

  function removeDraft(key: string) {
    setDrafts((current) => current.filter((d) => d.key !== key));
  }

  function addManual() {
    const draft = { ...emptyManualDraft(nextKey("manual")), fromPhoto: true };
    setDrafts((current) => [...current, draft]);
    setExpanded(draft.key);
  }

  async function save() {
    for (const draft of drafts) {
      const problem = validateDraft(draft);
      if (problem) {
        setExpanded(draft.key);
        setError({ key: draft.key, message: `${draft.name.trim() || "名前のない品"}: ${problem.message}` });
        return;
      }
    }
    if (drafts.length === 0 && !keepPhoto) {
      setError({ key: null, message: "記録する食べものがありません。食べたものを追加するか、写真を保存してください。" });
      return;
    }
    if (!image) return;
    setError(null);
    setSaving({ progress: 0 });
    requestId.current ??= crypto.randomUUID();
    try {
      let photo = null;
      if (keepPhoto) {
        if (!uploadedPath.current) {
          const path = newPhotoPath(clientId, crypto.randomUUID());
          await uploadMealPhoto(db, path, image.blob, (ratio) => setSaving({ progress: ratio }));
          uploadedPath.current = path;
        }
        photo = {
          storagePath: uploadedPath.current,
          contentHash: image.hash,
          width: image.width,
          height: image.height,
          sizeBytes: image.blob.size,
        };
      }
      const items = drafts.map((draft) => {
        const input = draftToItemInput(draft);
        if (draft.ai && meta && draft.origin === "ai_photo") {
          input.aiEstimate = toAiEstimate(draft.ai, { model: meta.model, analyzedAt: meta.analyzedAt });
        }
        input.fromPhoto = keepPhoto;
        return input;
      });
      await addMealItems(db, { date, mealType, items, photo, requestId: requestId.current });
      saved.current = true;
      onSaved(`${MEAL_TYPE_LABELS[mealType]}に記録しました`);
    } catch (e) {
      setError({ key: null, message: toErrorMessage(e) });
      setSaving(null);
    }
  }

  const editing = phase.name === "review" || phase.name === "manual";
  const totals = sumNutrients(drafts.map((d) => draftNutrients(d) ?? { energyKcal: 0, proteinG: 0, fatG: 0, carbsG: 0 }));
  const busy = saving !== null;

  return (
    <Sheet
      open
      size="full"
      title="写真で記録"
      description={formatDateShort(date)}
      onClose={() => {
        abort.current?.abort();
        onClose();
      }}
      busy={busy}
      confirmClose={editing && !busy ? { title: "記録せずに閉じますか？", message: "解析結果と入力した内容は保存されません。", confirmLabel: "閉じる", cancelLabel: "戻る" } : null}
      footer={
        editing ? (
          <div className="space-y-2">
            {saving ? (
              <div className="h-1.5 overflow-hidden rounded-full bg-line" aria-hidden="true">
                <div className="h-full bg-plate-blue-bright transition-[width]" style={{ width: `${Math.round(saving.progress * 100)}%` }} />
              </div>
            ) : null}
            <Button size="lg" block loading={busy} onClick={() => void save()}>
              {busy
                ? keepPhoto && saving && saving.progress < 1
                  ? `写真を送信中 ${Math.round(saving.progress * 100)}%`
                  : "保存中…"
                : `${MEAL_TYPE_LABELS[mealType]}に記録する`}
            </Button>
          </div>
        ) : null
      }
    >
      <div className="space-y-4">
        {previewUrl ? (
          <div className="flex items-start gap-3">
            {/* 圧縮した写真のプレビュー（端末内の一時 URL） */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="選んだ食事の写真" className="h-24 w-24 shrink-0 rounded-xl border border-line object-cover" />
            <div className="min-w-0 text-sm">
              {phase.name === "uploading" ? (
                <ProgressLine label={`写真を送信中… ${Math.round(phase.progress * 100)}%`} progress={phase.progress} />
              ) : null}
              {phase.name === "analyzing" ? <ProgressLine label="AI が写真を解析しています…" /> : null}
              {phase.name === "review" && meta ? (
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 font-bold">
                    <IconSparkle size={16} className="text-plate-blue-bright" />
                    AI の推定結果
                  </p>
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-bold", CONFIDENCE_STYLE[meta.overall])}>
                    {CONFIDENCE_LABELS[meta.overall]}
                  </span>
                </div>
              ) : null}
              {phase.name === "manual" ? <p className="font-bold">手入力で記録</p> : null}
            </div>
          </div>
        ) : phase.name === "preparing" ? (
          <ProgressLine label="写真を準備しています…" />
        ) : null}

        {phase.name === "failed" ? (
          <div className="space-y-4">
            <Notice tone="error">{phase.message}</Notice>
            <Button variant="secondary" block onClick={onClose}>
              閉じる
            </Button>
          </div>
        ) : null}

        {phase.name === "duplicate" ? (
          <div className="space-y-3">
            <Notice tone="warning">
              この写真は {formatDateShort(phase.date)} の{isMealType(phase.mealType) ? MEAL_TYPE_LABELS[phase.mealType] : "食事"}
              にすでに記録されています。同じ食事を二重に記録していないか確認してください。
            </Notice>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="secondary" size="lg" onClick={onClose}>
                やめる
              </Button>
              <Button size="lg" onClick={() => image && void analyze(image)}>
                解析を続ける
              </Button>
            </div>
          </div>
        ) : null}

        {phase.name === "manual" ? (
          <Notice tone="warning">
            <span className="block">{phase.reason}</span>
            <span className="mt-1 block text-xs">写真はそのまま保存できます。食べたものを入力して記録してください。</span>
            {image ? (
              <button
                type="button"
                onClick={() => void analyze(image)}
                className="mt-2 inline-flex min-h-9 items-center gap-1 rounded-lg bg-plate-yellow/20 px-3 text-xs font-bold text-plate-yellow"
              >
                <IconRefresh size={14} />
                もう一度 AI で解析する
              </button>
            ) : null}
          </Notice>
        ) : null}

        {phase.name === "review" && meta ? (
          <>
            {!meta.isFoodPhoto || drafts.length === 0 ? (
              <Notice tone="warning">食事が写っていないようです。別の写真を選ぶか、「食べたものを追加」から入力してください。</Notice>
            ) : null}
            {meta.warnings.length > 0 ? (
              <Notice tone="warning">
                <ul className="list-disc space-y-0.5 pl-4">
                  {meta.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </Notice>
            ) : null}
            <p className="text-xs leading-relaxed text-ash">
              写真からの<strong className="text-chalk">推定値</strong>
              です。重さ・油・調味料などは写真だけでは正確に判断できないことがあります。内容と量を確認し、違うところは直してから記録してください。
            </p>
          </>
        ) : null}

        {editing ? (
          <>
            <MealTypePicker value={mealType} onChange={setMealType} />

            <ul className="space-y-2">
              {drafts.map((draft) => (
                <li key={draft.key}>
                  <DraftCard
                    draft={draft}
                    open={expanded === draft.key}
                    onToggle={() => setExpanded(expanded === draft.key ? null : draft.key)}
                    onChange={(next) => updateDraft(draft.key, next)}
                    onRemove={() => removeDraft(draft.key)}
                    error={error?.key === draft.key ? error.message : null}
                  />
                </li>
              ))}
            </ul>

            <Button variant="secondary" block onClick={addManual}>
              <IconPlus size={18} />
              食べたものを追加
            </Button>

            <div className="rounded-2xl bg-iron p-4">
              <p className="text-xs text-ash">合計（{drafts.length}品）</p>
              <p className="num mt-0.5 text-2xl font-extrabold">
                {formatNutrient("energyKcal", totals.energyKcal)}
                <span className="ml-1 font-sans text-sm font-bold text-ash">kcal</span>
              </p>
              <MacroInline values={totals} className="mt-1 text-sm" />
            </div>

            <label className="flex min-h-12 items-center gap-3 rounded-xl px-1">
              <input
                type="checkbox"
                className="h-5 w-5 accent-plate-blue"
                checked={keepPhoto}
                onChange={(e) => setKeepPhoto(e.target.checked)}
              />
              <span className="text-sm">
                写真も保存する
                <span className="block text-xs text-ash">あなたと担当トレーナーだけが見られます</span>
              </span>
            </label>

            {error && error.key === null ? <Notice tone="error">{error.message}</Notice> : null}
          </>
        ) : null}
      </div>
    </Sheet>
  );
}

function ProgressLine({ label, progress }: { label: string; progress?: number }) {
  return (
    <div className="space-y-2" role="status">
      <p className="flex items-center gap-2 text-sm font-bold">
        <Spinner size={16} />
        {label}
      </p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-line" aria-hidden="true">
        {progress == null ? (
          <div className="h-full w-1/3 animate-pulse rounded-full bg-plate-blue-bright" />
        ) : (
          <div className="h-full rounded-full bg-plate-blue-bright transition-[width]" style={{ width: `${Math.round(progress * 100)}%` }} />
        )}
      </div>
    </div>
  );
}

function DraftCard({
  draft,
  open,
  onToggle,
  onChange,
  onRemove,
  error,
}: {
  draft: ItemDraft;
  open: boolean;
  onToggle: () => void;
  onChange: (draft: ItemDraft) => void;
  onRemove: () => void;
  error: string | null;
}) {
  const values = draftNutrients(draft);
  const amount = draftAmount(draft);
  const flags = draft.ai?.flags ?? [];
  const confidence = draft.ai?.confidence ?? null;

  return (
    <div className={cn("rounded-2xl border bg-rubber/60", error ? "border-plate-red/60" : "border-line")}>
      <div className="flex items-start gap-2 p-3">
        <button type="button" onClick={onToggle} className="min-w-0 flex-1 text-left" aria-expanded={open}>
          <p className="leading-snug font-bold break-words">{draft.name.trim() || "（名前を入力）"}</p>
          <p className="mt-0.5 text-xs text-ash">
            {amount != null ? (draft.basis.unit === "g" ? `${amount}g` : `${amount}${draft.servingLabel ? `（${draft.servingLabel}）` : "食"}`) : "量を入力"}
            {values ? ` · ${formatNutrient("energyKcal", values.energyKcal)}kcal` : ""}
          </p>
          {values ? <MacroInline values={values} className="mt-0.5" /> : null}
          <span className="mt-1.5 flex flex-wrap gap-1">
            {confidence ? (
              <span className={cn("rounded-md px-1.5 py-0.5 text-[10px] font-bold", CONFIDENCE_STYLE[confidence])}>
                {CONFIDENCE_LABELS[confidence]}
              </span>
            ) : (
              <span className="rounded-md bg-rubber px-1.5 py-0.5 text-[10px] font-bold text-ash">手入力</span>
            )}
            {flags.includes("possible_duplicate") ? (
              <span className="inline-flex items-center gap-0.5 rounded-md bg-plate-red/15 px-1.5 py-0.5 text-[10px] font-bold text-plate-red-bright">
                <IconAlert size={11} />
                重複の可能性
              </span>
            ) : null}
            {flags.includes("energy_mismatch") ? (
              <span className="rounded-md bg-plate-yellow/15 px-1.5 py-0.5 text-[10px] font-bold text-plate-yellow">
                カロリーとPFCに差
              </span>
            ) : null}
          </span>
          <span className="mt-1.5 inline-flex items-center gap-0.5 text-xs font-bold text-plate-blue-bright">
            {open ? "閉じる" : "内容・量を直す"}
            <IconChevronRight size={14} className={cn("transition-transform", open && "rotate-90")} />
          </span>
        </button>
        <button
          type="button"
          onClick={onRemove}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ash active:bg-line"
          aria-label={`${draft.name || "この品"}を外す`}
        >
          <IconX size={18} />
        </button>
      </div>
      {open ? (
        <div className="space-y-4 border-t border-line p-3">
          <NameField draft={draft} onChange={onChange} placeholder="例: 鶏の唐揚げ" />
          <AmountField draft={draft} onChange={onChange} allowUnitChange={draft.origin === "manual"} />
          <NutrientFields draft={draft} onChange={onChange} hint={draft.ai?.note ? `AI のメモ: ${draft.ai.note}` : undefined} />
        </div>
      ) : null}
      {error ? <p className="px-3 pb-3 text-xs text-plate-red-bright">{error}</p> : null}
    </div>
  );
}
