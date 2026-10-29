import { EmptyState } from "@/components/ui/notice";

/**
 * 食事管理のテーブルがまだ無いとき（データベースの更新前に画面だけ新しくなった場合）の案内。
 * 既存の機能には影響しないよう、食事の画面だけこの表示にする。
 */
export function MealsSetupNotice({ role }: { role: "client" | "trainer" }) {
  return (
    <EmptyState
      title="食事管理の準備中です"
      description={
        role === "trainer"
          ? "データベースの更新（食事管理のマイグレーション）が必要です。README の「食事管理を有効にする」の手順で適用してください。"
          : "まもなく使えるようになります。トレーナーに確認してください。"
      }
    />
  );
}
