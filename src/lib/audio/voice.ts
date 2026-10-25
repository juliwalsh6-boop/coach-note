"use client";

import { formatKg } from "@/lib/format";
import type { CueEvent } from "./cues";

/**
 * 音声ガイド（試験中）。
 * イベントごとの読み上げ文をここで決める。将来、録音した音声ファイルに置き換える場合も
 * このファイルの speakCue だけを差し替えればよい。
 */
export const VOICE_LINES: Partial<{ [K in CueEvent["type"]]: (event: Extract<CueEvent, { type: K }>) => string | null }> = {
  rest_warning: () => "残り10秒です",
  rest_end: (event) => {
    if (!event.next) return "休憩終了です";
    const weight = event.next.weightKg == null ? "" : `${formatKg(event.next.weightKg)}キロ、`;
    const reps = event.next.reps == null ? "" : `${event.next.reps}回`;
    return `休憩終了です。次は${event.next.exerciseName}、${weight}${reps}です`;
  },
  exercise_complete: (event) => `${event.exerciseName}、完了です`,
  workout_complete: () => "トレーニング完了です。お疲れさまでした",
  personal_record: () => "自己ベスト更新です",
};

function lineFor(event: CueEvent): string | null {
  const build = VOICE_LINES[event.type] as ((e: CueEvent) => string | null) | undefined;
  return build ? build(event) : null;
}

let primed = false;

/** ユーザー操作の中で呼ぶ（iOS で読み上げを許可させる） */
export function primeVoice(): void {
  if (primed || typeof window === "undefined" || !("speechSynthesis" in window)) return;
  try {
    const utterance = new SpeechSynthesisUtterance("");
    utterance.volume = 0;
    window.speechSynthesis.speak(utterance);
    primed = true;
  } catch {
    // 読み上げに対応していない端末では何もしない
  }
}

export function speakCue(event: CueEvent, delayMs = 0): void {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
  const text = lineFor(event);
  if (!text) return;
  window.setTimeout(() => {
    try {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = "ja-JP";
      utterance.rate = 1.05;
      const voice = window.speechSynthesis.getVoices().find((v) => v.lang.startsWith("ja"));
      if (voice) utterance.voice = voice;
      window.speechSynthesis.cancel();
      window.speechSynthesis.speak(utterance);
    } catch {
      // 失敗しても効果音だけで続行
    }
  }, delayMs);
}
