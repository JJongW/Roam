"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Button } from "@/components/ui/button";

/**
 * /admin 게이트 진입 화면. Google 로그인만 있고, 허용된 계정인지는
 * 서버(/auth/callback)가 검증한다. useGoogle=false는 운영에 ADMIN_EMAILS가 없는
 * 상태라 들어갈 길이 없다 — 공유 코드 폴백은 2026-10-01에 없앴다.
 */
export function AdminUnlock({ useGoogle }: { useGoogle: boolean }) {
  const searchParams = useSearchParams();
  const forbidden = searchParams.get("admin_error") === "forbidden";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function google() {
    if (loading) return;
    setLoading(true);
    setError("");
    const redirectTo = `${window.location.origin}/auth/callback?next=/admin`;
    try {
      const { error: oauthError } = await createClient().auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo },
      });
      if (oauthError) {
        setError("Google 로그인에 실패했어요");
        setLoading(false);
      }
    } catch {
      setError("Google 로그인에 실패했어요");
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary">
          <Lock className="size-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-extrabold">운영자 콘솔</h1>
          <p className="text-sm text-muted-foreground">
            {useGoogle
              ? "허용된 계정으로 Google 로그인하면 접근할 수 있어요."
              : "운영자 계정이 아직 설정되지 않았어요. ADMIN_EMAILS를 설정해야 열려요."}
          </p>
        </div>

        {forbidden && (
          <p className="text-sm text-destructive">
            이 계정은 운영자 콘솔에 접근할 수 없어요.
          </p>
        )}

        {useGoogle && (
          <Button
            className="w-full"
            variant="outline"
            disabled={loading}
            onClick={google}
          >
            {loading ? (
              <Loader2 className="size-5 animate-spin" />
            ) : (
              <>
                <GoogleIcon /> Google로 로그인
              </>
            )}
          </Button>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
