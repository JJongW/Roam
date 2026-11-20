"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { hasSupabase } from "@/lib/env";
import { clearLoginStarted, markLoginStarted, useAuthStore } from "@/lib/stores/auth";
import { GoogleIcon } from "@/components/auth/google-icon";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { LegalLinks } from "@/components/common/legal-links";
import { Input } from "@/components/ui/input";
import { Field } from "@/components/ui/field";
import { useT } from "@/lib/i18n/provider";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";

/** Only same-origin relative paths are honored as the post-login destination. */
export function safeNext(raw: string | null | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

/**
 * UI 5-04 로그인(Figma 2995:3394)과 5-07 로그인이 안 됐을 때(2995:3878)의 내용.
 * 지금 화면 위에 올라오는 시트(`LoginSheet`)와 주소로 바로 들어온 `/login` 페이지가 같이 쓴다.
 *
 * - 로그인은 입장 조건이 아니다(브랜드 규칙 §4). "로그인 없이 둘러보기"로 언제든 돌아간다(5-06).
 * - 웹의 실제 방식만 둔다. 운영(Supabase 있음)은 Google 하나다(iOS는 Apple). 닉네임 무비번 가입은 계정 진위를
 *   확인할 수 없어 운영에서 숨기고, Supabase 키가 없는 로컬(mock)에서만 닉네임 칸을 둔다(닉네임 로그인 자체는
 *   기존 계정 때문에 보류 중이라 지우지 않는다, CLAUDE.md 로그인 게이트).
 * - Google 창에서 사용자가 취소하면(`denied`) 실패가 아니라 그냥 첫 화면이다(5-07 상태 규칙).
 *   그 밖의 실패(교환 실패 등)는 5-07. 이유는 보여 주지 않고 콘솔과 서버 로그에만 남긴다.
 */
export function LoginPanel({
  next,
  source,
  returned,
  via,
  onSkip,
  onNicknameDone,
}: {
  /** 로그인한 뒤 갈 곳. 시트는 지금 화면, 페이지는 `?next=`. */
  next: string;
  /** 어디서 불렀는지(이벤트 props.source, 5-05 login_complete source). */
  source: string;
  /** Google에서 돌아온 실패 이유(`login_error`). */
  returned: string | null;
  /** "sheet"면 Google 실패를 시트로 돌려받는다(auth/callback이 `next`로 돌려보낸다). */
  via: "sheet" | "page";
  /** 5-06 로그인 없이 계속(실패 뒤에는 나중에 할게요). */
  onSkip: (failed: boolean) => void;
  /** 닉네임(mock) 로그인을 마친 뒤. */
  onNicknameDone: () => void;
}) {
  const t = useT();
  const login = useAuthStore((s) => s.login);
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
    const params = new URLSearchParams({ next });
    if (via === "sheet") params.set("via", "sheet");
    const redirectTo = `${window.location.origin}/auth/callback?${params.toString()}`;
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
    // login()이 동기화 뒤 이 표시를 읽고 5-05를 한 번 띄운다.
    markLoginStarted(source);
    try {
      await login(name);
      onNicknameDone();
    } catch (e) {
      clearLoginStarted();
      setError(e instanceof ApiClientError ? e.error.message : t("login.failed"));
      setBusy(false);
    }
  }

  function skip() {
    track("login_skip", {
      screen: SCREEN.loginSheet,
      props: { source, kind: failed ? "after_fail" : "sheet" },
    });
    onSkip(failed);
  }

  return (
    <>
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
    </>
  );
}
