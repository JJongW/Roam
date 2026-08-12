"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { createClient } from "@/lib/supabase/client";
import { GoogleIcon } from "@/components/auth/google-icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * /admin 게이트 진입 화면. 이메일 화이트리스트가 설정돼 있으면(useGoogle=true)
 * Google 로그인만 보여주고 허용된 계정인지는 서버(/auth/callback)가 검증한다 —
 * 그렇지 않으면(로컬 mock 개발, 또는 아직 화이트리스트 미설정) 예전 조직자 코드
 * 입력으로 폴백한다.
 */
export function AdminUnlock({ useGoogle }: { useGoogle: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forbidden = searchParams.get("admin_error") === "forbidden";
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submitCode() {
    if (!code.trim() || loading) return;
    setLoading(true);
    setError("");
    try {
      await api.post("/api/admin/unlock", { code: code.trim() });
      router.refresh();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.error.message : "오류가 발생했어요");
      setLoading(false);
    }
  }

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
              : "조직자 코드를 입력하면 접근할 수 있어요."}
          </p>
        </div>

        {forbidden && (
          <p className="text-sm text-destructive">
            이 계정은 운영자 콘솔에 접근할 수 없어요.
          </p>
        )}

        {useGoogle ? (
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
        ) : (
          <>
            <Input
              type="password"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="조직자 코드"
              aria-label="조직자 코드"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") submitCode();
              }}
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button
              className="w-full"
              disabled={!code.trim() || loading}
              onClick={submitCode}
            >
              {loading ? <Loader2 className="size-5 animate-spin" /> : "입장"}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
