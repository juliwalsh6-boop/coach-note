import type { TrainerComment } from "@/types/app";
import type { DB } from "./db";

export async function listComments(db: DB, clientId: string, limit = 50): Promise<TrainerComment[]> {
  const { data, error } = await db
    .from("trainer_comments")
    .select("*")
    .eq("client_id", clientId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data ?? [];
}

export async function listSessionComments(db: DB, sessionId: string): Promise<TrainerComment[]> {
  const { data, error } = await db
    .from("trainer_comments")
    .select("*")
    .eq("session_id", sessionId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function countUnreadComments(db: DB, clientId: string): Promise<number> {
  const { count, error } = await db
    .from("trainer_comments")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .is("read_at", null);
  if (error) throw error;
  return count ?? 0;
}

export type CommentInput = {
  trainerId: string;
  clientId: string;
  sessionId: string | null;
  body: string;
};

export async function createComment(db: DB, input: CommentInput): Promise<TrainerComment> {
  const { data, error } = await db
    .from("trainer_comments")
    .insert({
      trainer_id: input.trainerId,
      client_id: input.clientId,
      session_id: input.sessionId,
      body: input.body,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteComment(db: DB, commentId: string): Promise<void> {
  const { error } = await db.from("trainer_comments").delete().eq("id", commentId);
  if (error) throw error;
}

export async function markCommentsRead(db: DB): Promise<number> {
  const { data, error } = await db.rpc("mark_comments_read");
  if (error) throw error;
  return data ?? 0;
}
