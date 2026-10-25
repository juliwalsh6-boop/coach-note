import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";

/**
 * データ取得・保存関数が受け取る Supabase クライアント。
 * サーバー用・ブラウザ用どちらのクライアントも渡せる。
 * アクセス制御はすべてデータベース側（RLS）で行われる。
 */
export type DB = SupabaseClient<Database>;
