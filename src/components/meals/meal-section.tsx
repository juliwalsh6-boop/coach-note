import { IconCopy, IconPlus } from "@/components/ui/icons";
import { formatNutrient } from "@/lib/nutrition/format";
import { MEAL_TYPE_LABELS, type MealType } from "@/lib/nutrition/meal-types";
import { mealTotals } from "@/lib/nutrition/rows";
import type { MealItem, MealPhoto, MealWithDetails } from "@/types/app";
import { MealItemRow } from "./meal-item-row";
import { MealPhotosStrip } from "./meal-photos-strip";
import { MacroInline } from "./nutrition-summary";

/** 朝食・昼食・夕食・間食のいずれか 1 つ（食べたもの・写真・コメント・合計） */
export function MealSection({
  mealType,
  meal,
  photoUrls,
  onPhotoError,
  onAdd,
  onEditItem,
  onCopy,
  onDeletePhoto,
  comments,
  emptyText = "まだ記録がありません",
  showAiDetail = false,
}: {
  mealType: MealType;
  meal: MealWithDetails | null;
  photoUrls: Record<string, string>;
  onPhotoError: () => void;
  /** クライアント本人の画面だけ */
  onAdd?: (mealType: MealType) => void;
  onEditItem?: (item: MealItem) => void;
  onCopy?: (meal: MealWithDetails) => void;
  onDeletePhoto?: (photo: MealPhoto) => Promise<void>;
  /** コメント欄（呼び出し側で組み立てる） */
  comments?: React.ReactNode;
  emptyText?: string;
  /** AI の推定値・確度も出す（トレーナーの画面） */
  showAiDetail?: boolean;
}) {
  const label = MEAL_TYPE_LABELS[mealType];
  const items = meal?.items ?? [];
  const photos = meal?.photos ?? [];
  const hasContent = items.length > 0 || photos.length > 0;
  const totals = meal ? mealTotals(meal) : null;

  return (
    <section id={`meal-${mealType}`} className="panel scroll-mt-4 p-4" aria-label={label}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[17px] font-bold">{label}</h3>
          {totals && items.length > 0 ? (
            <p className="mt-0.5 flex flex-wrap items-baseline gap-x-2">
              <span className="num text-sm font-bold">
                {formatNutrient("energyKcal", totals.energyKcal)}
                <span className="ml-0.5 font-sans text-[11px] font-normal text-ash">kcal</span>
              </span>
              <MacroInline values={totals} />
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-ash">{photos.length > 0 ? "写真のみ（食べたものは未入力）" : emptyText}</p>
          )}
        </div>
        {onAdd ? (
          <button
            type="button"
            onClick={() => onAdd(mealType)}
            className="flex min-h-11 shrink-0 items-center gap-1 rounded-xl bg-rubber px-3 text-sm font-bold text-chalk active:bg-line"
            aria-label={`${label}に追加`}
          >
            <IconPlus size={18} />
            追加
          </button>
        ) : null}
      </div>

      {photos.length > 0 ? (
        <div className="mt-3">
          <MealPhotosStrip photos={photos} urls={photoUrls} onLoadError={onPhotoError} onDelete={onDeletePhoto} label={label} />
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="mt-1 divide-y divide-line">
          {items.map((item) => (
            <li key={item.id}>
              <MealItemRow item={item} onEdit={onEditItem} showAiDetail={showAiDetail} />
            </li>
          ))}
        </ul>
      ) : null}

      {meal && onCopy && items.length > 0 ? (
        <div className="mt-2 flex justify-end">
          <button
            type="button"
            onClick={() => onCopy(meal)}
            className="flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm text-ash active:bg-rubber"
          >
            <IconCopy size={16} />
            この{label}をもう一度記録
          </button>
        </div>
      ) : null}

      {comments ? <div className={hasContent ? "mt-3 border-t border-line pt-3" : "mt-3"}>{comments}</div> : null}
    </section>
  );
}
