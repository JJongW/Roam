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
  const fail = (reason: string) =>
    NextResponse.redirect(new URL(`/login?login_error=${reason}`, url.origin));

  if (!hasSupabase) return fail("unavailable");
  // Provider-side error (user denied consent, etc.).
  if (url.searchParams.get("error")) return fail("denied");
  if (!code) return fail("no_code");

  const supabase = await createServerClient();

  const { error: exchangeError } =
    await supabase.auth.exchangeCodeForSession(code);
  if (exchangeError) return fail("exchange");

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
