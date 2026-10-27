"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { removeClient } from "@/lib/data/trainer";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

/** クライアントを削除する（担当から外す）。相手のアカウントと記録は残る */
export function RemoveClientButton({ clientId, clientName }: { clientId: string; clientName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [removing, setRemoving] = useState(false);

  async function remove() {
    const ok = await confirm({
      title: `${clientName}さんを削除しますか？`,
      message:
        "クライアント一覧から外れ、記録や体調が見えなくなります。作ったメニューも相手の画面に出なくなります。相手のアカウントとトレーニング記録は残るので、もう一度招待すれば元に戻せます。",
      confirmLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    setRemoving(true);
    try {
      await removeClient(createClient(), clientId);
      toast(`${clientName}さんを削除しました`, "success");
      router.push("/trainer");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
      setRemoving(false);
    }
  }

  return (
    <Button variant="danger" block loading={removing} onClick={() => void remove()}>
      クライアントを削除
    </Button>
  );
}
