import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { getRepository } from "@/lib/repositories";
import { setUserCookie } from "@/lib/api/http";
import { uniqueNickname } from "@/lib/auth/oauth-nickname";
import { hasSupabase } from "@/lib/env";

/**
 * OAuth redirect target. The browser hits this after the provider (Google)
 * bounces back with an authorization `code`. We exchange it for a Supabase
 * session just long enough to read the verified identity, then map it onto our
 * own `app_user` and issue the app's `roam_user` cookie — the single identity
 * the rest of the app already understands. The Supabase session itself is not
 * kept (we sign out), so logout stays one code path (clear `roam_user`).
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  // Only allow same-origin relative paths as the post-login destination.
  const nextParam = url.searchParams.get("next");
  const next = nextParam && nextParam.startsWith("/") ? nextParam : "/";

  // Failures land back on the gate (home is itself gated) with an error flag
  // that AuthBootstrap surfaces as a toast.
  //
  // 서버 로그에도 반드시 남긴다 — 예전엔 이유가 쿼리 파라미터로만 갔고, 클라이언트가
  // 토스트를 띄운 뒤 그 파라미터를 곧바로 지웠다(history.replaceState). 그래서 사용자도
  // 우리도 "로그인 못 했어" 한 줄 말고는 아무 단서가 없었다. provider 쪽 에러 설명과
  // 교환 실패 메시지는 여기서만 볼 수 있다.
  // 이유는 서버 로그와 클라이언트 콘솔 **양쪽**에 남긴다. 예전엔 쿼리 파라미터로만
  // 갔고 AuthBootstrap이 토스트를 띄운 뒤 곧바로 지워서(history.replaceState),
  // "로그인 못 했어" 한 줄 말고는 사용자도 우리도 단서가 없었다. detail은 URL에
  // 실려 가지만 AuthBootstrap이 읽어 콘솔에 찍고 즉시 지우므로 주소창에 남지 않는다.
  const fail = (reason: string, detail?: string) => {
    console.error("[auth/callback] failed", {
      reason,
      detail,
      providerError: url.searchParams.get("error"),
      providerErrorDescription: url.searchParams.get("error_description"),
      hasCode: Boolean(code),
    });
    const target = new URL("/login", url.origin);
    target.searchParams.set("login_error", reason);
    if (detail) target.searchParams.set("login_detail", detail.slice(0, 160));
    return NextResponse.redirect(target);
  };

  if (!hasSupabase) return fail("unavailable");
  // Provider-side error (user denied consent, etc.).
  if (url.searchParams.get("error")) return fail("denied");
  if (!code) return fail("no_code");

  const supabase = await createServerClient();

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return fail("exchange", exchangeError.message);

  const {
    data: { user: authUser },
  } = await supabase.auth.getUser();
  if (!authUser) return fail("no_user");

  const provider = authUser.app_metadata?.provider ?? "google";
  const meta = authUser.user_metadata ?? {};
  const email =
    authUser.email ?? (typeof meta.email === "string" ? meta.email : undefined);
  const name =
    (typeof meta.name === "string" && meta.name) ||
    (typeof meta.full_name === "string" && meta.full_name) ||
    undefined;
  const avatarUrl =
    (typeof meta.avatar_url === "string" && meta.avatar_url) ||
    (typeof meta.picture === "string" && meta.picture) ||
    undefined;

  const repo = await getRepository();
  let appUser = await repo.getUserByProvider(provider, authUser.id);
  if (!appUser) {
    const nickname = await uniqueNickname(repo, { name, email });
    appUser = await repo.createOAuthUser({
      provider,
      providerAccountId: authUser.id,
      nickname,
      email,
      avatarUrl,
    });
  }

  await setUserCookie(appUser.id);
  // Drop the Supabase session — the app's own cookie is the source of truth.
  try {
    await supabase.auth.signOut();
  } catch {
    /* non-critical */
  }

  return NextResponse.redirect(new URL(next, url.origin));
}
