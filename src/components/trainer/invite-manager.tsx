"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { IconCopy, IconShare, IconTrash } from "@/components/ui/icons";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { useToast } from "@/components/ui/toaster";
import { APP_NAME } from "@/lib/config";
import { cn } from "@/lib/cn";
import { createInvite, deleteInvite, inviteStatusOf } from "@/lib/data/trainer";
import { formatDateShort, toISODate } from "@/lib/dates";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";
import type { ClientInvite } from "@/types/app";

function inviteUrl(code: string): string {
  return `${window.location.origin}/join/${code}`;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** 招待リンクの作成・共有・削除 */
export function InviteManager({ invites, trainerName }: { invites: ClientInvite[]; trainerName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const confirm = useConfirm();
  const [label, setLabel] = useState("");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<ClientInvite | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const createdRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (created) createdRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [created]);

  async function create() {
    setCreating(true);
    try {
      const invite = await createInvite(createClient(), label.trim() || null);
      setCreated(invite);
      setLabel("");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setCreating(false);
    }
  }

  async function share(invite: ClientInvite) {
    const url = inviteUrl(invite.code);
    const text = `${trainerName}さんから${APP_NAME}への招待です。リンクを開いて登録してください。`;
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: APP_NAME, text, url });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    const ok = await copyText(`${text}\n${url}`);
    toast(ok ? "招待リンクをコピーしました" : "コピーできませんでした。リンクを長押ししてコピーしてください。", ok ? "success" : "error");
  }

  async function copy(invite: ClientInvite) {
    const ok = await copyText(inviteUrl(invite.code));
    toast(ok ? "リンクをコピーしました" : "コピーできませんでした。リンクを長押ししてコピーしてください。", ok ? "success" : "error");
  }

  async function remove(invite: ClientInvite) {
    const ok = await confirm({
      title: "この招待リンクを削除しますか？",
      message: "削除したリンクからは登録できなくなります。",
      confirmLabel: "削除",
      tone: "danger",
    });
    if (!ok) return;
    setDeletingId(invite.id);
    try {
      await deleteInvite(createClient(), invite.id);
      if (created?.id === invite.id) setCreated(null);
      toast("招待リンクを削除しました", "success");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="space-y-8">
      {created ? (
        <section ref={createdRef} className="panel scroll-mt-4 border-plate-blue/60 p-5" aria-live="polite">
          <h2 className="font-bold">招待リンクを作成しました</h2>
          <p className="mt-1 text-sm text-ash">LINE などでクライアントに送ってください。</p>
          <InviteLinkBox code={created.code} />
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Button variant="primary" onClick={() => void share(created)}>
              <IconShare size={18} />
              送る
            </Button>
            <Button variant="secondary" onClick={() => void copy(created)}>
              <IconCopy size={18} />
              コピー
            </Button>
          </div>
        </section>
      ) : null}

      <form
        className="panel space-y-4 p-5"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
      >
        <FormField label="誰に送るか（メモ）" optional hint="自分用のメモです。クライアントには表示されません。">
          {(props) => (
            <input
              {...props}
              className="field"
              maxLength={40}
              placeholder="例: 田中さん"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          )}
        </FormField>
        <Button type="submit" size="lg" block loading={creating}>
          招待リンクを作成
        </Button>
        <p className="text-xs leading-relaxed text-ash">
          リンクは1人1回だけ使えます。有効期限は14日間です。クライアントがリンクから登録すると、自動であなたの担当になります。
        </p>
      </form>


      <section>
        <h2 className="mb-3 text-[17px] font-bold">発行した招待リンク</h2>
        {invites.length === 0 ? (
          <p className="text-sm text-ash">まだありません。</p>
        ) : (
          <ul className="overflow-hidden rounded-[20px] border border-line bg-steel">
            {invites.map((invite) => {
              const status = inviteStatusOf(invite);
              return (
                <li key={invite.id} className="flex items-center gap-2 border-b border-line py-3 pr-2 pl-4 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="min-w-0 truncate font-bold">{invite.label ?? "メモなし"}</p>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold",
                          status === "valid" && "bg-plate-blue/20 text-plate-blue-bright",
                          status === "used" && "bg-plate-green/15 text-plate-green-bright",
                          status === "expired" && "bg-rubber text-ash",
                        )}
                      >
                        {status === "valid" ? "未使用" : status === "used" ? "使用済み" : "期限切れ"}
                      </span>
                    </div>
                    <p className="num mt-0.5 text-xs text-ash">
                      {invite.code}
                      <span className="mx-1.5 text-line">/</span>
                      <span className="whitespace-nowrap">
                        {status === "used" && invite.used_at
                          ? `${formatDateShort(toISODate(new Date(invite.used_at)))} 登録済み`
                          : status === "expired"
                            ? `有効期限 ${formatDateShort(toISODate(new Date(invite.expires_at)))}`
                            : `${formatDateShort(toISODate(new Date(invite.expires_at)))} まで有効`}
                      </span>
                    </p>
                  </div>
                  {status === "valid" ? (
                    <button
                      type="button"
                      onClick={() => void share(invite)}
                      aria-label="招待リンクを送る"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-chalk active:bg-rubber"
                    >
                      <IconShare size={18} />
                    </button>
                  ) : null}
                  {status !== "used" ? (
                    <button
                      type="button"
                      onClick={() => void remove(invite)}
                      disabled={deletingId === invite.id}
                      aria-label="招待リンクを削除"
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-ash active:bg-rubber disabled:opacity-40"
                    >
                      <IconTrash size={18} />
                    </button>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function InviteLinkBox({ code }: { code: string }) {
  const [url] = useState(() => (typeof window === "undefined" ? `/join/${code}` : inviteUrl(code)));
  return (
    <div className="mt-4 rounded-xl border border-line bg-iron p-3">
      <p className="text-xs text-ash">招待コード</p>
      <p className="num text-2xl font-extrabold tracking-wider">{code}</p>
      <p className="mt-2 text-xs break-all text-plate-blue-bright select-all">{url}</p>
    </div>
  );
}
