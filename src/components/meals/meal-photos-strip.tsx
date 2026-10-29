"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { IconImage, IconTrash, IconX } from "@/components/ui/icons";
import type { MealPhoto } from "@/types/app";

/** 食事写真のサムネイル。タップで大きく表示（本人は削除もできる） */
export function MealPhotosStrip({
  photos,
  urls,
  onLoadError,
  onDelete,
  label,
}: {
  photos: MealPhoto[];
  urls: Record<string, string>;
  onLoadError: () => void;
  onDelete?: (photo: MealPhoto) => Promise<void>;
  label: string;
}) {
  const [opened, setOpened] = useState<MealPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (photos.length === 0) return null;

  const openedUrl = opened ? urls[opened.storage_path] : undefined;

  return (
    <>
      <ul className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none]" aria-label={`${label}の写真`}>
        {photos.map((photo, index) => {
          const url = urls[photo.storage_path];
          return (
            <li key={photo.id} className="shrink-0">
              <button
                type="button"
                onClick={() => setOpened(photo)}
                className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-xl border border-line bg-rubber active:opacity-80"
                aria-label={`${label}の写真 ${index + 1} を大きく表示`}
              >
                {url ? (
                  // 署名付き URL（Supabase Storage）は next/image の最適化を通さずに表示する
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" onError={onLoadError} />
                ) : (
                  <IconImage size={22} className="text-ash" />
                )}
              </button>
            </li>
          );
        })}
      </ul>

      {opened ? (
        <div className="fixed inset-0 z-[58] flex flex-col bg-black/95 pt-safe pb-safe" role="dialog" aria-modal="true" aria-label="食事の写真">
          <div className="flex items-center justify-between gap-2 px-3 py-2">
            {onDelete ? (
              <Button
                variant="danger"
                size="sm"
                loading={deleting}
                onClick={async () => {
                  setDeleting(true);
                  try {
                    await onDelete(opened);
                    setOpened(null);
                  } finally {
                    setDeleting(false);
                  }
                }}
              >
                {deleting ? null : <IconTrash size={16} />}
                写真を削除
              </Button>
            ) : (
              <span />
            )}
            <button
              type="button"
              onClick={() => setOpened(null)}
              className="flex h-11 w-11 items-center justify-center rounded-xl text-chalk active:bg-rubber"
              aria-label="閉じる"
            >
              <IconX size={24} />
            </button>
          </div>
          <div className="flex min-h-0 flex-1 items-center justify-center p-3" onClick={() => setOpened(null)}>
            {openedUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={openedUrl} alt={`${label}の写真`} className="max-h-full max-w-full rounded-xl object-contain" />
            ) : (
              <p className="text-sm text-ash">写真を読み込めませんでした。</p>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
