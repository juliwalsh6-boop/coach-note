import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * 次を除くすべてのパスで実行:
     * - _next/static, _next/image（ビルド済みファイル・画像最適化）
     * - favicon / アイコン / 効果音 / manifest / Service Worker などの静的ファイル
     */
    "/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.webmanifest|sounds/|icons/|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|wav|mp3|m4a)$).*)",
  ],
};
