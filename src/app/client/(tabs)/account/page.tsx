import type { Metadata } from "next";
import { DisplayNameForm } from "@/components/account/display-name-form";
import { InstallGuide } from "@/components/account/install-guide";
import { SoundSettings } from "@/components/account/sound-settings";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { PageHeader, SectionTitle } from "@/components/ui/page-header";
import { requireRole } from "@/lib/auth";
import { listMyTrainers } from "@/lib/data/profiles";

export const metadata: Metadata = { title: "アカウント" };

export default async function ClientAccountPage() {
  const { supabase, userId, email, profile } = await requireRole("client");
  const trainers = await listMyTrainers(supabase);

  return (
    <>
      <PageHeader title="アカウント" subtitle={email ?? undefined} />
      <div className="space-y-8">
        <section className="panel p-5">
          <DisplayNameForm userId={userId} initialName={profile.display_name} />
        </section>

        <section>
          <SectionTitle>担当トレーナー</SectionTitle>
          <div className="panel p-5 text-sm">
            {trainers.length > 0 ? (
              <ul className="space-y-1">
                {trainers.map((t) => (
                  <li key={t.id} className="font-bold">
                    {t.display_name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-ash">まだトレーナーとつながっていません。招待リンクを開いてください。</p>
            )}
          </div>
        </section>

        <section>
          <SectionTitle>音の設定</SectionTitle>
          <div className="panel px-5 pt-2 pb-5">
            <SoundSettings />
          </div>
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
