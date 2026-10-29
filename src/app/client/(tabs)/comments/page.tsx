import type { Metadata } from "next";
import { ClientCommentsFeed } from "@/components/comments/client-comments-feed";
import { MealCommentsFeed } from "@/components/comments/meal-comments-feed";
import { EmptyState } from "@/components/ui/notice";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { listComments } from "@/lib/data/comments";
import { listMealCommentsForClient } from "@/lib/data/meal-comments";

export const metadata: Metadata = { title: "コメント" };

export default async function ClientCommentsPage() {
  const { supabase, userId } = await requireRole("client");
  const [comments, mealComments] = await Promise.all([
    listComments(supabase, userId, 100),
    listMealCommentsForClient(supabase, userId, 60).catch(() => []),
  ]);

  if (mealComments.length === 0) {
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

  return (
    <>
      <PageHeader title="コメント" subtitle="トレーナーから届いたコメントです。" />
      <div className="space-y-8">
        <section>
          <SectionTitle>食事へのコメント</SectionTitle>
          <MealCommentsFeed comments={mealComments} clientId={userId} />
        </section>
        {comments.length > 0 ? (
          <section>
            <SectionTitle>トレーニング・その他のコメント</SectionTitle>
            <ClientCommentsFeed comments={comments} />
          </section>
        ) : null}
      </div>
    </>
  );
}
