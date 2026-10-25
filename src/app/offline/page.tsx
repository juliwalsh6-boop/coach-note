import type { Metadata } from "next";
import { ReloadButton } from "@/components/reload-button";

export const metadata: Metadata = { title: "オフライン" };

/** Service Worker がオフライン時に表示する画面（ログイン不要・静的） */
export default function OfflinePage() {
  return (
    <main className="mx-auto max-w-[480px] px-5 pt-safe pb-12">
      <div className="pt-16">
        <h1 className="text-2xl font-bold">オフラインです</h1>
        <p className="mt-3 text-sm leading-relaxed text-ash">
          インターネットに接続できません。電波の良い場所に移動してから、もう一度読み込んでください。
        </p>
        <div className="mt-8">
          <ReloadButton />
        </div>
      </div>
    </main>
  );
}
