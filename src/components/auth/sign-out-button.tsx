"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { IconLogout } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toaster";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export function SignOutButton({ variant = "secondary" }: { variant?: ButtonVariant }) {
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);

  async function signOut() {
    setLoading(true);
    try {
      const { error } = await createClient().auth.signOut();
      if (error) throw error;
      router.replace("/login");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
      setLoading(false);
    }
  }

  return (
    <Button variant={variant} size="lg" block loading={loading} onClick={() => void signOut()}>
      {loading ? null : <IconLogout size={20} />}
      ログアウト
    </Button>
  );
}
