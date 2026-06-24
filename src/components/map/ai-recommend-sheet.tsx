"use client";

import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
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

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const { route } = await api.post<{ route: RoutePlan }>(
        "/api/ai/quick-route",
        {
          exhibitionSlug: slug,
          text: t,
          interests: useOnboardingStore.getState().interests,
          keepBoothIds: useCartStore.getState().ids,
        },
      );
      useRouteStore.getState().setRoute(route);
      useCartStore.getState().setIds(route.boothIds);
      toast.success("동선을 추천했어요");
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
      <div className="relative mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-card p-4 pb-safe shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-4">
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
          보고 싶은 걸 자유롭게 적어주세요. 이미 담은 부스와 관심사도 함께
          고려해요.
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
        <Button
          size="lg"
          className="mt-3 w-full"
          disabled={!text.trim() || busy}
          onClick={send}
        >
          {busy ? (
            <Loader2 className="size-5 animate-spin" />
          ) : (
            <Sparkles className="size-5" />
          )}
          {busy ? "동선 짜는 중" : "이 내용으로 추천받기"}
        </Button>
      </div>
    </div>
  );
}
