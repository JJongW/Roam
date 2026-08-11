"use client";

import { useState } from "react";
import { LogOut, Sparkles, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/auth";
import { useT } from "@/lib/i18n/provider";
import { Button } from "@/components/ui/button";
import { BrainSheet } from "@/components/me/brain-sheet";

/** Header control: shows a login button or the signed-in nickname + logout. */
export function AccountButton() {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const openLogin = useAuthStore((s) => s.openLogin);
  const logout = useAuthStore((s) => s.logout);
  const [brainOpen, setBrainOpen] = useState(false);

  if (!ready) return <div className="h-8 w-16" aria-hidden />;

  if (!user) {
    return (
      <Button variant="outline" size="sm" onClick={openLogin}>
        <UserRound className="size-4" /> {t("account.login")}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      {/* 닉네임을 누르면 취향이 뜬다는 걸 텍스트만으론 아무도 몰랐다(발견성 문제) —
          아이콘 하나로 "여기 누르면 뭔가 보인다"는 신호를 상시 붙여둔다. */}
      <button
        type="button"
        onClick={() => setBrainOpen(true)}
        aria-label={t("account.viewTaste")}
        className="flex max-w-28 items-center gap-1 text-sm font-semibold active:opacity-70"
      >
        <Sparkles className="size-3.5 shrink-0 text-muted-foreground" />
        <span className="truncate">{user.nickname}</span>
      </button>
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("account.logout")}
        onClick={async () => {
          await logout();
          toast.success(t("account.loggedOut"));
        }}
      >
        <LogOut className="size-4.5" />
      </Button>
      <BrainSheet open={brainOpen} onClose={() => setBrainOpen(false)} />
    </div>
  );
}
