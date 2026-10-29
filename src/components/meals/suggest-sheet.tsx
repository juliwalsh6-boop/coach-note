"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { IconCheck, IconChevronDown, IconExternal, IconStore, IconUtensils } from "@/components/ui/icons";
import { Notice } from "@/components/ui/notice";
import { Sheet } from "@/components/ui/sheet";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { listBrands, listSuggestionFoods, type BrandSummary } from "@/lib/data/foods";
import { addMealItems, type MealItemInput } from "@/lib/data/meals";
import type { DB } from "@/lib/data/db";
import { formatDateShort } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { FOOD_GENRE_LABELS, formatAmount, type FoodChannel, type FoodGenre, type MealRole } from "@/lib/nutrition/foods";
import { formatNutrient, formatSignedNutrient, NUTRIENT_SHORT } from "@/lib/nutrition/format";
import { MEAL_TYPE_LABELS, mealShare, type MealType } from "@/lib/nutrition/meal-types";
import { NUTRIENT_KEYS, type Nutrients } from "@/lib/nutrition/nutrients";
import type { TargetValues } from "@/lib/nutrition/rows";
import {
  SUGGESTION_FIT_LABELS,
  suggestMeals,
  type SuggestFood,
  type Suggestion,
  type SuggestionFit,
} from "@/lib/nutrition/suggest";
import type { FoodRow } from "@/types/app";
import { FoodPriceLine, VerificationBadge } from "./food-source-badge";
import { MealTypePicker } from "./item-editor";
import { MacroInline, NUTRIENT_COLORS } from "./nutrition-summary";

/** コンビニの 3 社（データが無い間も「準備中」として表示する） */
const CONVENIENCE_STORES: { key: string; label: string }[] = [
  { key: "seven_eleven", label: "セブン‐イレブン" },
  { key: "familymart", label: "ファミリーマート" },
  { key: "lawson", label: "ローソン" },
];

const GENRES: FoodGenre[] = ["gyudon", "teishoku", "sushi", "family", "fastfood", "other"];

const MEAL_ROLES: ReadonlySet<string> = new Set(["main", "staple", "protein", "side", "soup", "drink", "snack"]);

const FIT_STYLE: Record<SuggestionFit, string> = {
  within: "bg-plate-green/15 text-plate-green-bright",
  near: "bg-plate-blue/15 text-plate-blue-bright",
  under: "bg-plate-yellow/15 text-plate-yellow",
  over: "bg-plate-red/18 text-plate-red-bright",
};

function toSuggestFood(row: FoodRow): SuggestFood | null {
  if (row.channel !== "convenience" && row.channel !== "restaurant") return null;
  if (!MEAL_ROLES.has(row.meal_role)) return null;
  const verification = row.verification_status === "verified" ? "verified" : row.verification_status === "sample" ? "sample" : "unverified";
  return {
    ...row,
    channel: row.channel,
    meal_role: row.meal_role as MealRole,
    verification_status: verification,
    serving_weight_g: row.serving_weight_g == null ? null : Number(row.serving_weight_g),
    energy_kcal: Number(row.energy_kcal),
    protein_g: Number(row.protein_g),
    fat_g: Number(row.fat_g),
    carbs_g: Number(row.carbs_g),
  };
}

function suggestionToItems(suggestion: Suggestion): MealItemInput[] {
  return suggestion.items.map((item) => ({
    name: item.food.name,
    brand: item.food.brand,
    origin: "food",
    foodId: item.food.id,
    unit: item.basis.unit,
    refAmount: item.basis.refAmount,
    ref: item.basis.ref,
    amount: item.amount,
    servingLabel: item.basis.unit === "serving" ? item.food.serving_label : null,
    servingWeightG: item.basis.unit === "serving" ? item.food.serving_weight_g : null,
  }));
}

/**
 * コンビニ・外食で選ぶ: 残りの PFC に合う組み合わせを提案し、選んだものをそのまま記録する。
 */
export function SuggestSheet({
  db,
  date,
  initialChannel,
  initialMealType,
  target,
  intake,
  loggedMealTypes,
  onClose,
  onAdded,
}: {
  db: DB;
  date: string;
  initialChannel: FoodChannel;
  initialMealType: MealType;
  target: TargetValues | null;
  intake: Nutrients;
  loggedMealTypes: ReadonlySet<MealType>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [channel, setChannel] = useState<FoodChannel>(initialChannel);
  const [brands, setBrands] = useState<BrandSummary[] | null>(null);
  const [store, setStore] = useState<string | null>(null);
  const [genre, setGenre] = useState<FoodGenre | null>(null);
  const [chain, setChain] = useState<string | null>(null);
  const [mealType, setMealType] = useState<MealType>(initialMealType);
  const [useAll, setUseAll] = useState(false);
  const [foods, setFoods] = useState<FoodRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingKey, setAddingKey] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<ReadonlySet<string>>(() => new Set());
  const [lastRecorded, setLastRecorded] = useState<string | null>(null);
  const requestIds = useRef(new Map<string, string>());
  const { toast } = useToast();

  // 商品データのあるお店
  useEffect(() => {
    let cancelled = false;
    listBrands(db)
      .then((rows) => {
        if (!cancelled) setBrands(rows);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(toErrorMessage(e));
      });
    return () => {
      cancelled = true;
    };
  }, [db]);

  // 選んだお店・ジャンルの商品
  const filterKey = channel === "convenience" ? (store ? `c:${store}` : null) : genre ? `r:${genre}:${chain ?? ""}` : null;
  useEffect(() => {
    if (!filterKey) return;
    let cancelled = false;
    const [kind, first, second] = filterKey.split(":");
    const filter =
      kind === "c"
        ? { channel: "convenience" as const, brandKey: first ?? null }
        : { channel: "restaurant" as const, genre: first ?? null, brandKey: second || null };
    const timer = window.setTimeout(() => {
      setLoading(true);
      setError(null);
      listSuggestionFoods(db, filter)
        .then((rows) => {
          if (!cancelled) setFoods(rows);
        })
        .catch((e: unknown) => {
          if (!cancelled) setError(toErrorMessage(e));
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 0);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [db, filterKey]);

  const share = useAll ? 1 : mealShare(mealType, loggedMealTypes);
  const result = useMemo(() => {
    if (!target || !foods || !filterKey) return null;
    const usable = foods.map(toSuggestFood).filter((f): f is SuggestFood => f !== null);
    return suggestMeals({ foods: usable, target: target.target, tolerance: target.tolerance, intake, share, limit: 6 });
  }, [foods, filterKey, target, intake, share]);

  const brandsForChannel = (brands ?? []).filter((b) => b.channel === channel);
  const chainsForGenre = brandsForChannel.filter((b) => b.genre === genre);

  async function record(suggestion: Suggestion) {
    setAddingKey(suggestion.key);
    setError(null);
    const requestId = requestIds.current.get(suggestion.key) ?? crypto.randomUUID();
    requestIds.current.set(suggestion.key, requestId);
    try {
      await addMealItems(db, { date, mealType, items: suggestionToItems(suggestion), requestId });
      setAddedKeys((current) => new Set([...current, suggestion.key]));
      // 記録すると残りが変わり、下の候補も入れ替わるので、何を記録したかを上に残しておく
      const label = MEAL_TYPE_LABELS[mealType];
      setLastRecorded(
        `${label}に記録しました: ${suggestion.items
          .map((i) => `${i.food.name}${i.quantity > 1 ? ` ×${i.quantity}` : ""}`)
          .join("、")}`,
      );
      toast(`${label}に記録しました`, "success");
      onAdded();
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setAddingKey(null);
    }
  }

  return (
    <Sheet open size="full" title="コンビニ・外食で選ぶ" description={`${formatDateShort(date)}の残りに合わせた組み合わせ`} onClose={onClose} busy={addingKey !== null}>
      <div className="space-y-4">
        {lastRecorded ? (
          <Notice tone="success">
            <span className="flex items-start gap-1.5">
              <IconCheck size={16} className="mt-0.5 shrink-0" />
              <span>
                {lastRecorded}
                <span className="mt-0.5 block text-xs">残りが変わったので、下の候補を今の残りに合わせて更新しました。</span>
              </span>
            </span>
          </Notice>
        ) : null}
        <div role="tablist" aria-label="お店の種類" className="grid grid-cols-2 gap-1 rounded-2xl bg-iron p-1">
          {(
            [
              ["convenience", "コンビニ", IconStore],
              ["restaurant", "外食チェーン", IconUtensils],
            ] as const
          ).map(([key, label, Icon]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={channel === key}
              onClick={() => {
                setChannel(key);
                setFoods(null);
              }}
              className={cn(
                "flex min-h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold",
                channel === key ? "bg-rubber text-chalk" : "text-ash",
              )}
            >
              <Icon size={18} />
              {label}
            </button>
          ))}
        </div>

        {channel === "convenience" ? (
          <ChipGroup label="お店">
            {CONVENIENCE_STORES.map((s) => {
              const summary = brandsForChannel.find((b) => b.brandKey === s.key);
              return (
                <Chip
                  key={s.key}
                  active={store === s.key}
                  disabled={!summary}
                  onClick={() => {
                    setStore(s.key);
                    setFoods(null);
                  }}
                  sub={summary ? `${summary.count}品` : "準備中"}
                >
                  {s.label}
                </Chip>
              );
            })}
          </ChipGroup>
        ) : (
          <>
            <ChipGroup label="ジャンル">
              {GENRES.map((g) => {
                const count = brandsForChannel.filter((b) => b.genre === g).reduce((sum, b) => sum + b.count, 0);
                return (
                  <Chip
                    key={g}
                    active={genre === g}
                    disabled={count === 0}
                    onClick={() => {
                      setGenre(g);
                      setChain(null);
                      setFoods(null);
                    }}
                    sub={count > 0 ? `${count}品` : "準備中"}
                  >
                    {FOOD_GENRE_LABELS[g]}
                  </Chip>
                );
              })}
            </ChipGroup>
            {genre && chainsForGenre.length > 1 ? (
              <ChipGroup label="チェーン">
                <Chip active={chain === null} onClick={() => setChain(null)}>
                  すべて
                </Chip>
                {chainsForGenre.map((b) => (
                  <Chip key={b.brandKey} active={chain === b.brandKey} onClick={() => setChain(b.brandKey)} sub={`${b.count}品`}>
                    {b.brand}
                  </Chip>
                ))}
              </ChipGroup>
            ) : null}
          </>
        )}

        <MealTypePicker value={mealType} onChange={setMealType} label="どの食事か" />

        {!target ? (
          <Notice tone="warning">
            目標がまだ設定されていないため、組み合わせを提案できません。トレーナーに目標を設定してもらってください（商品は「検索して追加」から記録できます）。
          </Notice>
        ) : (
          <div className="rounded-2xl bg-iron p-3.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-ash">
                {MEAL_TYPE_LABELS[mealType]}の目安（1日の残りの{Math.round(share * 100)}%）
              </p>
              <button
                type="button"
                onClick={() => setUseAll((v) => !v)}
                aria-pressed={useAll}
                className={cn("min-h-8 rounded-lg px-2.5 text-xs font-bold", useAll ? "bg-plate-blue text-white" : "bg-rubber text-ash")}
              >
                残りすべてを使う
              </button>
            </div>
            {result ? (
              <p className="mt-1">
                <span className="num text-lg font-extrabold">{formatNutrient("energyKcal", result.budget.energyKcal)}</span>
                <span className="ml-0.5 text-xs text-ash">kcal</span>
                <MacroInline values={result.budget} className="ml-2" />
              </p>
            ) : (
              <p className="mt-1 text-xs text-ash">お店を選ぶと、残りに合う組み合わせを表示します。</p>
            )}
            {result?.light ? (
              <p className="mt-1.5 text-xs text-plate-yellow">残りが少ないため、軽めのもの（汁物・サラダ・たんぱく質の多いものなど）を出しています。</p>
            ) : null}
          </div>
        )}

        {error ? <Notice tone="error">{error}</Notice> : null}
        {loading ? <p className="py-6 text-center text-sm text-ash">読み込み中…</p> : null}

        {result && !loading ? (
          result.suggestions.length > 0 ? (
            <>
              {!result.suggestions.some((s) => s.fit === "within") ? (
                <Notice tone="info">
                  目標の範囲にぴったり収まる組み合わせはありませんでした。近い順に、超過・不足する量を表示しています。
                </Notice>
              ) : null}
              <ul className="space-y-3">
                {result.suggestions.map((suggestion) => (
                  <li key={suggestion.key}>
                    <SuggestionCard
                      suggestion={suggestion}
                      mealLabel={MEAL_TYPE_LABELS[mealType]}
                      adding={addingKey === suggestion.key}
                      added={addedKeys.has(suggestion.key)}
                      disabled={addingKey !== null}
                      onRecord={() => void record(suggestion)}
                    />
                  </li>
                ))}
              </ul>
              <p className="text-xs leading-relaxed text-ash">
                栄養値は各社の公式サイトの情報（確認日を表示）をもとにしています。地域・時期によって商品や内容が変わることがあります。価格は参考です。
              </p>
            </>
          ) : (
            <Notice tone="info">このお店の商品データでは、組み合わせを作れませんでした。</Notice>
          )
        ) : null}
      </div>
    </Sheet>
  );
}

function ChipGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs font-bold text-ash">{label}</p>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

function Chip({
  active,
  disabled,
  onClick,
  children,
  sub,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  sub?: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex min-h-11 flex-col items-center justify-center rounded-xl px-3 text-sm leading-tight font-bold disabled:opacity-40",
        active ? "bg-plate-blue text-white" : "bg-rubber text-chalk active:bg-line",
      )}
    >
      {children}
      {sub ? <span className={cn("text-[10px] font-normal", active ? "text-white/80" : "text-ash")}>{sub}</span> : null}
    </button>
  );
}

function SuggestionCard({
  suggestion,
  mealLabel,
  adding,
  added,
  disabled,
  onRecord,
}: {
  suggestion: Suggestion;
  mealLabel: string;
  adding: boolean;
  added: boolean;
  disabled: boolean;
  onRecord: () => void;
}) {
  const brand = suggestion.items[0]?.food.brand ?? "";
  const overKeys = NUTRIENT_KEYS.filter((key) => suggestion.dayOverBy[key] !== undefined);
  const offKeys = NUTRIENT_KEYS.filter((key) => suggestion.mealOff[key] !== undefined);
  const verifiedDates = suggestion.items.map((i) => i.food.verified_on).filter((d): d is string => Boolean(d)).sort();
  const latest = verifiedDates[verifiedDates.length - 1];

  return (
    <article className={cn("panel p-4", suggestion.fit === "within" && "border-plate-green/40")}>
      <div className="flex items-center justify-between gap-2">
        <span className={cn("rounded-full px-2.5 py-1 text-xs font-bold", FIT_STYLE[suggestion.fit])}>
          {SUGGESTION_FIT_LABELS[suggestion.fit]}
        </span>
        <span className="truncate text-xs text-ash">{brand}</span>
      </div>

      <ul className="mt-3 space-y-1.5">
        {suggestion.items.map((item) => (
          <li key={item.food.id} className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 text-[15px] leading-snug font-bold break-words">
              {item.food.name}
              {item.quantity > 1 ? <span className="ml-1 text-plate-blue-bright">×{item.quantity}</span> : null}
              <span className="ml-1.5 text-xs font-normal text-ash">{formatAmount(item.basis.unit, item.amount, item.food.serving_label)}</span>
            </span>
            <span className="num shrink-0 text-sm">
              {formatNutrient("energyKcal", item.nutrients.energyKcal)}
              <span className="text-[11px] text-ash">kcal</span>
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-2 rounded-xl bg-iron px-3 py-2.5">
        <p>
          <span className="text-xs text-ash">合計 </span>
          <span className="num text-xl font-extrabold">{formatNutrient("energyKcal", suggestion.totals.energyKcal)}</span>
          <span className="text-xs text-ash">kcal</span>
        </p>
        <MacroInline values={suggestion.totals} />
      </div>

      <dl className="mt-2.5 grid grid-cols-4 gap-1 text-center">
        {NUTRIENT_KEYS.map((key) => {
          const after = suggestion.afterRemaining[key];
          const over = after < 0;
          return (
            <div key={key} className="rounded-lg bg-rubber/60 px-1 py-1.5">
              <dt className="text-[10px] text-ash">
                食後の残り <span className={cn("font-bold", NUTRIENT_COLORS[key].text)}>{NUTRIENT_SHORT[key]}</span>
              </dt>
              <dd className={cn("num text-sm font-bold", over ? "text-plate-red-bright" : "text-chalk")}>
                {over ? "+" : ""}
                {formatNutrient(key, Math.abs(after))}
                <span className="text-[10px] font-normal">{over ? "超過" : key === "energyKcal" ? "" : "g"}</span>
              </dd>
            </div>
          );
        })}
      </dl>

      {overKeys.length > 0 ? (
        <p className="mt-2 text-xs font-bold text-plate-red-bright">
          1日の目標を超えます:{" "}
          {overKeys.map((key) => `${key === "energyKcal" ? "カロリー" : NUTRIENT_SHORT[key]} ${formatSignedNutrient(key, suggestion.dayOverBy[key] ?? 0)}`).join("、")}
        </p>
      ) : null}
      {offKeys.length > 0 ? (
        <p className="mt-1.5 text-xs text-ash">
          この食事の目安より:{" "}
          {offKeys
            .map(
              (key) =>
                `${key === "energyKcal" ? "カロリー" : NUTRIENT_SHORT[key]} ${formatSignedNutrient(key, suggestion.mealDiff[key])}（${suggestion.mealOff[key] === "over" ? "多め" : "少なめ"}）`,
            )
            .join("、")}
        </p>
      ) : null}

      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-ash">
        {suggestion.allVerified ? <VerificationBadge status="verified" /> : <VerificationBadge status="unverified" />}
        <span>
          {suggestion.allVerified ? "公式情報で確認済み" : "未確認のデータを含みます"}
          {latest ? `・${formatDateShort(latest)} 確認` : ""}
        </span>
        {suggestion.priceYen != null ? <span>・参考価格 ¥{suggestion.priceYen.toLocaleString("ja-JP")}</span> : null}
      </div>

      <details className="group mt-1.5 text-[11px] text-ash">
        <summary className="inline-flex min-h-8 cursor-pointer list-none items-center gap-1 font-bold select-none [&::-webkit-details-marker]:hidden">
          <IconChevronDown size={14} className="transition-transform group-open:rotate-180" />
          出典・注記を見る
        </summary>
        <ul className="mt-1 space-y-2 rounded-xl bg-iron px-3 py-2.5">
          {suggestion.items.map((item) => (
            <li key={item.food.id} className="leading-relaxed">
              <p className="font-bold text-chalk/85">{item.food.name}</p>
              {item.food.source_note ? <p>{item.food.source_note}</p> : null}
              <FoodPriceLine food={{ price_yen: item.food.price_yen, price_note: item.food.price_note ?? null }} />
              {item.food.source_url ? (
                <a
                  href={item.food.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 text-plate-blue-bright underline underline-offset-2"
                >
                  出典を開く
                  <IconExternal size={12} />
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      </details>

      <div className="mt-3">
        {added ? (
          <p className="flex min-h-12 items-center justify-center gap-1.5 rounded-xl bg-plate-green/15 text-sm font-bold text-plate-green-bright">
            <IconCheck size={18} />
            {mealLabel}に記録しました
          </p>
        ) : (
          <Button block loading={adding} disabled={disabled} onClick={onRecord}>
            この組み合わせを{mealLabel}に記録
          </Button>
        )}
      </div>
    </article>
  );
}
