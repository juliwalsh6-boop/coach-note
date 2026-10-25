/** アプリ名（ホーム画面のアイコン名などにも使われます） */
export const APP_NAME = "COACH NOTE";

export const APP_DESCRIPTION = "トレーナーとクライアントで共有するトレーニング記録";

/**
 * 「今日」を決めるタイムゾーン。
 * チェックインの日付・今日のメニュー・トレーニング実施日の判定に使います。
 */
export const APP_TIME_ZONE = "Asia/Tokyo";

/** メニュー作成時の休憩時間の初期値（秒） */
export const DEFAULT_REST_SECONDS = 90;

/** 休憩時間のよく使う候補（秒） */
export const REST_PRESETS = [60, 90, 120, 180] as const;

/** 重量のステッパーの刻み（kg） */
export const WEIGHT_STEP_KG = 2.5;
