import type { Metadata } from "next";
import { InviteManager } from "@/components/trainer/invite-manager";
import { PageHeader } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { listInvites } from "@/lib/data/trainer";

export const metadata: Metadata = { title: "クライアントを招待" };

export default async function InvitePage() {
  const { supabase, profile } = await requireRole("trainer");
  const invites = await listInvites(supabase);

  return (
    <>
      <PageHeader title="クライアントを招待" subtitle="招待リンクを送ると、クライアントが自分でアカウントを作れます。" />
      <InviteManager invites={invites} trainerName={profile.display_name} />
    </>
  );
}
