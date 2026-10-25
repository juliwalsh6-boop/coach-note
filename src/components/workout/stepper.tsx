"use client";

import { useId } from "react";
import { IconMinus, IconPlus } from "@/components/ui/icons";
import { cn } from "@/lib/cn";

type StepperProps = {
  label: string;
  unit: string;
  value: string;
  onChange: (value: string) => void;
  onStep: (delta: 1 | -1) => void;
  inputMode: "decimal" | "numeric";
  placeholder?: string;
  disabled?: boolean;
};

const STEP_BUTTON =
  "flex w-14 shrink-0 items-center justify-center rounded-2xl bg-rubber text-chalk active:bg-line disabled:opacity-40";

/**
 * 片手で操作できる −/＋ 付きの数値入力。
 * 項目名と単位は数字の上に小さく出し、横幅を数字に使う（320px 幅でも 142.5 が収まる）。
 */
export function Stepper({ label, unit, value, onChange, onStep, inputMode, placeholder, disabled }: StepperProps) {
  const id = useId();
  const long = value.length >= 5;
  return (
    <div className="flex h-16 items-stretch gap-2">
      <button
        type="button"
        onClick={() => onStep(-1)}
        disabled={disabled}
        aria-label={`${label}を減らす`}
        className={STEP_BUTTON}
      >
        <IconMinus size={24} strokeWidth={2.4} />
      </button>
      <div className="relative min-w-0 flex-1 rounded-2xl border border-transparent focus-within:border-plate-blue-bright focus-within:bg-iron">
        <label
          htmlFor={id}
          className="pointer-events-none absolute inset-x-0 top-1.5 text-center text-[11px] leading-none font-bold text-ash"
        >
          {label}
          <span className="ml-1 font-normal">{unit}</span>
        </label>
        <input
          id={id}
          type="text"
          inputMode={inputMode}
          autoComplete="off"
          enterKeyHint="done"
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          onFocus={(e) => e.currentTarget.select()}
          className={cn(
            "num h-full w-full rounded-2xl bg-transparent px-1 pt-3.5 text-center leading-none font-extrabold text-chalk placeholder:text-xl placeholder:font-bold placeholder:text-ash/70 focus:outline-none",
            long ? "text-[27px]" : "text-[33px]",
          )}
        />
      </div>
      <button
        type="button"
        onClick={() => onStep(1)}
        disabled={disabled}
        aria-label={`${label}を増やす`}
        className={STEP_BUTTON}
      >
        <IconPlus size={24} strokeWidth={2.4} />
      </button>
    </div>
  );
}
