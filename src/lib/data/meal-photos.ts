import { getSupabaseEnv } from "@/lib/supabase/env";
import type { MealPhoto } from "@/types/app";
import type { DB } from "./db";

/** 食事写真のバケット（非公開。表示は署名付き URL） */
export const MEAL_PHOTO_BUCKET = "meal-photos";

/** 署名付き URL の有効期限（秒） */
export const PHOTO_URL_TTL_SECONDS = 60 * 60;

/** 保存先のパス: <クライアントの id>/<ランダムな id>.jpg（DB と Storage のポリシーで本人のフォルダだけ書き込める） */
export function newPhotoPath(clientId: string, photoId: string): string {
  return `${clientId}/${photoId}.jpg`;
}

/**
 * 写真をアップロードする（進捗つき）。
 * 進捗を取るために XMLHttpRequest で Storage の API を直接呼ぶ。使えない環境では supabase-js で送る。
 */
export async function uploadMealPhoto(
  db: DB,
  path: string,
  blob: Blob,
  onProgress?: (ratio: number) => void,
): Promise<void> {
  const { data } = await db.auth.getSession();
  const token = data.session?.access_token;
  const { url, key } = getSupabaseEnv();

  if (token && typeof XMLHttpRequest !== "undefined") {
    await new Promise<void>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${url}/storage/v1/object/${MEAL_PHOTO_BUCKET}/${path}`);
      xhr.setRequestHeader("authorization", `Bearer ${token}`);
      xhr.setRequestHeader("apikey", key);
      xhr.setRequestHeader("content-type", blob.type || "image/jpeg");
      xhr.setRequestHeader("x-upsert", "false");
      xhr.setRequestHeader("cache-control", "max-age=3600");
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) onProgress(event.loaded / event.total);
      };
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          onProgress?.(1);
          resolve();
        } else {
          reject(new Error("photo_upload_failed"));
        }
      };
      xhr.onerror = () => reject(new Error("Failed to fetch"));
      xhr.ontimeout = () => reject(new Error("Failed to fetch"));
      xhr.timeout = 60_000;
      xhr.send(blob);
    });
    return;
  }

  const { error } = await db.storage.from(MEAL_PHOTO_BUCKET).upload(path, blob, {
    contentType: blob.type || "image/jpeg",
    upsert: false,
  });
  if (error) throw new Error("photo_upload_failed");
  onProgress?.(1);
}

/** 署名付き URL（期限つき）。見えない写真は含まれない */
export async function getPhotoUrls(db: DB, paths: string[]): Promise<Record<string, string>> {
  if (paths.length === 0) return {};
  const { data, error } = await db.storage.from(MEAL_PHOTO_BUCKET).createSignedUrls(paths, PHOTO_URL_TTL_SECONDS);
  if (error) throw error;
  const result: Record<string, string> = {};
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl && !entry.error) result[entry.path] = entry.signedUrl;
  }
  return result;
}

/**
 * 写真を削除する（本人のみ）。先にファイルを消してから記録を消す
 * （記録だけ消えてファイルが残る＝写真が残り続ける、という状態を避ける）。
 */
export async function deleteMealPhoto(db: DB, photo: Pick<MealPhoto, "id" | "storage_path">): Promise<void> {
  const { error: storageError } = await db.storage.from(MEAL_PHOTO_BUCKET).remove([photo.storage_path]);
  if (storageError) throw storageError;
  const { error } = await db.from("meal_photos").delete().eq("id", photo.id);
  if (error) throw error;
}

/** 保存に失敗したときなど、記録につながっていないアップロード済みのファイルを消す（失敗しても無視） */
export async function removeUploadedPhoto(db: DB, path: string): Promise<void> {
  try {
    await db.storage.from(MEAL_PHOTO_BUCKET).remove([path]);
  } catch {
    // 消せなくても記録には影響しない
  }
}
