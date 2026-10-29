/**
 * 食品検索用の正規化。DB の private.normalize_search_text と同じ規則:
 *   全角/半角（NFKC）・連続する空白・大文字/小文字・ひらがな/カタカナの違いを吸収する。
 *   例: 「ｻﾗﾀﾞﾁｷﾝ」「さらだちきん」→「サラダチキン」
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .replace(/[ぁ-ゖ]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) + 0x60));
}

/** LIKE / ILIKE のパターンで特別な意味を持つ文字（% _ \）をエスケープする */
export function escapeLikePattern(value: string): string {
  return value.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

/** 検索語を空白で分けたもの（すべてを含む食品だけを出す） */
export function searchTerms(input: string, maxTerms = 4): string[] {
  return normalizeSearchText(input)
    .split(" ")
    .filter((t) => t.length > 0)
    .slice(0, maxTerms);
}
