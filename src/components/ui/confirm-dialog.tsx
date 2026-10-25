"use client";

import { createContext, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { buttonClasses } from "./button";

export type ConfirmOptions = {
  title: string;
  message?: string;
  /** 実行ボタンの文言（例: 「削除」「完了する」） */
  confirmLabel?: string;
  cancelLabel?: string;
  /** 削除・破棄など取り消せない操作は "danger" */
  tone?: "default" | "danger";
};

type Confirm = (options: ConfirmOptions) => Promise<boolean>;
type Pending = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<Confirm | null>(null);

/**
 * 画面内に出す確認シート。
 * ブラウザ標準の confirm() は見た目を揃えられず、埋め込み表示などでは出ないこともあるため、こちらを使う。
 */
export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const pendingRef = useRef<Pending | null>(null);

  const confirm = useCallback<Confirm>(
    (options) =>
      new Promise<boolean>((resolve) => {
        // 前の確認が残っていればキャンセル扱いにする
        pendingRef.current?.resolve(false);
        const next = { ...options, resolve };
        pendingRef.current = next;
        setPending(next);
      }),
    [],
  );

  const settle = useCallback((value: boolean) => {
    const current = pendingRef.current;
    pendingRef.current = null;
    setPending(null);
    current?.resolve(value);
  }, []);

  useEffect(() => () => pendingRef.current?.resolve(false), []);

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {pending ? <ConfirmSheet options={pending} onSettle={settle} /> : null}
    </ConfirmContext.Provider>
  );
}

function ConfirmSheet({ options, onSettle }: { options: ConfirmOptions; onSettle: (value: boolean) => void }) {
  const titleId = useId();
  const messageId = useId();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const danger = options.tone === "danger";

  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    // 取り消せない操作では「キャンセル」側に最初のフォーカスを置く
    (danger ? cancelRef.current : confirmRef.current)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onSettle(false);
      } else if (event.key === "Tab") {
        const items = [cancelRef.current, confirmRef.current].filter((el): el is HTMLButtonElement => el !== null);
        const index = items.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();
        items[(index + (event.shiftKey ? items.length - 1 : 1)) % items.length]?.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      previous?.focus({ preventScroll: true });
    };
  }, [danger, onSettle]);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)] min-[560px]:items-center"
      onClick={() => onSettle(false)}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={options.message ? messageId : undefined}
        className="animate-sheet-in w-full max-w-[440px] rounded-[24px] border border-line bg-steel p-5 shadow-[0_16px_48px_rgba(0,0,0,0.55)]"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="text-lg leading-snug font-bold text-balance">
          {options.title}
        </h2>
        {options.message ? (
          <p id={messageId} className="mt-2 text-sm leading-relaxed text-ash">
            {options.message}
          </p>
        ) : null}
        <div className="mt-6 grid grid-cols-2 gap-2">
          <button ref={cancelRef} type="button" className={buttonClasses("secondary", "lg")} onClick={() => onSettle(false)}>
            {options.cancelLabel ?? "キャンセル"}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={buttonClasses(danger ? "destructive" : "primary", "lg")}
            onClick={() => onSettle(true)}
          >
            {options.confirmLabel ?? "OK"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 確認シートを出し、実行が選ばれたら true を返す */
export function useConfirm(): Confirm {
  const confirm = useContext(ConfirmContext);
  if (confirm) return confirm;
  // Provider の外で使われた場合はブラウザ標準の確認ダイアログで代用
  return async (options) => window.confirm(options.message ? `${options.title}\n${options.message}` : options.title);
}
