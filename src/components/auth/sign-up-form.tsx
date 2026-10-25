"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Notice } from "@/components/ui/notice";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import type { AppRole } from "@/types/app";

type SignUpFormProps = {
  role: AppRole;
  /** クライアント登録時の招待コード */
  inviteCode?: string;
  submitLabel: string;
};

const MIN_PASSWORD_LENGTH = 8;

export function SignUpForm({ role, inviteCode, submitLabel }: SignUpFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const home = role === "trainer" ? "/trainer" : "/client";

  async function submit() {
    const name = displayName.trim();
    if (!name) {
      setError("表示名を入力してください。");
      return;
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`パスワードは${MIN_PASSWORD_LENGTH}文字以上にしてください。`);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const supabase = createClient();
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            display_name: name,
            app_role: role,
            ...(inviteCode ? { invite_code: inviteCode } : {}),
          },
          emailRedirectTo: `${window.location.origin}/auth/confirm?next=${encodeURIComponent(home)}`,
        },
      });
      if (signUpError) {
        setError(toErrorMessage(signUpError));
        setLoading(false);
        return;
      }
      if (data.session) {
        // メール確認なしの設定なら、そのままログイン状態になる
        router.replace(home);
        router.refresh();
        return;
      }
      setSentTo(email.trim());
      setLoading(false);
    } catch (e) {
      setError(toErrorMessage(e));
      setLoading(false);
    }
  }

  if (sentTo) {
    return (
      <Notice tone="success">
        <p className="font-bold">確認メールを送りました</p>
        <p className="mt-1">
          {sentTo} に届いたメールのリンクを開くと登録が完了します。メールが届かない場合は迷惑メールフォルダも確認してください。
        </p>
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
      <FormField label="表示名" hint={role === "trainer" ? "クライアントの画面に表示されます" : "トレーナーの画面に表示されます"}>
        {(props) => (
          <input
            {...props}
            className="field"
            type="text"
            autoComplete="name"
            maxLength={40}
            required
            placeholder="例: 田中 太郎"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
          />
        )}
      </FormField>
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
      <FormField label="パスワード" hint={`${MIN_PASSWORD_LENGTH}文字以上`}>
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
        {submitLabel}
      </Button>
    </form>
  );
}
