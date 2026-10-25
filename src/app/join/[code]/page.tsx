import type { Metadata } from "next";
import Link from "next/link";
import { AcceptInviteButton } from "@/components/auth/accept-invite-button";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { SignUpForm } from "@/components/auth/sign-up-form";
import { LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { getSession } from "@/lib/auth";
import { getInviteInfo } from "@/lib/data/trainer";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "招待" };

function safeDecode(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export default async function JoinPage({ params }: { params: Promise<{ code: string }> }) {
  const { code: rawCode } = await params;
  const code = safeDecode(rawCode).trim().toUpperCase();

  const supabase = await createClient();
  const [invite, session] = await Promise.all([getInviteInfo(supabase, code), getSession()]);

  if (!invite) {
    return (
      <AuthShell title="招待リンクが見つかりません" lead="リンクが途中で切れていないか確認してください。">
        <LinkButton href="/login" size="lg" block variant="secondary">
          ログイン画面へ
        </LinkButton>
      </AuthShell>
    );
  }

  if (invite.status !== "valid") {
    return (
      <AuthShell
        title={invite.status === "used" ? "この招待リンクは使用済みです" : "招待リンクの期限が切れています"}
        lead={`${invite.trainerName}さんに、新しい招待リンクを発行してもらってください。`}
      >
        <LinkButton href="/login" size="lg" block variant="secondary">
          ログイン画面へ
        </LinkButton>
      </AuthShell>
    );
  }

  const trainerName = invite.trainerName;

  if (session?.profile?.role === "trainer") {
    return (
      <AuthShell
        title="トレーナーのアカウントでログイン中です"
        lead={`${trainerName}さんからの招待は、クライアント用のアカウントで受け取ります。ログアウトしてから、もう一度このリンクを開いてください。`}
      >
        <SignOutButton variant="secondary" />
      </AuthShell>
    );
  }

  if (session?.profile?.role === "client") {
    return (
      <AuthShell
        title={`${trainerName}さんからの招待`}
        lead={`${session.profile.display_name}さんのアカウントで、${trainerName}さんとつながります。トレーナーはあなたのトレーニング記録と毎朝のコンディションを見られるようになります。`}
      >
        <AcceptInviteButton code={code} trainerName={trainerName} />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={`${trainerName}さんからの招待`}
      lead="アカウントを作ると、トレーナーが作ったメニューで記録をつけられます。トレーナーはあなたのトレーニング記録と毎朝のコンディションを見られるようになります。"
      footer={
        <>
          すでにアカウントをお持ちの方は{" "}
          <Link
            href={`/login?next=${encodeURIComponent(`/join/${code}`)}`}
            className="font-bold text-chalk underline underline-offset-4"
          >
            ログインしてつながる
          </Link>
        </>
      }
    >
      <div className="space-y-5">
        <Notice>
          招待コード <span className="num font-bold tracking-wider">{code}</span>
        </Notice>
        <SignUpForm role="client" inviteCode={code} submitLabel="登録して始める" />
      </div>
    </AuthShell>
  );
}
