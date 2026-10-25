import { Fragment } from "react";

/**
 * 「80kg × 8回」のような記録を表示する。
 * - 数字用の幅広フォントでは × が小さく潰れて見えるため、× だけ本文用フォントで描く。
 * - 狭い画面で「2セ／ット」のように途中で折り返さないよう、改行は × の前だけで起きるようにする。
 */
export function SetText({ text, className }: { text: string; className?: string }) {
  const parts = text.split(" × ");
  return (
    <span className={className}>
      {parts.map((part, index) => (
        <Fragment key={index}>
          {index > 0 ? <wbr /> : null}
          <span className="whitespace-nowrap">
            {index > 0 ? <span className="mx-[0.25em] font-sans font-normal opacity-70">×</span> : null}
            {part}
          </span>
        </Fragment>
      ))}
    </span>
  );
}
