"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";

type ToastTone = "info" | "success" | "error";
type ToastItem = { id: number; message: string; tone: ToastTone };

type ToastContextValue = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: number) => {
    setItems((current) => current.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) clearTimeout(timer);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (message: string, tone: ToastTone = "info") => {
      const id = nextId.current++;
      setItems((current) => [...current.slice(-2), { id, message, tone }]);
      timers.current.set(
        id,
        setTimeout(() => dismiss(id), tone === "error" ? 5000 : 3000),
      );
    },
    [dismiss],
  );

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((timer) => clearTimeout(timer));
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] mx-auto flex max-w-[480px] flex-col gap-2 px-4 pt-[calc(env(safe-area-inset-top)+12px)]"
      >
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => dismiss(item.id)}
            className={cn(
              "pointer-events-auto w-full rounded-xl border px-4 py-3 text-left text-sm font-bold shadow-[0_8px_24px_rgba(0,0,0,0.45)]",
              item.tone === "error" && "border-plate-red/60 bg-[#3a1b1d] text-plate-red-bright",
              item.tone === "success" && "border-plate-green/50 bg-[#16301f] text-plate-green-bright",
              item.tone === "info" && "border-line bg-rubber text-chalk",
            )}
          >
            {item.message}
          </button>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return { toast: () => undefined };
  }
  return ctx;
}
