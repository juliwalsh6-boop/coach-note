import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/login-form";
import { safeNextPath } from "@/lib/navigation";

export const metadata: Metadata = { title: "ログイン" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? safeNextPath(params.next) : null;

  return (
    <AuthShell
      title="ログイン"
      lead="トレーナー・クライアント共通のログイン画面です。"
      footer={
        <>
          トレーナーとして使い始める方は{" "}
          <Link href="/signup" className="font-bold text-chalk underline underline-offset-4">
            新規登録
          </Link>
          <br />
          <span className="mt-2 inline-block">クライアントの方は、トレーナーから届いた招待リンクから登録してください。</span>
        </>
      }
    >
      <LoginForm next={next} />
    </AuthShell>
  );
}
