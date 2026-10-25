"use client";

import { Button } from "@/components/ui/button";

export function ReloadButton() {
  return (
    <Button size="lg" block onClick={() => window.location.reload()}>
      再読み込み
    </Button>
  );
}
