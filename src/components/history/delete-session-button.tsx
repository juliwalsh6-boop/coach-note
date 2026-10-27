"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { deleteSession } from "@/lib/data/sessions";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

type DeleteSessionButtonProps = {
  sessionId: string;
  /** 確認画面に出す「10月26日(月)の『胸・肩・三頭』」 */
  description: string;
  /** 削除したことが相手の画面にも反映されることを伝える相手（トレーナー / クライアント） */
  counterpart: "トレーナー" | "クライアント";
  /** 削除後に開く画面 */
  redirectHref: string;
};

/** トレーニング記録の削除ボタン（確認してから削除し、一覧に戻る） */
export function DeleteSessionButton({ sessionId, description, counterpart, redirectHref }: DeleteSessionButtonProps) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [deleting, setDeleting] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: "この記録を削除しますか？",
      message: `${description}の記録（セットの重量・回数）を削除します。${counterpart}の画面からも消え、元に戻せません。`,
      confirmLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    setDeleting(true);
    try {
      await deleteSession(createClient(), sessionId);
      toast("記録を削除しました", "success");
      router.push(redirectHref);
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
      setDeleting(false);
    }
  }

  return (
    <Button variant="danger" block loading={deleting} onClick={() => void remove()}>
      この記録を削除
    </Button>
  );
}
