"use client";

import { useEffect, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { hasSupabase } from "@/lib/env";
import { useAuthStore } from "@/lib/stores/auth";
import { GoogleIcon } from "@/components/auth/google-icon";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useT } from "@/lib/i18n/provider";

/** Global nickname-login bottom sheet, driven by useAuthStore.loginOpen. */
export function LoginSheet() {
  const t = useT();
  const open = useAuthStore((s) => s.loginOpen);
  const closeLogin = useAuthStore((s) => s.closeLogin);
  const login = useAuthStore((s) => s.login);

  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Redirects the browser to Google; on return, /auth/callback issues the
  // roam_user cookie. Preserve the current page as the post-login target.
  //
  // 반환값을 버리면 안 된다 — 성공 시엔 리디렉트로 화면이 떠나므로, 여기서 error를
  // 받았다는 건 실패했다는 뜻이다. 예전엔 통째로 버려서 버튼을 눌러도 아무 일도
  // 일어나지 않았고 원인도 남지 않았다.
  async function google() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const next = window.location.pathname + window.location.search;
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
      toast.success(`${name} 왔구나, 반가워!`);
      setNickname("");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "로그인 못 했어";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => (o ? null : closeLogin())}>
      <SheetContent side="bottom" className="px-5 pb-8">
        <SheetHeader className="items-center text-center">
          <div className="mb-1 flex size-12 items-center justify-center rounded-2xl bg-secondary">
            <UserRound className="size-6 text-foreground" />
          </div>
          <SheetTitle>{t("login.sheetTitle")}</SheetTitle>
          <SheetDescription>{t("login.sheetDesc")}</SheetDescription>
        </SheetHeader>

        {hasSupabase && (
          <div className="mt-5 space-y-3">
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
            <div className="flex items-center gap-3 py-1">
              <div className="h-px flex-1 bg-border" />
              <span className="text-xs text-muted-foreground">
                {t("login.orNickname")}
              </span>
              <div className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}

        <div className="mt-5 space-y-3">
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
            {busy ? t("login.checking") : t("login.sheetTitle")}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            이미 쓰는 닉네임은 못 골라.
          </p>
        </div>
      </SheetContent>
    </Sheet>
  );
}

/**
 * `/auth/callback`이 실패했을 때 붙여 보내는 이유 → 사용자 문구.
 * 원인마다 다음 행동이 다르므로 한 문장으로 뭉뚱그리지 않는다.
 */
const LOGIN_ERROR_MESSAGE: Record<string, string> = {
  denied: "Google 로그인을 취소했어. 다시 해볼까?",
  unavailable: "지금은 Google 로그인을 쓸 수 없어. 닉네임으로 시작해도 돼.",
  exchange: "로그인 확인에 실패했어. 브라우저를 새로 열고 다시 해줄래?",
  no_code: "로그인 정보가 오다가 끊겼어. 다시 해줘.",
  no_user: "계정 정보를 못 받았어. 다시 해줘.",
};

/** Mounts once near the app root: runs the initial session check. */
export function AuthBootstrap() {
  const refresh = useAuthStore((s) => s.refresh);
  useEffect(() => {
    void refresh();
    // Surface an OAuth failure bounced back from /auth/callback, then strip the
    // query param so a reload doesn't re-toast.
    const params = new URLSearchParams(window.location.search);
    const reason = params.get("login_error");
    if (reason) {
      // 이유를 반드시 콘솔에 남긴다 — 토스트 문구만으로는 어디서 깨졌는지 알 수 없고,
      // 아래에서 쿼리 파라미터를 지우므로 여기서 안 찍으면 단서가 통째로 사라진다.
      console.error("[login] OAuth 실패", {
        reason,
        detail: params.get("login_detail"),
      });
      toast.error(LOGIN_ERROR_MESSAGE[reason] ?? "로그인 못 했어. 다시 해줘.");
      params.delete("login_error");
      params.delete("login_detail");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        window.location.pathname + (qs ? `?${qs}` : ""),
      );
    }
  }, [refresh]);
  return null;
}
