import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PlanEditor } from "@/components/plans/plan-editor";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { getExerciseSuggestions, getPlanWithExercises } from "@/lib/data/plans";
import { getClientForTrainer } from "@/lib/data/profiles";
import { todayISO } from "@/lib/dates";
import { isUuid } from "@/lib/ids";

export const metadata: Metadata = { title: "メニューを作成" };

export default async function NewPlanPage({
  params,
  searchParams,
}: {
  params: Promise<{ clientId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ clientId }, { from }] = await Promise.all([params, searchParams]);
  if (!isUuid(clientId)) notFound();

  const { supabase, userId } = await requireRole("trainer");
  const [client, suggestions, source] = await Promise.all([
    getClientForTrainer(supabase, clientId),
    getExerciseSuggestions(supabase),
    typeof from === "string" && isUuid(from) ? getPlanWithExercises(supabase, from) : Promise.resolve(null),
  ]);
  if (!client) notFound();
  // 複製元は自分が作ったメニューだけ
  const template = source && source.trainer_id === userId ? source : null;

  return (
    <main className="mx-auto max-w-[480px] px-4 pt-safe pb-[calc(env(safe-area-inset-bottom)+112px)]">
      <PageHeader
        title={template ? "メニューを複製" : "メニューを作成"}
        subtitle={`${client.display_name}さん用`}
        backHref={`/trainer/clients/${clientId}`}
        backLabel={client.display_name}
      />
      <PlanEditor
        key={template?.id ?? "new"}
        clientId={clientId}
        clientName={client.display_name}
        today={todayISO()}
        plan={null}
        template={template}
        suggestions={suggestions}
      />
    </main>
  );
}
