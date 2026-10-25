"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { markCommentsRead } from "@/lib/data/comments";
import { createClient } from "@/lib/supabase/client";
import type { TrainerComment } from "@/types/app";
import { CommentBubble } from "./comment-bubble";

/** クライアント用: コメント一覧。開いたら既読にする（NEW 表示はこの画面にいる間は残す） */
export function ClientCommentsFeed({ comments }: { comments: TrainerComment[] }) {
  const router = useRouter();
  const [newIds] = useState(() => new Set(comments.filter((c) => c.read_at === null).map((c) => c.id)));

  useEffect(() => {
    if (newIds.size === 0) return;
    let cancelled = false;
    markCommentsRead(createClient())
      .then(() => {
        if (!cancelled) router.refresh();
      })
      .catch(() => {
        // 既読にできなくても表示には影響しない
      });
    return () => {
      cancelled = true;
    };
  }, [newIds, router]);

  return (
    <div className="space-y-3">
      {comments.map((comment) => (
        <CommentBubble
          key={comment.id}
          comment={comment}
          isNew={newIds.has(comment.id)}
          sessionHref={comment.session_id ? `/client/history/${comment.session_id}` : null}
        />
      ))}
    </div>
  );
}
