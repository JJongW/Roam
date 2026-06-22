"use client";

import { useState } from "react";
import { Bookmark, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { promptLogin, useAuthStore } from "@/lib/stores/auth";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RouteLeg, RoutePlan } from "@/lib/types";

/**
 * Save the current route under a name so it can be reloaded later. A signed-in
 * save also publishes it to the public gallery in one step (see POST
 * /api/me/routes), so it's gated behind login.
 */
export function SaveRouteButton({
  exhibitionId,
  boothIds,
  estimatedMinutes,
  legs,
  onSaved,
}: {
  exhibitionId: string;
  boothIds: string[];
  estimatedMinutes: number;
  legs: RouteLeg[];
  onSaved?: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    const name = title.trim();
    if (!name || busy || boothIds.length === 0) return;
    setBusy(true);
    try {
      await api.post<{ route: RoutePlan }>("/api/me/routes", {
        exhibitionId,
        title: name,
        boothIds,
        estimatedMinutes,
        legs,
      });
      toast.success("동선을 저장하고 ‘다른 사람 동선’에 공개했어요");
      setTitle("");
      setOpen(false);
      onSaved?.();
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "저장에 실패했어요";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => {
          if (!user) {
            promptLogin("동선을 저장하려면 로그인이 필요해요");
            return;
          }
          setOpen(true);
        }}
        aria-label="동선 저장"
      >
        <Bookmark className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="px-5 pb-8">
          <SheetHeader>
            <SheetTitle>동선 저장하기</SheetTitle>
            <SheetDescription>
              이름을 붙여 저장하면 ‘내 동선’에서 다시 불러올 수 있고, ‘다른 사람
              동선’에도 공개돼 다른 방문객이 참고할 수 있어요.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="동선 이름 (예: 토요일 오후 코스)"
              maxLength={60}
              aria-label="동선 이름"
              onKeyDown={(e) => {
                if (e.nativeEvent.isComposing) return;
                if (e.key === "Enter") save();
              }}
            />
            <Button
              size="lg"
              className="w-full"
              onClick={save}
              disabled={busy || !title.trim()}
            >
              {busy && <Loader2 className="size-5 animate-spin" />}
              저장
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
