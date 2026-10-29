"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconTrash } from "@/components/ui/icons";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { cn } from "@/lib/cn";
import { createMealComment, deleteMealComment } from "@/lib/data/meal-comments";
import type { DB } from "@/lib/data/db";
import { formatDateTime } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import type { MealComment } from "@/types/app";

const MAX_LENGTH = 1000;

/**
 * 食事へのコメント（トレーナー ⇄ クライアント）。
 * 自分のコメントは右、相手のコメントは左に表示する。自分のコメントは削除できる。
 */
export function MealCommentThread({
  db,
  comments,
  viewerId,
  clientId,
  mealId,
  otherLabel,
  canWrite,
  composerLabel,
  placeholder,
  onChanged,
}: {
  db: DB;
  comments: MealComment[];
  viewerId: string;
  clientId: string;
  mealId: string;
  /** 相手の表示名（トレーナー / クライアント名） */
  otherLabel: string;
  canWrite: boolean;
  composerLabel: string;
  placeholder: string;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const confirm = useConfirm();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const trimmed = body.trim();

  async function send() {
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await createMealComment(db, { mealId, clientId, authorId: viewerId, body: trimmed });
      setBody("");
      toast("コメントを送りました", "success");
      onChanged();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setSending(false);
    }
  }

  async function remove(comment: MealComment) {
    const ok = await confirm({ title: "このコメントを削除しますか？", message: "相手の画面からも消えます。", confirmLabel: "削除", tone: "danger" });
    if (!ok) return;
    setDeletingId(comment.id);
    try {
      await deleteMealComment(db, comment.id);
      onChanged();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-2.5">
      {comments.length > 0 ? (
        <ul className="space-y-2">
          {comments.map((comment) => {
            const mine = comment.author_id === viewerId;
            const unreadForMe = !mine && comment.read_at === null;
            return (
              <li key={comment.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                <div
                  className={cn(
                    "max-w-[88%] rounded-2xl px-3.5 py-2.5",
                    mine ? "rounded-br-md bg-plate-blue/20" : "rounded-bl-md bg-rubber",
                  )}
                >
                  <p className="flex flex-wrap items-center gap-x-2 text-[11px] text-ash">
                    {unreadForMe ? <span className="rounded-full bg-plate-blue px-1.5 py-px font-bold text-white">NEW</span> : null}
                    <span className="font-bold">{mine ? "あなた" : otherLabel}</span>
                    <time dateTime={comment.created_at}>{formatDateTime(comment.created_at)}</time>
                    {mine && comment.read_at ? <span className="text-plate-green-bright">既読</span> : null}
                  </p>
                  <p className="mt-1 text-[15px] leading-relaxed break-words whitespace-pre-wrap">{comment.body}</p>
                  {mine ? (
                    <div className="mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={() => void remove(comment)}
                        disabled={deletingId === comment.id}
                        className="flex min-h-8 items-center gap-1 rounded-lg px-1.5 text-xs text-ash active:bg-line disabled:opacity-50"
                        aria-label="コメントを削除"
                      >
                        <IconTrash size={14} />
                        削除
                      </button>
                    </div>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {canWrite ? (
        <form
          className="flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">{composerLabel}</span>
            <textarea
              className="field scroll-mt-focus min-h-[48px] resize-none py-2.5 text-[15px]"
              rows={1}
              maxLength={MAX_LENGTH}
              placeholder={placeholder}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onInput={(e) => {
                // 入力に合わせて高さを伸ばす（最大 5 行程度）
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
              }}
            />
          </label>
          <Button type="submit" loading={sending} disabled={!trimmed} className="min-h-12">
            送信
          </Button>
        </form>
      ) : null}
    </div>
  );
}
