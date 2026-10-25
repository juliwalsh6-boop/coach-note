import type { Metadata } from "next";
import { DisplayNameForm } from "@/components/account/display-name-form";
import { InstallGuide } from "@/components/account/install-guide";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";

export const metadata: Metadata = { title: "アカウント" };

export default async function TrainerAccountPage() {
  const { userId, email, profile } = await requireRole("trainer");

  return (
    <>
      <PageHeader title="アカウント" subtitle={email ?? undefined} />
      <div className="space-y-8">
        <section className="panel p-5">
          <DisplayNameForm userId={userId} initialName={profile.display_name} />
        </section>
        <section>
          <SectionTitle>ホーム画面に追加</SectionTitle>
          <div className="panel p-5">
            <InstallGuide />
          </div>
        </section>
        <SignOutButton />
      </div>
    </>
  );
}
