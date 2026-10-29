"use client";

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { cn } from "@/lib/cn";
import { useConfirm, type ConfirmOptions } from "./confirm-dialog";
import { IconX } from "./icons";

// ---------------------------------------------------------------------
// 画面に見えている範囲（キーボード表示中はキーボードの上まで）
// iPhone の Safari ではキーボードを出しても画面の高さが変わらないため、visualViewport で求める
// ---------------------------------------------------------------------
function subscribeViewport(callback: () => void): () => void {
  const viewport = window.visualViewport;
  if (!viewport) return () => undefined;
  viewport.addEventListener("resize", callback);
  viewport.addEventListener("scroll", callback);
  return () => {
    viewport.removeEventListener("resize", callback);
    viewport.removeEventListener("scroll", callback);
  };
}

function viewportSnapshot(): string {
  const viewport = window.visualViewport;
  return viewport ? `${Math.round(viewport.height)}:${Math.round(viewport.offsetTop)}` : "";
}

function useVisibleViewport(): { height: number; top: number } | null {
  const snapshot = useSyncExternalStore(subscribeViewport, viewportSnapshot, () => "");
  if (!snapshot) return null;
  const [height, top] = snapshot.split(":").map(Number);
  return height ? { height, top: top ?? 0 } : null;
}

type SheetProps = {
  open: boolean;
  title: string;
  /** タイトルの下の補足 */
  description?: React.ReactNode;
  onClose: () => void;
  children: React.ReactNode;
  /** 画面下に固定するボタン類 */
  footer?: React.ReactNode;
  /** 入力中の内容がある場合、閉じる前に確認する */
  confirmClose?: ConfirmOptions | null;
  /** full: 画面いっぱい（入力が多いとき） / auto: 内容に合わせた高さ */
  size?: "full" | "auto";
  /** 保存中など、閉じられないとき */
  busy?: boolean;
};

/**
 * 下から出てくるシート。ページを移動せずに追加・編集を行うために使う。
 * キーボードが出ても下のボタンが隠れないよう、見えている範囲に合わせて高さを変える。
 */
export function Sheet({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  confirmClose,
  size = "auto",
  busy = false,
}: SheetProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const viewport = useVisibleViewport();
  const confirm = useConfirm();

  const requestClose = useCallback(async () => {
    if (busy) return;
    if (confirmClose) {
      const ok = await confirm(confirmClose);
      if (!ok) return;
    }
    onClose();
  }, [busy, confirm, confirmClose, onClose]);

  // 開いている間は後ろの画面をスクロールさせない・閉じたらフォーカスを戻す
  useEffect(() => {
    if (!open) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";
    panelRef.current?.focus({ preventScroll: true });
    return () => {
      document.body.style.overflow = overflow;
      previous?.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !document.querySelector('[role="alertdialog"]')) {
        event.preventDefault();
        void requestClose();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open, requestClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-x-0 top-0 z-[55] flex h-dvh flex-col justify-end bg-black/60"
      style={viewport ? { top: viewport.top, height: viewport.height } : undefined}
      onClick={() => void requestClose()}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={cn(
          "animate-sheet-in mx-auto flex w-full max-w-[480px] flex-col border-line bg-steel shadow-[0_-12px_40px_rgba(0,0,0,0.5)] focus:outline-none",
          size === "full"
            ? "h-full border-x min-[481px]:mt-3 min-[481px]:rounded-t-[24px] min-[481px]:border-t"
            : "max-h-[calc(100%-24px)] rounded-t-[24px] border-x border-t",
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div
          className={cn(
            "flex shrink-0 items-start justify-between gap-3 px-4 pt-4 pb-3",
            size === "full" && "pt-[calc(env(safe-area-inset-top)+12px)] min-[481px]:pt-4",
          )}
        >
          <div className="min-w-0">
            <h2 id={titleId} className="text-lg leading-snug font-bold text-balance">
              {title}
            </h2>
            {description ? <div className="mt-0.5 text-sm text-ash">{description}</div> : null}
          </div>
          <button
            type="button"
            onClick={() => void requestClose()}
            disabled={busy}
            aria-label="閉じる"
            className="-mt-1 -mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-ash active:bg-rubber disabled:opacity-40"
          >
            <IconX size={22} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4">{children}</div>
        {footer ? (
          <div className="shrink-0 border-t border-line bg-steel px-4 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            {footer}
          </div>
        ) : (
          <div className="shrink-0 pb-[env(safe-area-inset-bottom)]" />
        )}
      </div>
    </div>
  );
}
