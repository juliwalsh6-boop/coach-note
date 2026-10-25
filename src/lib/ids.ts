const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** URL の id が UUID の形式か（不正な値で DB エラーにならないよう先に弾く） */
export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}
