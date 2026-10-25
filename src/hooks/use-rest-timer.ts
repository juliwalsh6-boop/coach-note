"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CueEvent, NextUp } from "@/lib/audio/cues";

export type RestInfo = {
  /** 例: ベンチプレス 2セット目のあと */
  label: string;
  next: NextUp | null;
};

type RestState = {
  endsAt: number;
  totalSeconds: number;
  info: RestInfo;
};

export type RestTimer = {
  /** 休憩中なら残り秒数、休憩していなければ null */
  remaining: number | null;
  totalSeconds: number;
  info: RestInfo | null;
  /** 直前に休憩が終わった（「休憩終了」を一瞬表示するため） */
  justFinished: boolean;
  start: (seconds: number, info: RestInfo) => void;
  addSeconds: (delta: number) => void;
  skip: () => void;
};

const STORAGE_PREFIX = "coachnote.rest.";
/** 終了時刻からこれ以上遅れて気づいた場合（アプリが裏にいた等）は音を鳴らさない */
const LATE_CUE_LIMIT_MS = 5000;

function readSaved(key: string): RestState | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const saved = JSON.parse(raw) as RestState;
    return typeof saved.endsAt === "number" && saved.endsAt > Date.now() ? saved : null;
  } catch {
    return null;
  }
}

function writeSaved(key: string, state: RestState | null): void {
  try {
    if (state) window.sessionStorage.setItem(key, JSON.stringify(state));
    else window.sessionStorage.removeItem(key);
  } catch {
    // 保存できなくてもタイマーは動く
  }
}

/**
 * インターバル（休憩）タイマー。
 * 終了時刻を基準に残り時間を計算するので、画面を切り替えて戻ってきてもズレない。
 * 残り10秒・3・2・1秒・終了のタイミングで onCue を呼ぶ。
 */
export function useRestTimer(sessionId: string, onCue: (event: CueEvent) => void): RestTimer {
  const storageKey = STORAGE_PREFIX + sessionId;
  const [rest, setRest] = useState<RestState | null>(null);
  const [now, setNow] = useState(0);
  const [justFinished, setJustFinished] = useState(false);
  const fired = useRef(new Set<string>());
  const onCueRef = useRef(onCue);
  const finishTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    onCueRef.current = onCue;
  }, [onCue]);

  // 再読み込みしても休憩を続ける
  useEffect(() => {
    const saved = readSaved(storageKey);
    if (saved) {
      fired.current = new Set();
      setNow(Date.now());
      setRest(saved);
    }
  }, [storageKey]);

  const finish = useCallback(
    (late: boolean, state: RestState) => {
      if (!late) {
        onCueRef.current({ type: "rest_end", next: state.info.next });
      }
      writeSaved(storageKey, null);
      setRest(null);
      setJustFinished(true);
      if (finishTimer.current) clearTimeout(finishTimer.current);
      finishTimer.current = setTimeout(() => setJustFinished(false), 1600);
    },
    [storageKey],
  );

  useEffect(() => {
    if (!rest) return;
    const tick = () => {
      const current = Date.now();
      const remainingMs = rest.endsAt - current;
      if (remainingMs <= 0) {
        finish(remainingMs < -LATE_CUE_LIMIT_MS, rest);
        return;
      }
      const remaining = Math.ceil(remainingMs / 1000);
      if (remaining <= 10 && remaining > 3 && rest.totalSeconds > 10 && !fired.current.has("warn")) {
        fired.current.add("warn");
        onCueRef.current({ type: "rest_warning", secondsLeft: remaining });
      }
      if (remaining <= 3 && !fired.current.has(`tick-${remaining}`)) {
        fired.current.add(`tick-${remaining}`);
        onCueRef.current({ type: "rest_countdown", secondsLeft: remaining });
      }
      setNow(current);
    };
    const id = window.setInterval(tick, 250);
    return () => window.clearInterval(id);
  }, [rest, finish]);

  useEffect(() => {
    return () => {
      if (finishTimer.current) clearTimeout(finishTimer.current);
    };
  }, []);

  const start = useCallback(
    (seconds: number, info: RestInfo) => {
      if (seconds <= 0) return;
      const current = Date.now();
      const next: RestState = { endsAt: current + seconds * 1000, totalSeconds: seconds, info };
      fired.current = new Set();
      setJustFinished(false);
      setNow(current);
      setRest(next);
      writeSaved(storageKey, next);
    },
    [storageKey],
  );

  const addSeconds = useCallback(
    (delta: number) => {
      if (!rest) return;
      const currentTime = Date.now();
      const endsAt = Math.max(currentTime + 1000, rest.endsAt + delta * 1000);
      const remaining = Math.ceil((endsAt - currentTime) / 1000);
      // 延長して残り時間が戻ったら、残り10秒・カウントダウンの音をもう一度鳴らせるようにする
      for (const key of [...fired.current]) {
        if (key === "warn" && remaining > 10) fired.current.delete(key);
        if (key.startsWith("tick-") && Number(key.slice(5)) < remaining) fired.current.delete(key);
      }
      const next: RestState = { ...rest, endsAt, totalSeconds: Math.max(rest.totalSeconds, remaining) };
      writeSaved(storageKey, next);
      setNow(currentTime);
      setRest(next);
    },
    [rest, storageKey],
  );

  const skip = useCallback(() => {
    writeSaved(storageKey, null);
    setRest(null);
    setJustFinished(false);
  }, [storageKey]);

  const remaining = rest ? Math.max(0, Math.ceil((rest.endsAt - now) / 1000)) : null;

  return {
    remaining,
    totalSeconds: rest?.totalSeconds ?? 0,
    info: rest?.info ?? null,
    justFinished,
    start,
    addSeconds,
    skip,
  };
}
