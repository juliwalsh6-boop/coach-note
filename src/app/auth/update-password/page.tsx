import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth/auth-shell";
import { UpdatePasswordForm } from "@/components/auth/update-password-form";
import { getSession } from "@/lib/auth";

export const metadata: Metadata = { title: "新しいパスワード" };

export default async function UpdatePasswordPage() {
  const session = await getSession();
  if (!session) {
    redirect("/auth/error?reason=link");
  }

  return (
    <AuthShell title="新しいパスワード" lead="新しいパスワードを入力してください。">
      <UpdatePasswordForm />
    </AuthShell>
  );
}
