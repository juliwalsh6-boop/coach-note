"use client";

import { useEffect } from "react";

type WakeLockSentinelLike = { release: () => Promise<void> };
type WakeLockLike = { request: (type: "screen") => Promise<WakeLockSentinelLike> };

/** トレーニング中は画面が自動で消えないようにする（対応ブラウザのみ） */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || typeof navigator === "undefined") return;
    const wakeLock = (navigator as Navigator & { wakeLock?: WakeLockLike }).wakeLock;
    if (!wakeLock) return;

    let sentinel: WakeLockSentinelLike | null = null;
    let disposed = false;

    const acquire = async () => {
      try {
        const next = await wakeLock.request("screen");
        if (disposed) {
          void next.release().catch(() => undefined);
          return;
        }
        sentinel = next;
      } catch {
        // 省電力モードなどで拒否された場合は何もしない
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void acquire();
    };

    void acquire();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, [active]);
}
