import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommentBubble } from "@/components/comments/comment-bubble";
import { DeleteSessionButton } from "@/components/history/delete-session-button";
import { SessionView } from "@/components/history/session-view";
import { LinkButton } from "@/components/ui/button";
import { Notice } from "@/components/ui/notice";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { listSessionComments } from "@/lib/data/comments";
import { getSessionDetail } from "@/lib/data/sessions";
import { formatDateLong } from "@/lib/dates";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "トレーニング記録" };

export default async function ClientSessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ sessionId }, { done }] = await Promise.all([params, searchParams]);
  if (!isUuid(sessionId)) notFound();

  const { supabase, userId } = await requireRole("client");
  const [session, comments] = await Promise.all([
    getSessionDetail(supabase, sessionId),
    listSessionComments(supabase, sessionId),
  ]);
  if (!session || session.client_id !== userId) notFound();

  return (
    <>
      <PageHeader title="トレーニング記録" backHref="/client/history" backLabel="履歴" />
      <div className="space-y-6">
        {done === "1" ? (
          <Notice tone="success">
            <p className="font-bold">お疲れさまでした。トレーニングを記録しました。</p>
            <p className="mt-1">トレーナーにも結果が共有されています。</p>
          </Notice>
        ) : null}

        <SessionView session={session} />

        {comments.length > 0 ? (
          <section>
            <SectionTitle>トレーナーからのコメント</SectionTitle>
            <div className="space-y-3">
              {comments.map((comment) => (
                <CommentBubble key={comment.id} comment={comment} />
              ))}
            </div>
          </section>
        ) : null}

        <div className="flex flex-col gap-3">
          <LinkButton href={`/client/workout/${session.id}`} variant="secondary" size="lg" block>
            {session.status === "completed" ? "記録を修正する" : "続きから再開"}
          </LinkButton>
          {done === "1" ? (
            <LinkButton href="/client" size="lg" block>
              ホームに戻る
            </LinkButton>
          ) : null}
        </div>

        <div className="border-t border-line pt-6">
          <DeleteSessionButton
            sessionId={session.id}
            description={`${formatDateLong(session.performed_date)}の「${session.title}」`}
            counterpart="トレーナー"
            redirectHref="/client/history"
          />
        </div>
      </div>
    </>
  );
}
