import { IconExternal } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { formatDateShort } from "@/lib/dates";
import { SOURCE_TYPE_LABELS, VERIFICATION_LABELS, type FoodSourceType, type VerificationStatus } from "@/lib/nutrition/foods";
import type { FoodRow } from "@/types/app";

function isVerification(value: string): value is VerificationStatus {
  return value === "verified" || value === "unverified" || value === "sample";
}

function isSourceType(value: string): value is FoodSourceType {
  return value in SOURCE_TYPE_LABELS;
}

/** 商品データの確認状況（確認済み / 未確認 / サンプル） */
export function VerificationBadge({ status }: { status: string }) {
  const key = isVerification(status) ? status : "unverified";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-1.5 py-0.5 text-[10px] font-bold whitespace-nowrap",
        key === "verified" && "bg-plate-green/15 text-plate-green-bright",
        key === "unverified" && "bg-plate-yellow/15 text-plate-yellow",
        key === "sample" && "bg-plate-red/15 text-plate-red-bright",
      )}
    >
      {VERIFICATION_LABELS[key]}
    </span>
  );
}

/** 出典と確認日（例: 公式サイト・10/29 確認） */
export function FoodSourceLine({
  food,
  showLink = true,
  className,
}: {
  food: Pick<FoodRow, "source_type" | "source_url" | "verified_on" | "verification_status" | "availability">;
  showLink?: boolean;
  className?: string;
}) {
  const source = isSourceType(food.source_type) ? SOURCE_TYPE_LABELS[food.source_type] : food.source_type;
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-ash", className)}>
      <VerificationBadge status={food.verification_status} />
      <span>
        出典: {source}
        {food.verified_on ? `・${formatDateShort(food.verified_on)} 確認` : "・確認日なし"}
      </span>
      {food.availability === "needs_review" ? <span className="text-plate-yellow">情報の更新が必要</span> : null}
      {showLink && food.source_url ? (
        <a
          href={food.source_url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-plate-blue-bright underline underline-offset-2"
          onClick={(e) => e.stopPropagation()}
        >
          出典を開く
          <IconExternal size={12} />
        </a>
      ) : null}
    </span>
  );
}

/** 参考価格（公式ページに価格がある商品だけ。条件は price_note） */
export function FoodPriceLine({
  food,
  className,
}: {
  food: Pick<FoodRow, "price_yen" | "price_note">;
  className?: string;
}) {
  if (food.price_yen == null && !food.price_note) return null;
  return (
    <p className={className}>
      {food.price_yen != null ? `参考価格 ¥${food.price_yen.toLocaleString("ja-JP")}` : "価格"}
      {food.price_note ? (food.price_yen != null ? `（${food.price_note}）` : `: ${food.price_note}`) : ""}
    </p>
  );
}
