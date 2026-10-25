/** ログイン後の遷移先として安全な相対パスだけを許可する（外部サイトへのリダイレクトを防ぐ） */
export function safeNextPath(value: string | null | undefined): string | null {
  if (!value) return null;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return null;
  return value;
}
