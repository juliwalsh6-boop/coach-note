"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconCheck, IconChevronLeft, IconSearch } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { cn } from "@/lib/cn";
import { searchFoods } from "@/lib/data/foods";
import { addMealItems, listRecentItems, type MealItemInput } from "@/lib/data/meals";
import type { DB } from "@/lib/data/db";
import { toErrorMessage } from "@/lib/errors";
import {
  draftAmount,
  draftFromFood,
  draftFromSaved,
  draftNutrients,
  draftToPayload,
  emptyManualDraft,
  validateDraft,
  type ItemDraft,
} from "@/lib/nutrition/draft";
import { foodNutrients, formatAmount, type FoodChannel } from "@/lib/nutrition/foods";
import { formatNutrient } from "@/lib/nutrition/format";
import { MEAL_TYPE_LABELS, type MealType } from "@/lib/nutrition/meal-types";
import { itemNutrients } from "@/lib/nutrition/rows";
import type { FoodRow, MealItem } from "@/types/app";
import { FoodPriceLine, FoodSourceLine } from "./food-source-badge";
import { AmountField, MealTypePicker, NameField, NutrientFields } from "./item-editor";
import { itemAmountText } from "./meal-item-row";
import { MacroInline } from "./nutrition-summary";

type Tab = "search" | "recent" | "manual";

type Detail = { draft: ItemDraft; food: FoodRow | null; editableValues: boolean };

const CHANNELS: { key: FoodChannel | null; label: string }[] = [
  { key: null, label: "すべて" },
  { key: "convenience", label: "コンビニ" },
  { key: "restaurant", label: "外食" },
  { key: "grocery", label: "食品" },
];

export function draftToItemInput(draft: ItemDraft): MealItemInput {
  const payload = draftToPayload(draft);
  return {
    name: payload.name,
    brand: payload.brand,
    origin: payload.origin,
    foodId: payload.foodId,
    fromPhoto: payload.fromPhoto,
    unit: payload.unit,
    refAmount: payload.refAmount,
    ref: payload.ref,
    amount: payload.amount,
    servingLabel: payload.servingLabel,
    servingWeightG: payload.servingWeightG,
  };
}

/**
 * 食べたものを追加するシート（検索 / 最近の食べもの / 手入力）。
 * 追加してもシートは閉じないので、続けて何品でも追加できる。
 */
export function AddFoodSheet({
  db,
  clientId,
  date,
  initialMealType,
  initialTab = "search",
  onClose,
  onAdded,
}: {
  db: DB;
  clientId: string;
  date: string;
  initialMealType: MealType;
  initialTab?: Tab;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [query, setQuery] = useState("");
  const [channel, setChannel] = useState<FoodChannel | null>(null);
  const [results, setResults] = useState<FoodRow[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [recent, setRecent] = useState<MealItem[] | null>(null);
  const [recentError, setRecentError] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [manual, setManual] = useState<ItemDraft>(() => emptyManualDraft("manual"));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [added, setAdded] = useState<string[]>([]);
  const requestId = useRef<string | null>(null);

  // 検索（入力が止まって 0.25 秒後）
  useEffect(() => {
    if (tab !== "search") return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      setSearchError(null);
      searchFoods(db, { query, channel, limit: 40 })
        .then((rows) => {
          if (!cancelled) setResults(rows);
        })
        .catch((e: unknown) => {
          if (!cancelled) setSearchError(toErrorMessage(e));
        })
        .finally(() => {
          if (!cancelled) setSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [db, query, channel, tab]);

  // 最近の食べもの（タブを開いたときに読み込む）
  useEffect(() => {
    if (tab !== "recent" || recent !== null) return;
    let cancelled = false;
    listRecentItems(db, clientId, 30)
      .then((rows) => {
        if (!cancelled) setRecent(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setRecentError(toErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [db, clientId, tab, recent]);

  async function add(draft: ItemDraft) {
    const problem = validateDraft(draft);
    if (problem) {
      setNameError(problem.field === "name" ? problem.message : null);
      setError(problem.field === "name" ? null : problem.message);
      return;
    }
    setError(null);
    setNameError(null);
    setSaving(true);
    requestId.current ??= crypto.randomUUID();
    try {
      await addMealItems(db, {
        date,
        mealType,
        items: [draftToItemInput(draft)],
        requestId: requestId.current,
      });
      requestId.current = null;
      setAdded((current) => [...current, `${draft.name.trim()}（${MEAL_TYPE_LABELS[mealType]}）`]);
      setDetail(null);
      if (draft.origin === "manual") setManual(emptyManualDraft(`manual-${Date.now()}`));
      onAdded();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  const footer = detail ? (
    <Button size="lg" block loading={saving} onClick={() => void add(detail.draft)}>
      {MEAL_TYPE_LABELS[mealType]}に追加する
    </Button>
  ) : tab === "manual" ? (
    <Button size="lg" block loading={saving} onClick={() => void add(manual)}>
      {MEAL_TYPE_LABELS[mealType]}に追加する
    </Button>
  ) : null;

  const manualDirty = manual.name.trim() !== "" || Object.values(manual.valueTexts).some((v) => v !== "");

  return (
    <Sheet
      open
      size="full"
      title="食べたものを追加"
      onClose={onClose}
      busy={saving}
      confirmClose={detail || (tab === "manual" && manualDirty) ? { title: "入力中の内容を破棄しますか？", confirmLabel: "破棄する", cancelLabel: "入力を続ける" } : null}
      footer={footer}
    >
      <div className="space-y-4">
        <MealTypePicker value={mealType} onChange={setMealType} />

        {added.length > 0 ? (
          <Notice tone="success">
            <span className="flex items-start gap-1.5">
              <IconCheck size={16} className="mt-0.5 shrink-0" />
              <span>
                追加しました: {added.slice(-3).join("、")}
                {added.length > 3 ? ` ほか${added.length - 3}品` : ""}
              </span>
            </span>
          </Notice>
        ) : null}

        {detail ? (
          <FoodDetail
            detail={detail}
            onChange={(draft) => setDetail({ ...detail, draft })}
            onBack={() => {
              setDetail(null);
              setError(null);
            }}
            nameError={nameError}
          />
        ) : (
          <>
            <div role="tablist" aria-label="追加のしかた" className="grid grid-cols-3 gap-1 rounded-2xl bg-iron p-1">
              {(
                [
                  ["search", "検索"],
                  ["recent", "最近"],
                  ["manual", "手入力"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  role="tab"
                  aria-selected={tab === key}
                  onClick={() => {
                    setTab(key);
                    setError(null);
                  }}
                  className={cn("min-h-10 rounded-xl text-sm font-bold", tab === key ? "bg-rubber text-chalk" : "text-ash")}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === "search" ? (
              <div className="space-y-3">
                <label className="relative block">
                  <span className="sr-only">食品・メニューを検索</span>
                  <IconSearch size={18} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ash" />
                  <input
                    type="search"
                    className="field scroll-mt-focus pl-10"
                    placeholder="例: サラダチキン、牛丼、おにぎり"
                    enterKeyHint="search"
                    autoComplete="off"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                </label>
                <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
                  {CHANNELS.map((c) => (
                    <button
                      key={c.label}
                      type="button"
                      onClick={() => setChannel(c.key)}
                      aria-pressed={channel === c.key}
                      className={cn(
                        "min-h-9 shrink-0 rounded-full px-3.5 text-sm font-bold",
                        channel === c.key ? "bg-plate-blue text-white" : "bg-rubber text-ash",
                      )}
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
                {searchError ? <Notice tone="error">{searchError}</Notice> : null}
                <FoodResults
                  foods={results}
                  loading={searching}
                  query={query}
                  onPick={(food) => {
                    const draft = draftFromFood(food, food.id, 1);
                    if (draft) setDetail({ draft, food, editableValues: false });
                  }}
                  onManual={() => {
                    setTab("manual");
                    setManual((current) => ({ ...current, name: current.name || query.trim() }));
                  }}
                />
              </div>
            ) : null}

            {tab === "recent" ? (
              <div className="space-y-2">
                {recentError ? <Notice tone="error">{recentError}</Notice> : null}
                {recent === null && !recentError ? <p className="py-6 text-center text-sm text-ash">読み込み中…</p> : null}
                {recent && recent.length === 0 ? (
                  <p className="py-6 text-center text-sm text-ash">まだ記録がありません。記録したものがここに出ます。</p>
                ) : null}
                <ul className="divide-y divide-line">
                  {(recent ?? []).map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        className="flex w-full items-start gap-3 py-3 text-left active:bg-rubber"
                        onClick={() => setDetail({ draft: draftFromSaved(item, item.id, "reuse"), food: null, editableValues: false })}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="leading-snug font-bold break-words">{item.name}</p>
                          <p className="mt-0.5 text-xs text-ash">
                            {item.brand ? `${item.brand} · ` : ""}
                            {itemAmountText(item)}
                          </p>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="num text-sm font-bold">
                            {formatNutrient("energyKcal", Number(item.energy_kcal))}
                            <span className="ml-0.5 font-sans text-[11px] font-normal text-ash">kcal</span>
                          </p>
                          <MacroInline values={itemNutrients(item)} className="justify-end" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            {tab === "manual" ? (
              <div className="space-y-5">
                <NameField draft={manual} onChange={setManual} error={nameError} />
                <AmountField draft={manual} onChange={setManual} allowUnitChange />
                <NutrientFields
                  draft={manual}
                  onChange={setManual}
                  hint="パッケージの栄養成分表示などを見て入力してください。わからない項目は 0 のままで構いません。"
                />
              </div>
            ) : null}
          </>
        )}

        {error ? <Notice tone="error">{error}</Notice> : null}
      </div>
    </Sheet>
  );
}

function FoodResults({
  foods,
  loading,
  query,
  onPick,
  onManual,
}: {
  foods: FoodRow[] | null;
  loading: boolean;
  query: string;
  onPick: (food: FoodRow) => void;
  onManual: () => void;
}) {
  if (foods === null) {
    return <p className="py-6 text-center text-sm text-ash">{loading ? "検索中…" : ""}</p>;
  }
  if (foods.length === 0) {
    return (
      <div className="rounded-[20px] border border-dashed border-line px-4 py-6 text-center">
        <p className="text-sm font-bold">{query.trim() ? `「${query.trim()}」は見つかりませんでした` : "商品データがありません"}</p>
        <p className="mt-1 text-xs text-ash">登録されていない食べものは、手入力で記録できます。</p>
        <Button variant="secondary" className="mt-4" onClick={onManual}>
          手入力する
        </Button>
      </div>
    );
  }
  return (
    <ul className={cn("divide-y divide-line", loading && "opacity-60")} aria-busy={loading || undefined}>
      {foods.map((food) => {
        const values = foodNutrients(food, 1);
        return (
          <li key={food.id}>
            <button type="button" className="flex w-full items-start gap-3 py-3 text-left active:bg-rubber" onClick={() => onPick(food)}>
              <div className="min-w-0 flex-1">
                <p className="leading-snug font-bold break-words">{food.name}</p>
                <p className="mt-0.5 text-xs text-ash">
                  {food.brand ? `${food.brand} · ` : ""}
                  {food.serving_label}
                  {food.serving_weight_g ? `（${Number(food.serving_weight_g)}g）` : ""}
                </p>
                <FoodSourceLine food={food} showLink={false} className="mt-1" />
              </div>
              {values ? (
                <div className="shrink-0 text-right">
                  <p className="num text-sm font-bold">
                    {formatNutrient("energyKcal", values.energyKcal)}
                    <span className="ml-0.5 font-sans text-[11px] font-normal text-ash">kcal</span>
                  </p>
                  <MacroInline values={values} className="justify-end" />
                </div>
              ) : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function FoodDetail({
  detail,
  onChange,
  onBack,
  nameError,
}: {
  detail: Detail;
  onChange: (draft: ItemDraft) => void;
  onBack: () => void;
  nameError: string | null;
}) {
  const values = draftNutrients(detail.draft);
  const { food, draft } = detail;
  return (
    <div className="space-y-4">
      <button type="button" onClick={onBack} className="-ml-2 inline-flex min-h-10 items-center gap-0.5 rounded-lg pr-3 pl-1 text-sm text-ash active:bg-rubber">
        <IconChevronLeft size={18} />
        一覧に戻る
      </button>
      <div>
        <p className="text-lg leading-snug font-bold">{draft.name}</p>
        <p className="mt-0.5 text-sm text-ash">
          {draft.brand ? `${draft.brand} · ` : ""}
          {food ? `${food.serving_label}あたりの栄養値（${food.nutrient_basis === "per_100g" ? "100gあたりの値から換算" : "1食分の値"}）` : "前回と同じ内容"}
        </p>
        {food ? <FoodSourceLine food={food} className="mt-1.5" /> : null}
        {food?.source_note ? <p className="mt-1.5 text-xs leading-relaxed text-ash">{food.source_note}</p> : null}
        {food ? <FoodPriceLine food={food} className="mt-1 text-xs text-ash" /> : null}
      </div>

      {detail.editableValues ? <NameField draft={draft} onChange={onChange} error={nameError} /> : null}
      <AmountField draft={draft} onChange={onChange} />

      {detail.editableValues ? (
        <NutrientFields draft={draft} onChange={onChange} />
      ) : values ? (
        <div className="rounded-2xl bg-iron p-4">
          <p className="text-xs text-ash">{formatAmount(draft.basis.unit, draftAmount(draft) ?? 0, draft.servingLabel)} の栄養値</p>
          <p className="num mt-1 text-2xl font-extrabold">
            {formatNutrient("energyKcal", values.energyKcal)}
            <span className="ml-1 font-sans text-sm font-bold text-ash">kcal</span>
          </p>
          <MacroInline values={values} className="mt-1 text-sm" />
        </div>
      ) : null}
    </div>
  );
}
