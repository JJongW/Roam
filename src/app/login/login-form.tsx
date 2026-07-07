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

/** Only same-origin relative paths are honored as the post-login destination. */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export function LoginForm() {
  const next = safeNext(useSearchParams().get("next"));
  const login = useAuthStore((s) => s.login);

  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function google() {
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
      // Hard navigation so the middleware re-evaluates with the fresh cookie.
      window.location.assign(next);
    } catch (e) {
      setError(
        e instanceof ApiClientError ? e.error.message : "로그인에 실패했어요",
      );
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      <div className="mb-8 text-center">
        <h1 className="text-3xl font-bold tracking-tight">Roam</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          로그인하고 전시를 나만의 동선으로 둘러보세요.
        </p>
      </div>

      {hasSupabase && (
        <>
          <Button
            variant="outline"
            size="lg"
            className="w-full"
            onClick={google}
          >
            <GoogleIcon />
            Google로 계속하기
          </Button>
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground">또는 닉네임</span>
            <div className="h-px flex-1 bg-border" />
          </div>
        </>
      )}

      <div className="space-y-3">
        <Input
          value={nickname}
          onChange={(e) => {
            setNickname(e.target.value);
            setError(null);
          }}
          placeholder="닉네임 (2–20자)"
          maxLength={20}
          autoFocus
          aria-label="닉네임"
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
          {busy ? "확인 중" : "닉네임으로 시작하기"}
        </Button>
        <p className="text-center text-xs text-muted-foreground">
          비밀번호는 없어요. 이미 쓰이는 닉네임은 선택할 수 없어요.
        </p>
      </div>
    </div>
  );
}
