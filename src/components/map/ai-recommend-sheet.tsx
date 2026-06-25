"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { LOADING_MESSAGES } from "@/lib/loading-messages";
import { useRotatingMessage } from "@/lib/hooks/use-rotating-message";
import { useCartStore } from "@/lib/stores/cart";
import { useRouteStore } from "@/lib/stores/route";
import { useOnboardingStore } from "@/lib/stores/onboarding";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RoutePlan } from "@/lib/types";

const EXAMPLES = [
  "문학 위주로 2시간 코스",
  "아이랑 같이 그림책 부스",
  "굿즈 많은 곳 위주로",
];

/**
 * AI 추천받기 — a natural-language chat box on the map. The request is blended
 * with the visitor's already-added booths (kept) and their onboarding interests,
 * then the route is drawn right on the map. (Not the step-by-step onboarding.)
 */
export function AiRecommendSheet({
  slug,
  open,
  onClose,
}: {
  slug: string;
  open: boolean;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  // 기본은 "교체"(입력한 의도를 그대로 반영). 켜면 기존 동선에 더한다(병합).
  const [addToExisting, setAddToExisting] = useState(false);
  const busyMsg = useRotatingMessage(LOADING_MESSAGES.route, busy);
  const hasRoute = useCartStore((s) => s.ids.length > 0);

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      // 토글 ON일 때만 현재 담은 부스를 keepBoothIds로 넘겨 병합. 기본(OFF)은
      // 보내지 않아 입력한 텍스트 의도대로 새 동선으로 교체된다.
      const keep = addToExisting ? useCartStore.getState().ids : undefined;
      const { route } = await api.post<{ route: RoutePlan }>(
        "/api/ai/quick-route",
        {
          exhibitionSlug: slug,
          text: t,
          interests: useOnboardingStore.getState().interests,
          ...(keep && keep.length ? { keepBoothIds: keep } : {}),
        },
      );
      useRouteStore.getState().setRoute(route);
      useCartStore.getState().setIds(route.boothIds);
      toast.success(
        keep && keep.length
          ? "기존 동선에 더해 추천했어요"
          : "새 동선을 추천했어요",
      );
      setText("");
      onClose();
    } catch (e) {
      toast.error(
        e instanceof ApiClientError ? e.error.message : "추천에 실패했어요",
      );
    } finally {
      setBusy(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="닫기"
        onClick={onClose}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-card px-4 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h2 className="flex-1 font-extrabold">AI 추천받기</h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={onClose}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <X className="size-5" />
          </button>
        </div>
        <p className="mb-2 text-sm text-muted-foreground">
          보고 싶은 걸 자유롭게 적어주세요. 입력한 내용으로 새 동선을 짜 드려요.
        </p>
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="예: 문학 위주로 2시간, 굿즈 많은 곳"
          rows={2}
          maxLength={500}
          className="resize-none"
          aria-label="AI 추천 요청"
          onKeyDown={(e) => {
            if (e.nativeEvent.isComposing) return;
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") send();
          }}
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setText(ex)}
              className="rounded-full border border-border bg-background px-2.5 py-1 text-xs text-foreground/80 active:bg-secondary"
            >
              {ex}
            </button>
          ))}
        </div>
        {/* 동선이 이미 있을 때만: 기본은 교체, 켜면 기존 동선에 더한다. */}
        {hasRoute && (
          <label className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
            <span className="text-sm">
              <span className="font-semibold">기존 동선에 더하기</span>
              <span className="block text-xs text-muted-foreground">
                끄면 입력한 내용으로 새로 짜요
              </span>
            </span>
            <input
              type="checkbox"
              checked={addToExisting}
              onChange={(e) => setAddToExisting(e.target.checked)}
              aria-label="기존 동선에 더하기"
              className="size-5 accent-primary"
            />
          </label>
        )}
        <Button
          size="lg"
          className="mt-4 w-full"
          disabled={!text.trim() || busy}
          onClick={send}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Sparkles className="size-5" />
          )}
          {busy ? busyMsg : "이 내용으로 추천받기"}
        </Button>
      </div>
    </div>
  );
}
