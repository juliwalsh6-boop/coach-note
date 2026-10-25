"use client";

import { useEffect, useState } from "react";

/** 開始時刻からの経過秒数（1秒ごとに更新）。サーバー描画時は null */
export function useElapsedSeconds(startedAt: string, running: boolean): number | null {
  const [elapsed, setElapsed] = useState<number | null>(null);

  useEffect(() => {
    const start = new Date(startedAt).getTime();
    const update = () => setElapsed(Math.max(0, Math.floor((Date.now() - start) / 1000)));
    const first = window.setTimeout(update, 0);
    if (!running) {
      return () => window.clearTimeout(first);
    }
    const id = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [startedAt, running]);

  return elapsed;
}
