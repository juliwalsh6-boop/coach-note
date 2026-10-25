/** 80 → "80" / 77.5 → "77.5" / 77.25 → "77.25" */
export function formatKg(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return String(Math.round(value * 100) / 100);
}

/** 目標: 80kg × 8回 × 3セット（重量なし → 自重 × 8回 × 3セット） */
export function formatTarget(weightKg: number | null, reps: number | null, sets?: number): string {
  const weight = weightKg == null ? "自重" : `${formatKg(weightKg)}kg`;
  const parts = [weight, reps == null ? null : `${reps}回`, sets == null ? null : `${sets}セット`];
  return parts.filter(Boolean).join(" × ");
}

/** 1セットの記録: 80kg × 8 */
export function formatSet(weightKg: number | null, reps: number | null): string {
  const weight = weightKg == null ? "自重" : `${formatKg(weightKg)}kg`;
  return `${weight} × ${reps ?? "—"}`;
}

/** 90 → 90秒 / 120 → 2分 / 150 → 2分30秒 */
export function formatRest(seconds: number): string {
  if (seconds <= 0) return "なし";
  if (seconds < 120) return `${seconds}秒`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}分` : `${m}分${s}秒`;
}

/** 88 → 1:28 */
export function formatClock(totalSeconds: number): string {
  const safe = Math.max(0, Math.ceil(totalSeconds));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** 全角数字・カンマ小数点にも対応して数値に変換（空なら null） */
export function parseDecimal(input: string): number | null {
  const normalized = input
    .trim()
    .replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0))
    .replace(/[．，,]/g, ".");
  if (normalized === "") return null;
  if (!/^\d+(\.\d+)?$/.test(normalized)) return Number.NaN;
  return Number(normalized);
}

export function parseInteger(input: string): number | null {
  const value = parseDecimal(input);
  if (value == null) return null;
  if (Number.isNaN(value) || !Number.isInteger(value)) return Number.NaN;
  return value;
}

/** 総挙上量（重量 × 回数の合計） */
export function totalVolume(sets: { actual_weight_kg: number | null; actual_reps: number | null; completed_at: string | null }[]): number {
  return sets.reduce((sum, s) => {
    if (!s.completed_at || s.actual_weight_kg == null || s.actual_reps == null) return sum;
    return sum + s.actual_weight_kg * s.actual_reps;
  }, 0);
}

/** 12345 → "12,345" */
export function formatNumber(value: number): string {
  return new Intl.NumberFormat("ja-JP", { maximumFractionDigits: 1 }).format(value);
}
