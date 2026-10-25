import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/sign-up-form";

export const metadata: Metadata = { title: "トレーナー登録" };

export default function SignUpPage() {
  return (
    <AuthShell
      title="トレーナー登録"
      lead={
        <>
          クライアントにメニューを渡し、記録とコンディションを確認するためのアカウントです。
          <br />
          クライアントの方は、トレーナーから届いた招待リンクから登録してください。
        </>
      }
      footer={
        <>
          アカウントをお持ちの方は{" "}
          <Link href="/login" className="font-bold text-chalk underline underline-offset-4">
            ログイン
          </Link>
        </>
      }
    >
      <SignUpForm role="trainer" submitLabel="トレーナーとして登録" />
    </AuthShell>
  );
}
