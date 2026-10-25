"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const { error: resetError } = await createClient().auth.resetPasswordForEmail(email.trim(), {
        redirectTo: `${window.location.origin}/auth/confirm?next=/auth/update-password`,
      });
      if (resetError) throw resetError;
      setSent(true);
    } catch (e) {
      setError(toErrorMessage(e));
    } finally {
      setLoading(false);
    }
  }

  if (sent) {
    return (
      <Notice tone="success">
        パスワード再設定用のメールを送りました。メール内のリンクを、この端末のこのブラウザで開いてください。
      </Notice>
    );
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
      <FormField label="登録したメールアドレス">
        {(props) => (
          <input
            {...props}
            className="field"
            type="email"
            inputMode="email"
            autoComplete="email"
            autoCapitalize="none"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" size="lg" block loading={loading}>
        再設定メールを送る
      </Button>
    </form>
  );
}
