"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { useToast } from "@/components/ui/toaster";
import { unlockAudio } from "@/lib/audio/cues";
import { startSession } from "@/lib/data/sessions";
import { todayISO } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

/** メニューからトレーニングを開始（ワンタップ） */
export function StartWorkoutButton({
  planId,
  label = "スタート",
  variant = "primary",
}: {
  planId: string;
  label?: string;
  variant?: ButtonVariant;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function start() {
    // このタップで音を鳴らせる状態にしておく（iPhone 対策）
    unlockAudio();
    setLoading(true);
    try {
      const sessionId = await startSession(createClient(), planId, todayISO());
      router.push(`/client/workout/${sessionId}`);
    } catch (e) {
      toast(toErrorMessage(e), "error");
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} size="lg" block loading={loading} onClick={() => void start()}>
      {label}
    </Button>
  );
}
