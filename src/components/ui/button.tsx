import Link from "next/link";
import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { cn } from "@/lib/cn";
import { Spinner } from "./spinner";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger" | "destructive" | "success";
export type ButtonSize = "sm" | "md" | "lg" | "xl";

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: "bg-plate-blue text-white active:bg-[#2753c4] disabled:bg-plate-blue/40 disabled:text-white/60",
  secondary:
    "bg-rubber text-chalk border border-line active:bg-line disabled:text-ash/60 disabled:border-line/60",
  ghost: "bg-transparent text-ash active:bg-rubber disabled:text-ash/40",
  danger: "bg-transparent text-plate-red-bright border border-plate-red/50 active:bg-plate-red/15 disabled:opacity-50",
  destructive: "bg-plate-red text-white active:bg-[#c73c41] disabled:opacity-50",
  success: "bg-plate-green text-iron active:bg-[#2c9a5a] disabled:opacity-50",
};

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: "min-h-9 px-3 text-sm rounded-[10px] gap-1.5",
  md: "min-h-12 px-4 text-[15px] rounded-xl gap-2",
  lg: "min-h-14 px-5 text-base rounded-2xl gap-2",
  xl: "min-h-16 px-6 text-lg rounded-2xl gap-2",
};

export function buttonClasses(variant: ButtonVariant = "primary", size: ButtonSize = "md", block = false): string {
  return cn(
    "inline-flex shrink-0 select-none items-center justify-center whitespace-nowrap font-bold transition-colors duration-100",
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    block && "w-full",
  );
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  block = false,
  loading = false,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonClasses(variant, size, block), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? <Spinner size={18} /> : null}
      {children}
    </button>
  );
}

type LinkButtonProps = ComponentProps<typeof Link> & {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
};

export function LinkButton({ variant = "primary", size = "md", block = false, className, ...props }: LinkButtonProps) {
  return <Link className={cn(buttonClasses(variant, size, block), className)} {...props} />;
}
