"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { ApiClientError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { hasSupabase } from "@/lib/env";
import { useAuthStore } from "@/lib/stores/auth";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

/** Only same-origin relative paths are honored as the post-login destination. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export function LoginForm() {
  const t = useT();
  const next = safeNext(useSearchParams().get("next"));
  const login = useAuthStore((s) => s.login);

  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 실패해도 브라우저는 그대로 있는다 — signInWithOAuth가 성공하면 리디렉트로 화면이
  // 떠나므로, 여기 도달했다는 건 곧 실패했다는 뜻이다. 예전엔 반환값을 통째로 버려서
  // (provider 미설정·redirect_to 거부·네트워크 단절) 버튼을 눌러도 아무 일도 일어나지
  // 않았고, 사용자는 물론 우리도 원인을 알 수 없었다.
  async function google() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    try {
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        console.error("[login] signInWithOAuth failed", oauthError);
        setError(t("login.failed"));
        setBusy(false);
      }
      // 성공이면 리디렉트가 시작된다 — busy를 켠 채로 두어 중복 클릭을 막는다.
    } catch (e) {
      console.error("[login] signInWithOAuth threw", e);
      setError(t("login.failed"));
      setBusy(false);
    }
  }

  async function submit() {
    const name = nickname.trim();
    if (name.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(name);
      // Hard navigation so the middleware re-evaluates with the fresh cookie.
      window.location.assign(next);
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.error.message : t("login.failed"),
      );
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Roam</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("login.subtitle")}
        </p>
        {/* 로그인은 계정 벽이 아니라 기억 설정 — 취향을 다음 전시로 잇는다는 걸 명시. */}
        <p className="mx-auto mt-2 max-w-[17rem] text-xs leading-relaxed text-muted-foreground/80">
          {t("login.memoryNote")}
        </p>
      </div>

      {/* 실사용자를 받는 배포(hasSupabase=true)에서는 신규 가입을 Google 계정으로만
          받는다 — 닉네임 무비번 가입은 계정 진위를 확인할 방법이 없다. 이미 닉네임
          으로 만든 계정·세션은 쿠키가 살아있는 한 그대로 로그인 상태를 유지한다
          (이 폼을 숨긴다고 로그인 API 자체를 지우는 게 아니다). Supabase 키가 없는
          로컬 개발(mock 모드)만 예외 — 그쪽엔 Google 버튼이 애초에 안 뜨니(아래)
          닉네임을 남겨야 로컬에서 로그인 자체가 가능하다. */}
      {hasSupabase ? (
        <Button
          variant="outline"
          size="lg"
          className="w-full"
          onClick={google}
          disabled={busy}
        >
          <GoogleIcon />
          {t("login.google")}
        </Button>
      ) : (
        <div className="space-y-3">
          <Input
            value={nickname}
            onChange={(e) => {
              setNickname(e.target.value);
              setError(null);
            }}
            placeholder={t("login.placeholder")}
            maxLength={20}
            autoFocus
            aria-label={t("login.placeholder")}
            aria-invalid={Boolean(error)}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter") submit();
            }}
          />
          {error && (
            <p className="text-sm font-medium text-destructive">{error}</p>
          )}
          <Button
            size="lg"
            className="w-full"
            disabled={busy || nickname.trim().length < 2}
            onClick={submit}
          >
            {busy && <Loader2 className="size-5 animate-spin" />}
            {busy ? t("login.checking") : t("login.submit")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            {t("login.noPassword")}
          </p>
        </div>
      )}
    </div>
  );
}
