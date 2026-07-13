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

  function google() {
    // Redirects the browser to Google; on return, /auth/callback issues the
    // roam_user cookie. Preserve the current page as the post-login target.
    const next = window.location.pathname + window.location.search;
    const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;
    void createClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
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

/** Mounts once near the app root: runs the initial session check. */
export function AuthBootstrap() {
  const refresh = useAuthStore((s) => s.refresh);
  useEffect(() => {
    void refresh();
    // Surface an OAuth failure bounced back from /auth/callback, then strip the
    // query param so a reload doesn't re-toast.
    const params = new URLSearchParams(window.location.search);
    if (params.get("login_error")) {
      toast.error("로그인 못 했어. 다시 해줘.");
      params.delete("login_error");
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
