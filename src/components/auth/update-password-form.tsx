"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { useToast } from "@/components/ui/toaster";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

const MIN_PASSWORD_LENGTH = 8;

export function UpdatePasswordForm() {
  const router = useRouter();
  const { toast } = useToast();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { error: updateError } = await createClient().auth.updateUser({ password });
      if (updateError) throw updateError;
      toast("パスワードを変更しました", "success");
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(toErrorMessage(e));
      setLoading(false);
    }
  }

  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      {error ? <Notice tone="error">{error}</Notice> : null}
      <FormField label="新しいパスワード" hint={`${MIN_PASSWORD_LENGTH}文字以上`}>
        {(props) => (
          <input
            {...props}
            className="field"
            type="password"
            autoComplete="new-password"
            minLength={MIN_PASSWORD_LENGTH}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" size="lg" block loading={loading}>
        パスワードを変更する
      </Button>
    </form>
  );
}
