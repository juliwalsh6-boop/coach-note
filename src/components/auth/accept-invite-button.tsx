"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toaster";
import { acceptInvite } from "@/lib/data/trainer";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

/** ログイン済みのクライアントが招待を受け入れる */
export function AcceptInviteButton({ code, trainerName }: { code: string; trainerName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function accept() {
    setLoading(true);
    setError(null);
    try {
      await acceptInvite(createClient(), code);
      toast(`${trainerName}さんとつながりました`, "success");
      router.replace("/client");
      router.refresh();
    } catch (e) {
      setError(toErrorMessage(e));
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      {error ? <Notice tone="error">{error}</Notice> : null}
      <Button size="lg" block loading={loading} onClick={() => void accept()}>
        {trainerName}さんとつながる
      </Button>
    </div>
  );
}
