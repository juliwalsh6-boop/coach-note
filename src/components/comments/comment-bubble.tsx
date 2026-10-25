import Link from "next/link";
import { formatDateTime } from "@/lib/dates";
import type { TrainerComment } from "@/types/app";

/** コメント 1 件の表示 */
export function CommentBubble({
  comment,
  isNew = false,
  sessionHref,
  footer,
}: {
  comment: TrainerComment;
  isNew?: boolean;
  sessionHref?: string | null;
  footer?: React.ReactNode;
}) {
  return (
    <article className="panel p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-ash">
        {isNew ? <span className="rounded-full bg-plate-blue px-2 py-0.5 font-bold text-white">NEW</span> : null}
        <time dateTime={comment.created_at}>{formatDateTime(comment.created_at)}</time>
        {sessionHref ? (
          <Link href={sessionHref} className="text-plate-blue-bright underline underline-offset-4">
            対象のトレーニング
          </Link>
        ) : null}
      </div>
      <p className="mt-2 text-[15px] leading-relaxed whitespace-pre-wrap">{comment.body}</p>
      {footer ? <div className="mt-3">{footer}</div> : null}
    </article>
  );
}
