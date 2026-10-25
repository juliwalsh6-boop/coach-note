import { APP_TIME_ZONE } from "./config";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

type DateParts = { year: number; month: number; day: number };

function parseISODate(iso: string): DateParts {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return { year: Number(y ?? 0), month: Number(m ?? 1), day: Number(d ?? 1) };
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

/** 指定タイムゾーンでの日付を YYYY-MM-DD で返す */
export function toISODate(date: Date, timeZone: string = APP_TIME_ZONE): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** アプリのタイムゾーンでの「今日」（YYYY-MM-DD） */
export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const { year, month, day } = parseISODate(iso);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

function weekday(iso: string): string {
  const { year, month, day } = parseISODate(iso);
  return WEEKDAYS[new Date(Date.UTC(year, month - 1, day)).getUTCDay()] ?? "";
}

/** 10/25 */
export function formatMonthDay(iso: string): string {
  const { month, day } = parseISODate(iso);
  return `${month}/${day}`;
}

/** 土 */
export function formatWeekday(iso: string): string {
  return weekday(iso);
}

/** 10/25(土) */
export function formatDateShort(iso: string): string {
  const { month, day } = parseISODate(iso);
  return `${month}/${day}(${weekday(iso)})`;
}

/** 2026年10月25日(土) */
export function formatDateLong(iso: string): string {
  const { year, month, day } = parseISODate(iso);
  return `${year}年${month}月${day}日(${weekday(iso)})`;
}

/** 今日 / 昨日 / 明日 / 10/25(土) */
export function relativeDateLabel(iso: string, today: string = todayISO()): string {
  if (iso === today) return "今日";
  if (iso === addDaysISO(today, -1)) return "昨日";
  if (iso === addDaysISO(today, 1)) return "明日";
  return formatDateShort(iso);
}

/** タイムスタンプを「18:42」形式で */
export function formatTime(timestamp: string): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(timestamp));
}

/** タイムスタンプを「10/25(土) 18:42」形式で */
export function formatDateTime(timestamp: string): string {
  return `${formatDateShort(toISODate(new Date(timestamp)))} ${formatTime(timestamp)}`;
}

/** 2つのタイムスタンプの差（分） */
export function minutesBetween(start: string, end: string): number {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}

/** 72 → 1時間12分 / 48 → 48分 */
export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}分`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h}時間` : `${h}時間${m}分`;
}

/** 時間帯に合わせたあいさつ */
export function greeting(date: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-US", { timeZone: APP_TIME_ZONE, hour: "numeric", hour12: false }).format(date),
  );
  if (hour >= 4 && hour < 11) return "おはようございます";
  if (hour >= 11 && hour < 18) return "こんにちは";
  return "こんばんは";
}

export function isValidISODate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const { year, month, day } = parseISODate(value);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}
