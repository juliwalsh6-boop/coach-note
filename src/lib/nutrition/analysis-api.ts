/**
 * 写真解析 API（/api/meals/analyze）のやりとりの形。ブラウザとサーバーの両方から使う。
 */
import type { MealAnalysis } from "./analysis";

export const ANALYZE_ENDPOINT = "/api/meals/analyze";

/** サーバーが受け付ける画像の最大サイズ（Vercel の上限 4.5MB より小さくする。圧縮後の写真は通常 0.5MB 以下） */
export const ANALYZE_MAX_BYTES = 4 * 1024 * 1024;

export type AnalyzeSuccess = {
  ok: true;
  analysis: MealAnalysis;
  model: string;
  analyzedAt: string;
  /** 24 時間で残り何回使えるか */
  remaining: number | null;
};

export type AnalyzeFailure = {
  ok: false;
  /** errors.ts の DB_MESSAGES のキー（画面に出す日本語に変換する） */
  error: string;
};

export type AnalyzeResponse = AnalyzeSuccess | AnalyzeFailure;

/** 送信中の進捗（0〜1）を返しながら解析 API を呼ぶ（ブラウザ専用） */
export function requestMealAnalysis(
  image: Blob,
  onUploadProgress: (ratio: number) => void,
  signal?: AbortSignal,
): Promise<AnalyzeResponse> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", ANALYZE_ENDPOINT);
    xhr.responseType = "json";
    xhr.timeout = 70_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onUploadProgress(event.loaded / event.total);
    };
    xhr.upload.onload = () => onUploadProgress(1);
    xhr.onload = () => {
      const body: unknown = xhr.response;
      if (isAnalyzeResponse(body)) {
        resolve(body);
      } else {
        resolve({ ok: false, error: xhr.status === 413 ? "image_too_large" : "ai_failed" });
      }
    };
    xhr.onerror = () => resolve({ ok: false, error: "Failed to fetch" });
    xhr.ontimeout = () => resolve({ ok: false, error: "ai_timeout" });
    xhr.onabort = () => resolve({ ok: false, error: "aborted" });
    signal?.addEventListener("abort", () => xhr.abort(), { once: true });

    const form = new FormData();
    form.append("image", image, "meal.jpg");
    xhr.send(form);
  });
}

function isAnalyzeResponse(value: unknown): value is AnalyzeResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.ok === true) return typeof record.analysis === "object" && record.analysis !== null;
  return record.ok === false && typeof record.error === "string";
}
