"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { hasSupabase } from "@/lib/env";
import { clearLoginStarted, markLoginStarted, useAuthStore } from "@/lib/stores/auth";
import { GoogleIcon } from "@/components/auth/google-icon";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { LegalLinks } from "@/components/common/legal-links";
import { hasNavigatedInApp } from "@/components/common/nav-tracker";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useT } from "@/lib/i18n/provider";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";

/** Only same-origin relative paths are honored as the post-login destination. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

/**
 * UI 5-04 로그인(Figma 2995:3537)과 5-07 로그인이 안 됐을 때(2995:4021).
 *
 * - 로그인은 입장 조건이 아니다(브랜드 규칙 §4). "로그인 없이 둘러보기"로 언제든 돌아간다(5-06).
 * - 웹의 실제 방식만 둔다. 운영(Supabase 있음)은 Google 하나다(iOS는 Apple). 닉네임 무비번 가입은 계정 진위를
 *   확인할 수 없어 운영에서 숨기고, Supabase 키가 없는 로컬(mock)에서만 닉네임 칸을 둔다(닉네임 로그인 자체는
 *   기존 계정 때문에 보류 중이라 지우지 않는다, CLAUDE.md 로그인 게이트).
 * - Google 창에서 사용자가 취소하면(`login_error=denied`) 실패가 아니라 그냥 첫 화면이다(5-07 상태 규칙).
 *   그 밖의 실패(교환 실패 등)는 5-07. 이유는 보여 주지 않고 콘솔과 서버 로그에만 남긴다.
 * - 시트가 아니라 페이지다. 로그인이 필요한 주소로 바로 온 사람도 같은 화면을 봐야 해서 주소가 필요하다.
 *   대신 내용을 화면 아래(엄지 닿는 자리)에 시트처럼 모았다.
 */
export function LoginForm() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const login = useAuthStore((s) => s.login);
  const source = params.get("from") ?? (params.get("next") ? "gate" : "direct");

  // 첫 렌더의 실패 이유를 붙잡아 둔다(AuthBootstrap이 주소에서 지운다).
  const [returned] = useState(() => params.get("login_error"));
  const [failed, setFailed] = useState(!!returned && returned !== "denied");
  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    track("screen_view", { screen: SCREEN.loginSheet, props: { source } });
    if (returned) clearLoginStarted();
    if (returned === "denied")
      track("login_skip", { screen: SCREEN.loginSheet, props: { source, kind: "google_cancel" } });
    else if (returned)
      track("login_fail", { screen: SCREEN.loginSheet, props: { source, reason: returned } });
    // 열릴 때 한 번
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 실패해도 브라우저는 그대로 있는다 — signInWithOAuth가 성공하면 리디렉트로 화면이
  // 떠나므로, 여기 도달했다는 건 곧 실패했다는 뜻이다.
  async function google() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    markLoginStarted(source);
    try {
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        console.error("[login] signInWithOAuth failed", oauthError);
        track("login_fail", { screen: SCREEN.loginSheet, props: { source, reason: "oauth_start" } });
        clearLoginStarted();
        setFailed(true);
        setBusy(false);
      }
      // 성공이면 리디렉트가 시작된다 — busy를 켠 채로 두어 중복 클릭을 막는다.
    } catch (e) {
      console.error("[login] signInWithOAuth threw", e);
      track("login_fail", { screen: SCREEN.loginSheet, props: { source, reason: "oauth_start" } });
      clearLoginStarted();
      setFailed(true);
      setBusy(false);
    }
  }

  async function submit() {
    // 재진입 가드 — disabled는 리렌더 뒤에야 걸린다.
    if (busy) return;
    const name = nickname.trim();
    if (name.length < 2) return;
    setBusy(true);
    setError(null);
    try {
      await login(name);
      // 이동한 화면에서 5-05를 띄우게 표시를 남기고, 쿠키를 새로 읽도록 전체 이동한다.
      markLoginStarted(source);
      window.location.assign(next);
    } catch (e) {
      setError(e instanceof ApiClientError ? e.error.message : t("login.failed"));
      setBusy(false);
    }
  }

  // 5-06 로그인 없이 계속: 왔던 곳으로. Google을 돌아온 뒤거나 바로 열었으면 앱 안 뒤로 갈 곳이 없어 홈으로.
  function skip() {
    track("login_skip", {
      screen: SCREEN.loginSheet,
      props: { source, kind: failed ? "after_fail" : "sheet" },
    });
    if (!returned && hasNavigatedInApp()) router.back();
    else router.push("/");
  }

  return (
    <main className="flex min-h-dvh flex-col bg-v2-bg-layer-basement font-v2-ui text-v2-fg-neutral">
      <div className="flex-1" />
      <div className="mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)] rounded-t-v2-r6 bg-v2-bg-layer-floating px-v2-x4 pb-safe pt-v2-x8">
        <div className="flex flex-col gap-v2-x6 pb-v2-x4">
          <div className="flex flex-col gap-v2-x3">
            {/* 실패는 서비스가 알리는 말이라 로미를 두지 않는다(UI/로미 시트 머리 설명). */}
            {!failed && <RomiAvatar size="md" />}
            <div className="flex flex-col gap-v2-x2">
              <h1 className="whitespace-pre-line text-v2-t7 font-v2-bold tracking-v2-card-title">
                {failed ? system.loginFailedTitle : system.loginSheetTitle}
              </h1>
              <p className="whitespace-pre-line text-v2-t5 font-v2-regular leading-[var(--roam-v2-line-height-t6-5)] tracking-v2-body text-v2-fg-neutral-muted">
                {failed ? system.loginFailedBody : system.loginSheetBody}
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-v2-x1">
            {hasSupabase ? (
              <button
                type="button"
                onClick={google}
                disabled={busy}
                className="flex h-v2-x13 w-full items-center justify-center gap-v2-x2 rounded-v2-r3-5 bg-v2-bg-neutral-solid text-v2-t5 font-v2-medium text-v2-fg-neutral-inverted active:bg-v2-bg-neutral-solid-pressed disabled:opacity-60"
              >
                {busy ? (
                  <Loader2 aria-hidden className="size-[var(--roam-v2-icon-size-md)] animate-spin" />
                ) : (
                  <span className="flex size-v2-x6 items-center justify-center rounded-v2-full bg-v2-bg-layer-floating">
                    <GoogleIcon />
                  </span>
                )}
                {label.googleLogin}
              </button>
            ) : (
              <div className="flex flex-col gap-v2-x2">
                <Field error={error}>
                  <Input
                    value={nickname}
                    onChange={(e) => {
                      setNickname(e.target.value);
                      setError(null);
                    }}
                    placeholder={t("login.placeholder")}
                    maxLength={20}
                    aria-label={t("login.placeholder")}
                    onKeyDown={(e) => {
                      if (e.nativeEvent.isComposing) return;
                      if (e.key === "Enter") submit();
                    }}
                  />
                </Field>
                <button
                  type="button"
                  onClick={submit}
                  disabled={busy || nickname.trim().length < 2}
                  className="flex h-v2-x13 w-full items-center justify-center gap-v2-x2 rounded-v2-r3-5 bg-v2-bg-neutral-solid text-v2-t5 font-v2-medium text-v2-fg-neutral-inverted active:bg-v2-bg-neutral-solid-pressed disabled:opacity-60"
                >
                  {busy && <Loader2 aria-hidden className="size-[var(--roam-v2-icon-size-md)] animate-spin" />}
                  {label.login}
                </button>
              </div>
            )}
            <button
              type="button"
              onClick={skip}
              className="flex h-v2-x12 w-full items-center justify-center rounded-v2-r2 text-v2-t4 font-v2-medium text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
            >
              {failed ? label.later : label.browseWithoutLogin}
            </button>
          </div>
        </div>
        {/* Google OAuth 심사는 로그인 화면에서 개인정보처리방침에 닿기를 요구한다(legal-links.tsx). */}
        <LegalLinks className="pb-v2-x4 text-v2-t2 text-v2-fg-neutral-muted" />
      </div>
    </main>
  );
}
