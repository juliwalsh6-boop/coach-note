"use client";

import { useEffect } from "react";
import { Button, LinkButton } from "@/components/ui/button";

export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const digest =
    error instanceof Error && "digest" in error && typeof error.digest === "string" ? error.digest : null;

  return (
    <main className="mx-auto max-w-[480px] px-5 pt-safe pb-12">
      <div className="pt-16">
        <h1 className="text-2xl font-bold">画面を表示できませんでした</h1>
        <p className="mt-3 text-sm leading-relaxed text-ash">
          通信が不安定か、一時的なエラーの可能性があります。もう一度読み込んでも直らない場合は、ログインし直してください。
        </p>
        {digest ? <p className="mt-3 text-xs text-ash">エラーID: {digest}</p> : null}
        <div className="mt-8 flex flex-col gap-3">
          <Button size="lg" block onClick={() => retry()}>
            もう一度読み込む
          </Button>
          <LinkButton href="/" variant="secondary" size="lg" block>
            ホームに戻る
          </LinkButton>
        </div>
      </div>
    </main>
  );
}
