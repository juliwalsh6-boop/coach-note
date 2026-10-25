import { requireRole } from "@/lib/auth";

/** トレーナー用ページ全体: トレーナーとしてログインしていることを確認 */
export default async function TrainerLayout({ children }: { children: React.ReactNode }) {
  await requireRole("trainer");
  return <>{children}</>;
}
