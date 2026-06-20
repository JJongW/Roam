"use client";

import { useEffect, useState } from "react";
import { Loader2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { ApiClientError } from "@/lib/api/client";
import { useAuthStore } from "@/lib/stores/auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/** Global nickname-login bottom sheet, driven by useAuthStore.loginOpen. */
export function LoginSheet() {
  const open = useAuthStore((s) => s.loginOpen);
  const closeLogin = useAuthStore((s) => s.closeLogin);
  const login = useAuthStore((s) => s.login);

  const [nickname, setNickname] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const name = nickname.trim();
    if (name.length < 2 || busy) return;
    setBusy(true);
    setError(null);
    try {
      await login(name);
      toast.success(`${name}님 환영해요!`);
      setNickname("");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "로그인에 실패했어요";
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
          <SheetTitle>닉네임으로 시작하기</SheetTitle>
          <SheetDescription>
            저장·메모·동선 공유를 쓰려면 닉네임이 필요해요. 비밀번호는 없어요.
          </SheetDescription>
        </SheetHeader>

        <div className="mt-5 space-y-3">
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
            {busy ? "확인 중" : "시작하기"}
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            이미 쓰이는 닉네임은 선택할 수 없어요.
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
  }, [refresh]);
  return null;
}
