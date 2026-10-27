import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CommentComposer } from "@/components/comments/comment-composer";
import { TrainerCommentList } from "@/components/comments/trainer-comment-list";
import { DeleteSessionButton } from "@/components/history/delete-session-button";
import { SessionView } from "@/components/history/session-view";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { listSessionComments } from "@/lib/data/comments";
import { getClientForTrainer } from "@/lib/data/profiles";
import { getSessionDetail } from "@/lib/data/sessions";
import { formatDateLong } from "@/lib/dates";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "トレーニング結果" };

export default async function TrainerSessionPage({
  params,
}: {
  params: Promise<{ clientId: string; sessionId: string }>;
}) {
  const { clientId, sessionId } = await params;
  if (!isUuid(clientId) || !isUuid(sessionId)) notFound();

  const { supabase, userId } = await requireRole("trainer");
  const [client, session, comments] = await Promise.all([
    getClientForTrainer(supabase, clientId),
    getSessionDetail(supabase, sessionId),
    listSessionComments(supabase, sessionId),
  ]);
  if (!client || !session || session.client_id !== clientId) notFound();

  const mine = comments.filter((c) => c.trainer_id === userId);

  return (
    <>
      <PageHeader
        title="トレーニング結果"
        subtitle={client.display_name}
        backHref={`/trainer/clients/${clientId}?tab=sessions`}
        backLabel={client.display_name}
      />
      <div className="space-y-8">
        <SessionView session={session} />
        <section>
          <SectionTitle>コメント</SectionTitle>
          <div className="space-y-4">
            <CommentComposer trainerId={userId} clientId={clientId} sessionId={session.id} />
            {mine.length > 0 ? <TrainerCommentList comments={mine} clientId={clientId} showSessionLink={false} /> : null}
          </div>
        </section>
        <div className="border-t border-line pt-6">
          <DeleteSessionButton
            sessionId={session.id}
            description={`${formatDateLong(session.performed_date)}の「${session.title}」`}
            counterpart="クライアント"
            redirectHref={`/trainer/clients/${clientId}?tab=sessions`}
          />
        </div>
      </div>
    </>
  );
}
