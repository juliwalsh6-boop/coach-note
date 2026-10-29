"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { IconChevronRight } from "@/components/ui/icons";
import { cn } from "@/lib/cn";
import { markMealCommentsRead } from "@/lib/data/meal-comments";
import { formatDateShort, formatDateTime } from "@/lib/dates";
import { isMealType, MEAL_TYPE_LABELS } from "@/lib/nutrition/meal-types";
import { createClient } from "@/lib/supabase/client";
import type { MealCommentWithMeal } from "@/types/app";

/**
 * クライアント用: 食事へのコメント（食事ごとにまとめて表示）。
 * 開いたらトレーナーからのコメントを既読にする（NEW の表示はこの画面にいる間は残す）。
 */
export function MealCommentsFeed({ comments, clientId }: { comments: MealCommentWithMeal[]; clientId: string }) {
  const router = useRouter();
  const [newIds] = useState(
    () => new Set(comments.filter((c) => c.author_id !== clientId && c.read_at === null).map((c) => c.id)),
  );
  const [unreadMealIds] = useState(
    () => [...new Set(comments.filter((c) => c.author_id !== clientId && c.read_at === null).map((c) => c.meal_id))],
  );

  useEffect(() => {
    if (unreadMealIds.length === 0) return;
    let cancelled = false;
    markMealCommentsRead(createClient(), unreadMealIds)
      .then(() => {
        if (!cancelled) router.refresh();
      })
      .catch(() => {
        // 既読にできなくても表示には影響しない
      });
    return () => {
      cancelled = true;
    };
  }, [unreadMealIds, router]);

  // 食事ごとにまとめる（新しいやりとりのある食事から）
  const groups: { mealId: string; meal: MealCommentWithMeal["meal"]; comments: MealCommentWithMeal[] }[] = [];
  for (const comment of comments) {
    let group = groups.find((g) => g.mealId === comment.meal_id);
    if (!group) {
      group = { mealId: comment.meal_id, meal: comment.meal, comments: [] };
      groups.push(group);
    }
    group.comments.push(comment);
  }

  return (
    <ul className="space-y-3">
      {groups.map((group) => {
        const label = isMealType(group.meal.meal_type) ? MEAL_TYPE_LABELS[group.meal.meal_type] : "食事";
        const ordered = [...group.comments].sort((a, b) => a.created_at.localeCompare(b.created_at));
        return (
          <li key={group.mealId} className="panel p-4">
            <Link
              href={`/client/meals?date=${group.meal.eaten_on}#meal-${group.meal.meal_type}`}
              className="-mx-1 flex items-center justify-between gap-2 rounded-lg px-1 py-1 active:bg-rubber"
            >
              <span className="font-bold">
                {formatDateShort(group.meal.eaten_on)} の{label}
              </span>
              <span className="flex shrink-0 items-center text-sm text-ash">
                記録を見る・返信
                <IconChevronRight size={16} />
              </span>
            </Link>
            <ul className="mt-2 space-y-2">
              {ordered.map((comment) => {
                const mine = comment.author_id === clientId;
                return (
                  <li key={comment.id} className={cn("rounded-2xl px-3.5 py-2.5", mine ? "bg-plate-blue/15" : "bg-rubber")}>
                    <p className="flex flex-wrap items-center gap-2 text-[11px] text-ash">
                      {newIds.has(comment.id) ? (
                        <span className="rounded-full bg-plate-blue px-1.5 py-px font-bold text-white">NEW</span>
                      ) : null}
                      <span className="font-bold">{mine ? "あなた" : "トレーナー"}</span>
                      <time dateTime={comment.created_at}>{formatDateTime(comment.created_at)}</time>
                    </p>
                    <p className="mt-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{comment.body}</p>
                  </li>
                );
              })}
            </ul>
          </li>
        );
      })}
    </ul>
  );
}
