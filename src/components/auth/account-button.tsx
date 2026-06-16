"use client";

import { LogOut, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useAuthStore } from "@/lib/stores/auth";
import { Button } from "@/components/ui/button";

/** Header control: shows a login button or the signed-in nickname + logout. */
export function AccountButton() {
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const openLogin = useAuthStore((s) => s.openLogin);
  const logout = useAuthStore((s) => s.logout);

  if (!ready) return <div className="h-8 w-16" aria-hidden />;

  if (!user) {
    return (
      <Button variant="outline" size="sm" onClick={openLogin}>
        <UserRound className="size-4" /> 로그인
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <span className="max-w-24 truncate text-sm font-semibold">
        {user.nickname}
      </span>
      <Button
        variant="ghost"
        size="icon"
        aria-label="로그아웃"
        onClick={async () => {
          await logout();
          toast.success("로그아웃했어요");
        }}
      >
        <LogOut className="size-4.5" />
      </Button>
    </div>
  );
}
