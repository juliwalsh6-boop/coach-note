"use client";

import { vibrate } from "@/lib/haptics";
import { soundEngine } from "./engine";
import { isSoundEnabled, isVoiceEnabled } from "./settings";
import type { SoundId } from "./sounds";
import { primeVoice, speakCue } from "./voice";

/** 次に行うセット（休憩終了時の案内に使う） */
export type NextUp = {
  exerciseName: string;
  setNumber: number;
  weightKg: number | null;
  reps: number | null;
};

/**
 * トレーニング中に発生するイベント。
 * 効果音・音声ガイド・振動などはすべてこのイベントを受けて鳴らす。
 * 新しい案内を足すときは、ここにイベントを追加して CUE_SOUNDS / VOICE_LINES に対応を書く。
 */
export type CueEvent =
  | { type: "set_complete" }
  | { type: "exercise_complete"; exerciseName: string }
  | { type: "rest_warning"; secondsLeft: number }
  | { type: "rest_countdown"; secondsLeft: number }
  | { type: "rest_end"; next: NextUp | null }
  | { type: "workout_charge" }
  | { type: "workout_complete" }
  | { type: "personal_record" }
  | { type: "checkin_complete" };

/** イベント → 効果音 */
export const CUE_SOUNDS: Partial<Record<CueEvent["type"], SoundId>> = {
  set_complete: "setComplete",
  exercise_complete: "exerciseComplete",
  rest_warning: "restWarning",
  rest_countdown: "countdownTick",
  rest_end: "restEnd",
  workout_charge: "workoutCharge",
  workout_complete: "workoutComplete",
  personal_record: "personalRecord",
  checkin_complete: "exerciseComplete",
};

/** イベント → 振動パターン [振動ms, 休みms, …]（iPhone は触覚の「コツコツ」で代用。src/lib/haptics.ts） */
const CUE_VIBRATIONS: Partial<Record<CueEvent["type"], number[]>> = {
  exercise_complete: [40, 50, 70],
  rest_warning: [80],
  rest_end: [180, 90, 180],
  // 溜め: だんだん速く（約1秒）
  workout_charge: [40, 160, 40, 130, 45, 100, 50, 75, 55, 55, 60, 40, 70, 25, 80],
  // ギャン（長く強く）→ でーん
  workout_complete: [280, 40, 160],
  personal_record: [50, 40, 50, 40, 160],
};

/** タップなどユーザー操作の中で呼び、音を鳴らせる状態にする */
export function unlockAudio(): void {
  soundEngine.unlock();
  if (isVoiceEnabled()) primeVoice();
}

export function playCue(event: CueEvent): void {
  const soundOn = isSoundEnabled();
  const sound = CUE_SOUNDS[event.type];
  if (soundOn && sound) {
    soundEngine.play(sound);
  }
  if (isVoiceEnabled()) {
    // 効果音と重ならないよう少し遅らせて読み上げる
    speakCue(event, soundOn && sound ? 450 : 0);
  }
  const vibration = CUE_VIBRATIONS[event.type];
  if (soundOn && vibration) {
    vibrate(vibration);
  }
}
