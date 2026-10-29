import { cn } from "@/lib/cn";
import { formatAmount } from "@/lib/nutrition/foods";
import { formatNutrient } from "@/lib/nutrition/format";
import { itemNutrients, itemUnit } from "@/lib/nutrition/rows";
import type { MealItem } from "@/types/app";
import { MacroInline } from "./nutrition-summary";

/** 入力元のバッジ（AI 推定 / AI から修正 / 商品データ / 過去の食事 / 手入力） */
export function ItemOriginBadge({ item }: { item: Pick<MealItem, "origin" | "ai_adjusted" | "food_id"> }) {
  if (item.origin === "ai_photo") {
    return item.ai_adjusted ? (
      <span className="rounded-md bg-plate-blue/15 px-1.5 py-0.5 text-[10px] font-bold text-plate-blue-bright">AI推定を修正</span>
    ) : (
      <span className="rounded-md bg-plate-yellow/15 px-1.5 py-0.5 text-[10px] font-bold text-plate-yellow">AI推定</span>
    );
  }
  if (item.origin === "food") {
    return <span className="rounded-md bg-rubber px-1.5 py-0.5 text-[10px] font-bold text-ash">商品データ</span>;
  }
  if (item.origin === "reuse") {
    return <span className="rounded-md bg-rubber px-1.5 py-0.5 text-[10px] font-bold text-ash">過去の食事から</span>;
  }
  return <span className="rounded-md bg-rubber px-1.5 py-0.5 text-[10px] font-bold text-ash">手入力</span>;
}

export function itemAmountText(item: Pick<MealItem, "unit" | "amount" | "serving_label" | "weight_g">): string {
  const unit = itemUnit(item);
  const amount = formatAmount(unit, Number(item.amount), item.serving_label);
  if (unit === "serving" && item.weight_g != null) return `${amount}（${Number(item.weight_g)}g）`;
  return amount;
}

/** 食べたもの 1 品（タップで編集できる場合はボタン） */
export function MealItemRow({ item, onEdit }: { item: MealItem; onEdit?: (item: MealItem) => void }) {
  const values = itemNutrients(item);
  const content = (
    <>
      <div className="min-w-0 flex-1">
        <p className="leading-snug font-bold break-words">{item.name}</p>
        <p className="mt-0.5 text-xs text-ash">
          {item.brand ? <span>{item.brand} · </span> : null}
          {itemAmountText(item)}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          <ItemOriginBadge item={item} />
        </div>
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-[17px] leading-tight font-bold">
          {formatNutrient("energyKcal", values.energyKcal)}
          <span className="ml-0.5 font-sans text-[11px] font-normal text-ash">kcal</span>
        </p>
        <MacroInline values={values} className="mt-1 justify-end" />
      </div>
    </>
  );

  if (!onEdit) {
    return <div className="flex items-start gap-3 py-3">{content}</div>;
  }
  return (
    <button
      type="button"
      onClick={() => onEdit(item)}
      className={cn("-mx-2 flex w-[calc(100%+16px)] items-start gap-3 rounded-xl px-2 py-3 text-left active:bg-rubber")}
      aria-label={`${item.name}を編集`}
    >
      {content}
    </button>
  );
}
