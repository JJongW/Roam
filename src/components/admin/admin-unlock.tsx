"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock } from "lucide-react";
import { api, ApiClientError } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Organizer code entry shown when /admin is gated and not yet unlocked. */
export function AdminUnlock() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
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

  return (
    <div className="flex min-h-dvh items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-secondary">
          <Lock className="size-6 text-primary" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-extrabold">운영자 콘솔</h1>
          <p className="text-sm text-muted-foreground">
            조직자 코드를 입력하면 접근할 수 있어요.
          </p>
        </div>
        <Input
          type="password"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="조직자 코드"
          aria-label="조직자 코드"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button
          className="w-full"
          disabled={!code.trim() || loading}
          onClick={submit}
        >
          {loading ? <Loader2 className="size-5 animate-spin" /> : "입장"}
        </Button>
      </div>
    </div>
  );
}
