"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** 招待コードを手入力してトレーナーとつながる */
export function JoinByCodeForm() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const normalized = code.replace(/\s+/g, "").toUpperCase();

  return (
    <form
      className="mt-4 flex gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (normalized) router.push(`/join/${encodeURIComponent(normalized)}`);
      }}
    >
      <label className="sr-only" htmlFor="invite-code">
        招待コード
      </label>
      <input
        id="invite-code"
        className="field num flex-1 tracking-wider uppercase"
        placeholder="招待コード"
        autoCapitalize="characters"
        autoComplete="off"
        maxLength={20}
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <Button type="submit" disabled={!normalized}>
        確認
      </Button>
    </form>
  );
}
