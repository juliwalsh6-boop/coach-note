"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { toErrorMessage } from "@/lib/errors";
import { safeNextPath } from "@/lib/navigation";
import { createClient } from "@/lib/supabase/client";

export function LoginForm({ next }: { next: string | null }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit() {
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInError) {
        setError(toErrorMessage(signInError));
        setLoading(false);
        return;
      }
      router.replace(safeNextPath(next) ?? "/");
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
      <FormField label="メールアドレス">
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
      <FormField label="パスワード">
        {(props) => (
          <input
            {...props}
            className="field"
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" size="lg" block loading={loading}>
        ログイン
      </Button>
      <p className="text-center text-sm">
        <Link href="/forgot-password" className="text-ash underline underline-offset-4">
          パスワードを忘れた場合
        </Link>
      </p>
    </form>
  );
}
