"use client";

import { useState } from "react";
import { Check, Copy, Loader2, Share2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { promptLogin, useAuthStore } from "@/lib/stores/auth";
import { useRouteStore } from "@/lib/stores/route";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RoutePlan } from "@/lib/types";

/** Publish the current route + share its link. Requires sign-in. */
export function ShareRouteButton({ route }: { route: RoutePlan }) {
  const user = useAuthStore((s) => s.user);
  const setRoute = useRouteStore((s) => s.setRoute);

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(route.title ?? "");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    route.shareId && typeof window !== "undefined"
      ? `${window.location.origin}/r/${route.shareId}`
      : null;

  function onClick() {
    if (!user) {
      promptLogin("동선을 공유하려면 로그인이 필요해요");
      return;
    }
    setOpen(true);
  }

  async function publish() {
    const name = title.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      // The planning-page route isn't persisted yet (id "local"). Save it first
      // to get a real id, then publish that.
      let routeId = route.id;
      if (!routeId || routeId === "local") {
        const { route: saved } = await api.post<{ route: RoutePlan }>(
          "/api/me/routes",
          {
            exhibitionId: route.exhibitionId,
            title: name,
            boothIds: route.boothIds,
            estimatedMinutes: route.estimatedMinutes,
            legs: route.legs,
          },
        );
        routeId = saved.id;
      }
      const { route: updated } = await api.post<{ route: RoutePlan }>(
        `/api/route/${routeId}/publish`,
        { title: name, isPublic: true },
      );
      // Keep visited progress from the local store.
      setRoute({ ...updated, visitedBoothIds: route.visitedBoothIds });
      toast.success("동선을 공유했어요");
    } catch (e) {
      const msg =
        e instanceof ApiClientError ? e.error.message : "공유에 실패했어요";
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  async function share() {
    if (!shareUrl) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: route.title ?? "내 동선",
          url: shareUrl,
        });
        return;
      } catch {
        /* user cancelled — fall through to copy */
      }
    }
    await copy();
  }

  async function copy() {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      toast.success("링크를 복사했어요");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("복사에 실패했어요");
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={onClick}
        aria-label="동선 공유"
      >
        <Share2 className="size-5" />
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="px-5 pb-8">
          <SheetHeader>
            <SheetTitle>동선 공유하기</SheetTitle>
            <SheetDescription>
              이름을 붙여 공개하면 링크로 공유되고 ‘다른 사람 동선’ 목록에
              올라가요.
            </SheetDescription>
          </SheetHeader>

          <div className="mt-4 space-y-3">
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="동선 이름 (예: 문구덕후 필수코스)"
              maxLength={60}
              aria-label="동선 이름"
            />
            <Button
              size="lg"
              className="w-full"
              onClick={publish}
              disabled={busy || !title.trim()}
            >
              {busy && <Loader2 className="size-5 animate-spin" />}
              {route.shareId ? "공개 정보 업데이트" : "공개하고 링크 만들기"}
            </Button>

            {shareUrl && (
              <div className="space-y-2 rounded-xl border border-border bg-secondary/40 p-3">
                <p className="truncate text-sm font-medium" dir="ltr">
                  {shareUrl}
                </p>
                <div className="flex gap-2">
                  <Button variant="outline" className="flex-1" onClick={copy}>
                    {copied ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <Copy className="size-4" />
                    )}
                    링크 복사
                  </Button>
                  <Button className="flex-1" onClick={share}>
                    <Share2 className="size-4" /> 공유
                  </Button>
                </div>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
