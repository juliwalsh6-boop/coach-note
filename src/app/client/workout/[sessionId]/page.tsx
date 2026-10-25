import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { WorkoutLogger } from "@/components/workout/workout-logger";
import { requireRole } from "@/lib/auth";
import { getPreviousRecords, getSessionDetail } from "@/lib/data/sessions";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "トレーニング" };

export default async function WorkoutPage({ params }: { params: Promise<{ sessionId: string }> }) {
  const { sessionId } = await params;
  if (!isUuid(sessionId)) notFound();

  const { supabase, userId } = await requireRole("client");
  const session = await getSessionDetail(supabase, sessionId);
  if (!session || session.client_id !== userId) notFound();

  const previous = await getPreviousRecords(supabase, sessionId);

  return (
    <main className="mx-auto max-w-[480px] px-4">
      <WorkoutLogger key={session.id} session={session} previous={previous} />
    </main>
  );
}
