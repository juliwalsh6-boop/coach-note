import { APP_NAME } from "@/lib/config";

/** ログイン・登録画面の共通レイアウト */
export function AuthShell({
  title,
  lead,
  children,
  footer,
}: {
  title: string;
  lead?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-[440px] flex-col px-5 pt-safe pb-10">
      <div className="pt-12 pb-8">
        <p className="num text-[15px] font-extrabold tracking-wide text-chalk">
          {APP_NAME}
          <span className="ml-2 inline-block h-2.5 w-2.5 rounded-full bg-plate-blue align-middle" aria-hidden="true" />
        </p>
        <h1 className="mt-6 text-[28px] leading-tight font-bold">{title}</h1>
        {lead ? <div className="mt-2 text-sm leading-relaxed text-ash">{lead}</div> : null}
      </div>
      <div className="flex-1">{children}</div>
      {footer ? <div className="mt-10 text-center text-sm text-ash">{footer}</div> : null}
    </main>
  );
}
