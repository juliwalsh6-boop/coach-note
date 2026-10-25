import { useId } from "react";

type FormFieldProps = {
  label: string;
  hint?: React.ReactNode;
  error?: string | null;
  optional?: boolean;
  children: (props: { id: string; "aria-describedby"?: string; "aria-invalid"?: boolean }) => React.ReactNode;
};

/** ラベル・補足・エラー表示つきの入力欄 */
export function FormField({ label, hint, error, optional, children }: FormFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(" ") || undefined;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="flex items-baseline gap-2 text-sm font-bold">
        {label}
        {optional ? <span className="text-xs font-normal text-ash">任意</span> : null}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint ? (
        <p id={hintId} className="text-xs text-ash">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-xs text-plate-red-bright">
          {error}
        </p>
      ) : null}
    </div>
  );
}
