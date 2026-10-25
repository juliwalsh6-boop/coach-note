"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toaster";
import { updateDisplayName } from "@/lib/data/profiles";
import { toErrorMessage } from "@/lib/errors";
import { createClient } from "@/lib/supabase/client";

export function DisplayNameForm({ userId, initialName }: { userId: string; initialName: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const [name, setName] = useState(initialName);
  const [saving, setSaving] = useState(false);
  const trimmed = name.trim();
  const changed = trimmed !== initialName && trimmed.length > 0;

  async function save() {
    if (!changed) return;
    setSaving(true);
    try {
      await updateDisplayName(createClient(), userId, trimmed);
      toast("表示名を変更しました", "success");
      router.refresh();
    } catch (e) {
      toast(toErrorMessage(e), "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <FormField label="表示名">
        {(props) => (
          <input
            {...props}
            className="field"
            maxLength={40}
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        )}
      </FormField>
      <Button type="submit" variant="secondary" block loading={saving} disabled={!changed}>
        表示名を保存
      </Button>
    </form>
  );
}
