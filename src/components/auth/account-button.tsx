"use client";

import { useState } from "react";
import { LogOut, UserRound } from "lucide-react";
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
      {/* 비로그인 상태의 로그인 버튼과 같은 모양(outline)을 써서 "여기 누르면 뭔가
          있다"는 신호를 준다 — 예전엔 아이콘 하나로 그 신호를 줬는데, 로미와 무관한
          자리에 AI 연상 아이콘이 붙어 어색하다는 피드백으로 뺐다. */}
      <Button
        variant="outline"
        size="sm"
        className="max-w-28"
        onClick={() => setBrainOpen(true)}
        aria-label={t("account.viewTaste")}
      >
        <span className="truncate">{user.nickname}</span>
      </Button>
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
