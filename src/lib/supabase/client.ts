import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";
import { getSupabaseEnv } from "./env";

/** ブラウザ（Client Component）用の Supabase クライアント */
export function createClient() {
  const { url, key } = getSupabaseEnv();
  return createBrowserClient<Database>(url, key);
}

export type BrowserSupabase = ReturnType<typeof createClient>;
