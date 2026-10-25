import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/database";
import { hasSupabaseEnv, getSupabaseEnv } from "./env";

/** ログインが必要なパス */
const PROTECTED_PREFIXES = ["/trainer", "/client"];
/** ログイン済みなら開く必要がないパス */
const GUEST_ONLY_PATHS = ["/login", "/signup"];

function matchesPrefix(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

/**
 * リクエストごとに Supabase のセッション（Cookie）を更新し、未ログインなら /login へ送る。
 * ロール（トレーナー / クライアント）の判定は各レイアウトで DB を見て行う。
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  if (!hasSupabaseEnv()) {
    return response;
  }

  const { url, key } = getSupabaseEnv();
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        Object.entries(headers).forEach(([headerName, headerValue]) => response.headers.set(headerName, headerValue));
      },
    },
  });

  // createServerClient と getClaims の間に処理を挟まないこと（セッションが不安定になる）
  const { data } = await supabase.auth.getClaims();
  const isLoggedIn = Boolean(data?.claims?.sub);
  const { pathname, search } = request.nextUrl;

  if (!isLoggedIn && matchesPrefix(pathname, PROTECTED_PREFIXES)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirectWithCookies(loginUrl, response);
  }

  if (isLoggedIn && GUEST_ONLY_PATHS.includes(pathname)) {
    const homeUrl = request.nextUrl.clone();
    homeUrl.pathname = "/";
    homeUrl.search = "";
    return redirectWithCookies(homeUrl, response);
  }

  return response;
}

/** 更新された Cookie とキャッシュ制御ヘッダーを引き継いでリダイレクトする */
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  from.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
  ["cache-control", "expires", "pragma"].forEach((name) => {
    const value = from.headers.get(name);
    if (value) redirect.headers.set(name, value);
  });
  return redirect;
}
