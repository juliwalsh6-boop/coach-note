// 効果音の定義。
// 音を差し替えるときは public/sounds/ の同じ名前のファイルを置き換えるだけで OK。
// （mp3 / m4a に変える場合はここのパスも変更してください）

export const SOUND_FILES = {
  /** セット完了 */
  setComplete: "/sounds/set-complete.wav",
  /** 休憩の残り10秒 */
  restWarning: "/sounds/rest-warning.wav",
  /** 残り3・2・1秒 */
  countdownTick: "/sounds/countdown-tick.wav",
  /** 休憩終了 */
  restEnd: "/sounds/rest-end.wav",
  /** 1種目のセットをすべて完了・朝のチェックイン完了 */
  exerciseComplete: "/sounds/exercise-complete.wav",
  /** トレーニング完了の直前の「溜め」 */
  workoutCharge: "/sounds/workout-charge.wav",
  /** トレーニング完了（「ギャン！」→「でーん！」） */
  workoutComplete: "/sounds/workout-complete.wav",
  /** 自己ベスト更新 */
  personalRecord: "/sounds/personal-record.wav",
} as const;

export type SoundId = keyof typeof SOUND_FILES;

/** 音声ファイルを読み込めなかったときに鳴らす電子音（周波数Hz・長さ秒・開始秒） */
export const FALLBACK_TONES: Record<SoundId, { freq: number; duration: number; at: number }[]> = {
  setComplete: [
    { freq: 1318.5, duration: 0.12, at: 0 },
    { freq: 1760, duration: 0.18, at: 0.1 },
  ],
  restWarning: [
    { freq: 880, duration: 0.1, at: 0 },
    { freq: 880, duration: 0.1, at: 0.17 },
  ],
  countdownTick: [{ freq: 1046.5, duration: 0.08, at: 0 }],
  restEnd: [
    { freq: 1046.5, duration: 0.22, at: 0 },
    { freq: 1318.5, duration: 0.22, at: 0.16 },
    { freq: 1568, duration: 0.5, at: 0.32 },
  ],
  exerciseComplete: [
    { freq: 1046.5, duration: 0.14, at: 0 },
    { freq: 1568, duration: 0.18, at: 0.07 },
    { freq: 2093, duration: 0.4, at: 0.14 },
  ],
  workoutCharge: [
    { freq: 220, duration: 0.12, at: 0 },
    { freq: 330, duration: 0.12, at: 0.25 },
    { freq: 440, duration: 0.1, at: 0.45 },
    { freq: 587.33, duration: 0.08, at: 0.6 },
    { freq: 698.46, duration: 0.07, at: 0.72 },
    { freq: 783.99, duration: 0.06, at: 0.82 },
    { freq: 880, duration: 0.06, at: 0.9 },
  ],
  workoutComplete: [
    { freq: 196, duration: 0.2, at: 0 },
    { freq: 293.66, duration: 0.2, at: 0 },
    { freq: 523.25, duration: 1.2, at: 0.26 },
    { freq: 659.25, duration: 1.2, at: 0.26 },
    { freq: 783.99, duration: 1.2, at: 0.26 },
    { freq: 1046.5, duration: 1.2, at: 0.26 },
  ],
  personalRecord: [
    { freq: 783.99, duration: 0.1, at: 0 },
    { freq: 987.77, duration: 0.1, at: 0.06 },
    { freq: 1174.66, duration: 0.1, at: 0.12 },
    { freq: 1567.98, duration: 0.7, at: 0.18 },
    { freq: 1975.53, duration: 0.7, at: 0.18 },
  ],
};
