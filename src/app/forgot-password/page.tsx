import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "パスワードの再設定" };

export default function ForgotPasswordPage() {
  return (
    <AuthShell
      title="パスワードの再設定"
      lead="登録したメールアドレスに、再設定用のリンクを送ります。"
      footer={
        <Link href="/login" className="font-bold text-chalk underline underline-offset-4">
          ログイン画面に戻る
        </Link>
      }
    >
      <ForgotPasswordForm />
    </AuthShell>
  );
}
