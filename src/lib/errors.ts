// Supabase / ネットワークのエラーを、画面に出せる日本語に変換する

const DB_MESSAGES: Record<string, string> = {
  not_authenticated: "ログインの有効期限が切れました。もう一度ログインしてください。",
  invite_not_found: "招待コードが見つかりません。リンクをもう一度確認してください。",
  invite_already_used: "この招待リンクはすでに使われています。トレーナーに新しいリンクを発行してもらってください。",
  invite_expired: "招待リンクの有効期限が切れています。トレーナーに新しいリンクを発行してもらってください。",
  invite_self: "自分が発行した招待リンクは使えません。",
  invite_requires_client:
    "トレーナー用のアカウントでは招待を受けられません。ログアウトして、クライアント用のアカウントで登録してください。",
  trainer_only: "この操作はトレーナーのアカウントでのみ行えます。",
  too_many_invites: "未使用の招待リンクが多すぎます。使わないリンクを削除してから作成してください。",
  invite_code_generation_failed: "招待コードを作成できませんでした。もう一度お試しください。",
  exercises_required: "種目を1つ以上追加してください。",
  too_many_exercises: "種目は30個までです。",
  plan_not_found: "メニューが見つかりません。削除された可能性があります。",
  plan_empty: "このメニューには種目がありません。トレーナーに確認してください。",
  invalid_date: "日付を判定できませんでした。端末の日付・時刻の設定を確認してください。",
  exercise_not_found: "種目が見つかりません。画面を再読み込みしてください。",
  too_many_sets: "1種目のセットは20セットまでです。",
  invalid_set_targets: "セットごとの目標を確認してください（回数は1〜999回、重量は0〜999kg、セットは1〜20）。",
  set_not_found: "セットが見つかりません。画面を再読み込みしてください。",
  set_already_completed: "完了済みのセットは削除できません。",
  last_set_required: "最低1セットは必要です。",
  session_not_found: "トレーニングが見つかりません。画面を再読み込みしてください。",
  client_not_found: "クライアントが見つかりません。すでに削除されている可能性があります。",
};

const AUTH_MESSAGES: Record<string, string> = {
  invalid_credentials: "メールアドレスまたはパスワードが違います。",
  email_not_confirmed: "メールアドレスの確認が終わっていません。届いた確認メールのリンクを開いてください。",
  user_already_exists: "このメールアドレスはすでに登録されています。ログインしてください。",
  email_exists: "このメールアドレスはすでに登録されています。ログインしてください。",
  weak_password: "パスワードが弱すぎます。8文字以上で、英字と数字を組み合わせてください。",
  over_email_send_rate_limit: "メールの送信回数が上限に達しました。しばらく待ってからお試しください。",
  over_request_rate_limit: "操作が多すぎます。しばらく待ってからお試しください。",
  email_address_invalid: "メールアドレスの形式が正しくありません。",
  signup_disabled: "現在、新規登録は受け付けていません。",
  same_password: "新しいパスワードは、今のパスワードと別のものにしてください。",
  session_not_found: "ログインの有効期限が切れました。もう一度ログインしてください。",
  otp_expired: "リンクの有効期限が切れています。もう一度やり直してください。",
};

const PG_CODE_MESSAGES: Record<string, string> = {
  "42501": "この操作を行う権限がありません。一度ログアウトして、ログインし直してください。",
  "23514": "入力した値が範囲外です。内容を確認してください。",
  "23505": "同じデータがすでに登録されています。",
  "22P02": "入力の形式が正しくありません。",
  PGRST116: "データが見つかりません。",
  PGRST301: "ログインの有効期限が切れました。もう一度ログインしてください。",
};

const NETWORK_PATTERNS = [/failed to fetch/i, /load failed/i, /networkerror/i, /network request failed/i, /fetch failed/i];

type ErrorLike = { message?: unknown; code?: unknown; name?: unknown };

function asErrorLike(error: unknown): ErrorLike | null {
  return typeof error === "object" && error !== null ? (error as ErrorLike) : null;
}

export const DEFAULT_ERROR_MESSAGE = "うまくいきませんでした。時間をおいてもう一度お試しください。";

export function isNetworkError(error: unknown): boolean {
  const e = asErrorLike(error);
  const message = typeof e?.message === "string" ? e.message : "";
  return NETWORK_PATTERNS.some((p) => p.test(message));
}

export function toErrorMessage(error: unknown, fallback: string = DEFAULT_ERROR_MESSAGE): string {
  if (typeof error === "string") {
    return DB_MESSAGES[error] ?? AUTH_MESSAGES[error] ?? error;
  }
  const e = asErrorLike(error);
  if (!e) return fallback;

  const message = typeof e.message === "string" ? e.message : "";
  const code = typeof e.code === "string" ? e.code : "";

  if (isNetworkError(error)) {
    return "通信できませんでした。電波の良い場所でもう一度お試しください。";
  }
  if (message && DB_MESSAGES[message]) return DB_MESSAGES[message];
  if (code && AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  if (/invalid login credentials/i.test(message)) return AUTH_MESSAGES.invalid_credentials ?? fallback;
  if (/already registered/i.test(message)) return AUTH_MESSAGES.user_already_exists ?? fallback;
  if (/password should be at least/i.test(message)) return "パスワードは8文字以上にしてください。";
  if (code && PG_CODE_MESSAGES[code]) return PG_CODE_MESSAGES[code];
  if (/row-level security/i.test(message)) return PG_CODE_MESSAGES["42501"] ?? fallback;
  return fallback;
}
