"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconTrash } from "@/components/ui/icons";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { deleteComment } from "@/lib/data/comments";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import type { TrainerComment } from "@/types/app";
import { CommentBubble } from "./comment-bubble";

/** トレーナー用: 送ったコメントの一覧（既読状況・削除） */
export function TrainerCommentList({
  comments,
  clientId,
  showSessionLink = true,
}: {
  comments: TrainerComment[];
  clientId: string;
  showSessionLink?: boolean;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function remove(id: string) {
    const ok = await confirm({
      title: "このコメントを削除しますか？",
      message: "クライアントの画面からも消えます。",
      confirmLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(id);
    try {
      await deleteComment(createClient(), id);
      toast("コメントを削除しました", "success");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <CommentBubble
          key={comment.id}
          comment={comment}
          sessionHref={
            showSessionLink && comment.session_id ? `/trainer/clients/${clientId}/sessions/${comment.session_id}` : null
          }
          footer={
            <div className="flex items-center justify-between">
              <span className={comment.read_at ? "text-xs text-plate-green-bright" : "text-xs text-ash"}>
                {comment.read_at ? "既読" : "未読"}
              </span>
              <Button
                variant="ghost"
                size="sm"
                loading={deletingId === comment.id}
                onClick={() => void remove(comment.id)}
                aria-label="コメントを削除"
              >
                {deletingId === comment.id ? null : <IconTrash size={16} />}
                削除
              </Button>
            </div>
          }
        />
      ))}
    </div>
  );
}
