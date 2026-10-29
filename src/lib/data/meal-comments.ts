import type { MealComment, MealCommentWithMeal } from "@/types/app";
import type { DB } from "./db";

export async function createMealComment(
  db: DB,
  input: { mealId: string; clientId: string; authorId: string; body: string },
): Promise<MealComment> {
  const { data, error } = await db
    .from("meal_comments")
    .insert({ meal_id: input.mealId, client_id: input.clientId, author_id: input.authorId, body: input.body })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteMealComment(db: DB, commentId: string): Promise<void> {
  const { data, error } = await db.from("meal_comments").delete().eq("id", commentId).select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new Error("meal_not_found");
}

/** 表示した食事のコメントのうち、自分宛て（相手が書いたもの）を既読にする */
export async function markMealCommentsRead(db: DB, mealIds: string[]): Promise<number> {
  if (mealIds.length === 0) return 0;
  const { data, error } = await db.rpc("mark_meal_comments_read", { p_meal_ids: mealIds });
  if (error) throw error;
  return data ?? 0;
}

/** クライアント: トレーナーからの未読の食事コメント数 */
export async function countUnreadMealCommentsForClient(db: DB, clientId: string): Promise<number> {
  const { count, error } = await db
    .from("meal_comments")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .neq("author_id", clientId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

/**
 * 食事へのコメント（新しい順・食事の日付と区分つき）。
 * クライアントのコメント画面で、トレーナーとのやりとりを一覧するために使う。
 */
export async function listMealCommentsForClient(db: DB, clientId: string, limit = 50): Promise<MealCommentWithMeal[]> {
  const { data: comments, error } = await db
    .from("meal_comments")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  if (!comments || comments.length === 0) return [];

  const mealIds = [...new Set(comments.map((c) => c.meal_id))];
  const { data: meals, error: mealError } = await db
    .from("meals")
    .select("id, eaten_on, meal_type")
    .in("id", mealIds);
  if (mealError) throw mealError;
  const byId = new Map((meals ?? []).map((m) => [m.id, m]));

  return comments.flatMap((comment) => {
    const meal = byId.get(comment.meal_id);
    return meal ? [{ ...comment, meal }] : [];
  });
}
