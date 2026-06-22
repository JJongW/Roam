"use client";

import { useEffect, useState } from "react";
import { Bookmark } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api/client";
import { promptLogin, useAuthStore } from "@/lib/stores/auth";
import { Button } from "@/components/ui/button";
import type { Bookmark as BookmarkType, BookmarkTarget } from "@/lib/types";

export function BookmarkButton({
  targetType,
  targetId,
  className,
}: {
  targetType: BookmarkTarget;
  targetId: string;
  className?: string;
}) {
  const user = useAuthStore((s) => s.user);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) {
      setSaved(false);
      return;
    }
    api
      .get<{ data: BookmarkType[] }>("/api/bookmarks")
      .then(({ data }) =>
        setSaved(
          data.some(
            (b) => b.targetType === targetType && b.targetId === targetId,
          ),
        ),
      )
      .catch(() => {});
  }, [targetType, targetId, user]);

  async function toggle() {
    if (!user) {
      promptLogin("가고 싶은 부스로 저장하려면 로그인이 필요해요");
      return;
    }
    if (busy) return;
    setBusy(true);
    const next = !saved;
    setSaved(next); // optimistic
    try {
      if (next) await api.post("/api/bookmarks", { targetType, targetId });
      else await api.del("/api/bookmarks", { targetType, targetId });
    } catch {
      setSaved(!next);
      toast.error("북마크 처리에 실패했어요");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={saved ? "북마크 해제" : "북마크"}
      aria-pressed={saved}
      onClick={toggle}
      className={className}
    >
      <Bookmark
        className={cn("size-5", saved && "fill-primary text-primary")}
      />
    </Button>
  );
}
