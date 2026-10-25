import type { Metadata } from "next";
import { ClientCommentsFeed } from "@/components/comments/client-comments-feed";
import { EmptyState } from "@/components/ui/notice";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { listComments } from "@/lib/data/comments";

export const metadata: Metadata = { title: "コメント" };

export default async function ClientCommentsPage() {
  const { supabase, userId } = await requireRole("client");
  const comments = await listComments(supabase, userId, 100);

  return (
    <>
      <PageHeader title="コメント" subtitle="トレーナーから届いたコメントです。" />
      {comments.length === 0 ? (
        <EmptyState title="コメントはまだありません" description="トレーナーがコメントを書くと、ここに届きます。" />
      ) : (
        <ClientCommentsFeed comments={comments} />
      )}
    </>
  );
}
