import { redirect } from "next/navigation";
import { getSession, homePathFor } from "@/lib/auth";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { SetupRequired } from "@/components/setup-required";

/** ログイン状態とロールに応じて振り分ける */
export default async function RootPage() {
  if (!hasSupabaseEnv()) {
    return <SetupRequired />;
  }

  const session = await getSession();
  if (!session) {
    redirect("/login");
  }
  if (!session.profile) {
    redirect("/auth/error?reason=profile");
  }
  redirect(homePathFor(session.profile.role));
}
