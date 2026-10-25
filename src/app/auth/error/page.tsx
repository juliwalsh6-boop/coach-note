import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { LinkButton } from "@/components/ui/button";

export const metadata: Metadata = { title: "エラー" };

const MESSAGES: Record<string, { title: string; body: string }> = {
  link: {
    title: "リンクを確認できませんでした",
    body: "リンクの有効期限が切れているか、すでに使われています。メールを送った端末・ブラウザと同じもので開いているかも確認してください。ログインできる場合は、そのままログインしてください。",
  },
  profile: {
    title: "プロフィールが見つかりません",
    body: "データベースの準備（SQL の実行）より前に作られたアカウントの可能性があります。一度ログアウトして、新しく登録し直してください。",
  },
};

export default async function AuthErrorPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { reason } = await searchParams;
  const message = (typeof reason === "string" ? MESSAGES[reason] : undefined) ?? MESSAGES.link!;

  return (
    <AuthShell title={message.title} lead={message.body}>
      <div className="flex flex-col gap-3">
        <LinkButton href="/login" size="lg" block>
          ログイン画面へ
        </LinkButton>
        {reason === "profile" ? <SignOutButton variant="secondary" /> : null}
      </div>
    </AuthShell>
  );
}
