import { requireRole } from "@/lib/auth";

/** クライアント用ページ全体: クライアントとしてログインしていることを確認 */
export default async function ClientLayout({ children }: { children: React.ReactNode }) {
  await requireRole("client");
  return <>{children}</>;
}
