import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-[480px] px-5 pt-safe pb-12">
      <div className="pt-16">
        <h1 className="text-2xl font-bold">ページが見つかりません</h1>
        <p className="mt-3 text-sm leading-relaxed text-ash">
          削除されたか、表示する権限のないページです。
        </p>
        <div className="mt-8">
          <LinkButton href="/" size="lg" block>
            ホームに戻る
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
