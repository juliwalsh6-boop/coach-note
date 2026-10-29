"use client";

import { useCallback, useEffect, useState } from "react";
import { getPhotoUrls } from "@/lib/data/meal-photos";
import type { DB } from "@/lib/data/db";

/**
 * 食事写真の署名付き URL（期限 1 時間）を取得する。
 * 期限切れなどで読み込めなかったときは reload() で取り直す。
 */
export function usePhotoUrls(db: DB, paths: string[]) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [version, setVersion] = useState(0);
  const key = paths.join("|");

  useEffect(() => {
    if (!key) return;
    let cancelled = false;
    getPhotoUrls(db, key.split("|"))
      .then((result) => {
        if (!cancelled) setUrls((current) => ({ ...current, ...result }));
      })
      .catch(() => {
        // 表示できなくても記録には影響しない（写真の枠に「読み込めません」と出す）
      });
    return () => {
      cancelled = true;
    };
  }, [db, key, version]);

  const reload = useCallback(() => setVersion((v) => v + 1), []);
  return { urls, reload };
}
