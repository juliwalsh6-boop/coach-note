import { APP_NAME } from "@/lib/config";

/** Supabase の環境変数が未設定のときに表示する案内 */
export function SetupRequired() {
  return (
    <main className="mx-auto max-w-[480px] px-5 pt-safe pb-12">
      <div className="pt-12">
        <p className="num text-sm font-bold tracking-wide text-plate-blue-bright">{APP_NAME}</p>
        <h1 className="mt-2 text-2xl font-bold">セットアップを完了してください</h1>
        <p className="mt-3 text-sm leading-relaxed text-ash">
          Supabase の接続情報が設定されていません。次の 2 つの環境変数を設定してから、もう一度開いてください。
        </p>
        <pre className="mt-5 overflow-x-auto rounded-xl border border-line bg-steel p-4 text-xs leading-relaxed">
          {`NEXT_PUBLIC_SUPABASE_URL\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`}
        </pre>
        <ul className="mt-5 list-disc space-y-2 pl-5 text-sm text-ash">
          <li>ローカルで動かす場合: プロジェクト直下の .env.local に書いて、開発サーバーを再起動</li>
          <li>Vercel の場合: Project Settings → Environment Variables に追加して、再デプロイ</li>
        </ul>
      </div>
    </main>
  );
}
