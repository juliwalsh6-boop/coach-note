"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { createComment } from "@/lib/data/comments";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

const MAX_LENGTH = 2000;

/** トレーナーがクライアントにコメントを送る */
export function CommentComposer({
  trainerId,
  clientId,
  sessionId = null,
  placeholder = "例: 今日は3セット目でRPE高かったので、次回は75kgでいきましょう。",
}: {
  trainerId: string;
  clientId: string;
  sessionId?: string | null;
  placeholder?: string;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const trimmed = body.trim();

  async function send() {
    if (!trimmed) return;
    setSending(true);
    try {
      await createComment(createClient(), { trainerId, clientId, sessionId, body: trimmed });
      setBody("");
      toast("コメントを送りました", "success");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setSending(false);
    }
  }

  return (
    <form
      className="panel space-y-3 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <label htmlFor="comment-body" className="text-sm font-bold">
        {sessionId ? "このトレーニングにコメント" : "コメントを送る"}
      </label>
      <textarea
        id="comment-body"
        className="field min-h-[96px] resize-none"
        rows={3}
        maxLength={MAX_LENGTH}
        placeholder={placeholder}
        value={body}
        onChange={(e) => setBody(e.target.value)}
      />
      <Button type="submit" block loading={sending} disabled={!trimmed}>
        送信する
      </Button>
    </form>
  );
}
