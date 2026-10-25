import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanEditor } from "@/components/plans/plan-editor";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { getExerciseSuggestions, getPlanWithExercises } from "@/lib/data/plans";
import { getClientForTrainer } from "@/lib/data/profiles";
import { todayISO } from "@/lib/dates";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "メニューを編集" };

export default async function EditPlanPage({ params }: { params: Promise<{ clientId: string; planId: string }> }) {
  const { clientId, planId } = await params;
  if (!isUuid(clientId) || !isUuid(planId)) notFound();

  const { supabase, userId } = await requireRole("trainer");
  const [client, plan, suggestions] = await Promise.all([
    getClientForTrainer(supabase, clientId),
    getPlanWithExercises(supabase, planId),
    getExerciseSuggestions(supabase),
  ]);
  if (!client || !plan || plan.client_id !== clientId || plan.trainer_id !== userId) notFound();

  return (
    <main className="mx-auto max-w-[480px] px-4 pt-safe pb-[calc(env(safe-area-inset-bottom)+112px)]">
      <PageHeader
        title="メニューを編集"
        subtitle={`${client.display_name}さん用`}
        backHref={`/trainer/clients/${clientId}`}
        backLabel={client.display_name}
      />
      <PlanEditor
        key={plan.id}
        clientId={clientId}
        clientName={client.display_name}
        today={todayISO()}
        plan={plan}
        suggestions={suggestions}
      />
    </main>
  );
}
