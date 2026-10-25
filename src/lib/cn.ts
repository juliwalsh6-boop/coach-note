/** クラス名を結合する（false / null / undefined は無視） */
export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(" ");
}
