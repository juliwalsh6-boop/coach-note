import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MealsSetupNotice } from "@/components/meals/meals-setup-notice";
import { NutritionTargetEditor } from "@/components/meals/nutrition-target-editor";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { getLatestBodyWeight } from "@/lib/data/checkins";
import { listTargets } from "@/lib/data/nutrition-targets";
import { getClientForTrainer } from "@/lib/data/profiles";
import { todayISO } from "@/lib/dates";
import { isMissingSchemaError } from "@/lib/errors";
import { isUuid } from "@/lib/ids";
import type { NutritionTarget } from "@/types/app";

export const metadata: Metadata = { title: "栄養目標" };

export default async function NutritionTargetPage({ params }: { params: Promise<{ clientId: string }> }) {
  const { clientId } = await params;
  if (!isUuid(clientId)) notFound();

  const { supabase } = await requireRole("trainer");
  const [client, bodyWeightKg] = await Promise.all([
    getClientForTrainer(supabase, clientId),
    getLatestBodyWeight(supabase, clientId).catch(() => null),
  ]);
  if (!client) notFound();

  const backHref = `/trainer/clients/${clientId}?tab=meals`;
  let targets: NutritionTarget[] | null;
  try {
    targets = await listTargets(supabase, clientId);
  } catch (e) {
    if (!isMissingSchemaError(e)) throw e;
    targets = null;
  }

  return (
    <main className="mx-auto max-w-[480px] px-4 pt-safe pb-[calc(env(safe-area-inset-bottom)+48px)]">
      <PageHeader title="栄養目標" subtitle={`${client.display_name}さん`} backHref={backHref} backLabel={client.display_name} />
      {targets === null ? (
        <MealsSetupNotice role="trainer" />
      ) : (
        <NutritionTargetEditor
          clientId={clientId}
          clientName={client.display_name}
          today={todayISO()}
          targets={targets}
          bodyWeightKg={bodyWeightKg == null ? null : Number(bodyWeightKg)}
        />
      )}
    </main>
  );
}
