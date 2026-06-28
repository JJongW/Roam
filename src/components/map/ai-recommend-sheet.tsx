"use client";

import { useState } from "react";
import { Check, Loader2, Sparkles, Globe, X } from "lucide-react";
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

type QuickRouteResponse = {
  route: RoutePlan;
  chips: string[];
  unmatched: string[];
  confidence: number;
  keywords: string[];
  reason: string;
  source: "ai" | "deterministic";
  count: number;
};

type Result = QuickRouteResponse & { merged: boolean; query: string };

/**
 * AI 추천받기 — a natural-language chat box on the map. After it runs it shows a
 * result panel: how the request was understood (chips / unmatched / confidence),
 * what was added (count + reason + AI·web source), so the visitor can see the
 * process, not just a silently-changed map.
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
  const [result, setResult] = useState<Result | null>(null);
  const busyMsg = useRotatingMessage(LOADING_MESSAGES.route, busy);
  const hasRoute = useCartStore((s) => s.ids.length > 0);

  function closeAll() {
    setResult(null);
    setText("");
    onClose();
  }

  async function send() {
    const t = text.trim();
    if (!t || busy) return;
    setBusy(true);
    try {
      const keep = addToExisting ? useCartStore.getState().ids : undefined;
      const merged = Boolean(keep && keep.length);
      const res = await api.post<QuickRouteResponse>("/api/ai/quick-route", {
        exhibitionSlug: slug,
        text: t,
        interests: useOnboardingStore.getState().interests,
        ...(merged ? { keepBoothIds: keep } : {}),
      });
      useRouteStore.getState().setRoute(res.route);
      useCartStore.getState().setIds(res.route.boothIds);
      // 바로 닫지 않고 결과를 보여준다 — 과정·반영 결과 확인용.
      setResult({ ...res, merged, query: t });
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
        onClick={closeAll}
        className="absolute inset-0 bg-black/40"
      />
      <div className="relative mx-auto w-full max-w-md rounded-t-2xl border-t border-border bg-card px-4 pt-4 pb-[max(1.75rem,env(safe-area-inset-bottom))] shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="size-5 text-primary" />
          <h2 className="flex-1 font-extrabold">
            {result ? "AI 추천 결과" : "AI 추천받기"}
          </h2>
          <button
            type="button"
            aria-label="닫기"
            onClick={closeAll}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
          >
            <X className="size-5" />
          </button>
        </div>

        {result ? (
          <ResultView
            result={result}
            onDone={closeAll}
            onRetry={() => setResult(null)}
          />
        ) : (
          <>
            <p className="mb-2 text-sm text-muted-foreground">
              보고 싶은 걸 자유롭게 적어주세요. 입력한 내용으로 새 동선을 짜
              드려요.
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
          </>
        )}
      </div>
    </div>
  );
}

function Pills({ items, muted }: { items: string[]; muted?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((k) => (
        <span
          key={k}
          className={
            muted
              ? "rounded-full border border-dashed border-border px-2.5 py-1 text-xs text-muted-foreground"
              : "rounded-full bg-secondary px-2.5 py-1 text-xs font-semibold text-foreground/90"
          }
        >
          {k}
        </span>
      ))}
    </div>
  );
}

function ResultView({
  result,
  onDone,
  onRetry,
}: {
  result: Result;
  onDone: () => void;
  onRetry: () => void;
}) {
  const pct = Math.round((result.confidence ?? 0) * 100);
  return (
    <div className="space-y-3.5">
      {/* 입력 echo + 이해도 */}
      <div className="rounded-xl bg-secondary/50 p-3">
        <p className="text-xs font-semibold text-muted-foreground">내 요청</p>
        <p className="mt-0.5 text-sm">“{result.query}”</p>
      </div>

      {/* 이렇게 이해했어요 */}
      <div className="space-y-1.5">
        <p className="text-xs font-semibold text-muted-foreground">
          이렇게 이해했어요 · 이해도 {pct}%
        </p>
        {result.chips.length > 0 ? (
          <Pills items={result.chips} />
        ) : (
          <p className="text-sm text-muted-foreground">
            구체적 조건을 못 읽어서 관심사 기준으로 추천했어요.
          </p>
        )}
        {result.unmatched.length > 0 && (
          <div className="pt-1">
            <p className="pb-1 text-xs text-muted-foreground">
              이건 아직 잘 못 읽었어요
            </p>
            <Pills items={result.unmatched} muted />
          </div>
        )}
      </div>

      {/* 확장 키워드(AI가 넓힌 검색어) */}
      {result.keywords.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-xs font-semibold text-muted-foreground">
            이런 키워드로 넓혀 찾았어요
          </p>
          <Pills items={result.keywords} />
        </div>
      )}

      {/* 결과 요약 */}
      <div className="rounded-xl border border-border p-3">
        <div className="flex items-center gap-2">
          <Check className="size-4 text-primary" />
          <p className="text-sm font-bold">
            {result.merged ? "기존 동선에 더해 " : "새 동선으로 "}
            {result.count}곳 추천
          </p>
          <span className="ml-auto inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
            {result.source === "ai" ? (
              <>
                <Globe className="size-3" /> AI·웹검색
              </>
            ) : (
              "기본 추천"
            )}
          </span>
        </div>
        {result.reason && (
          <p className="mt-1.5 text-sm leading-relaxed text-foreground/80">
            {result.reason}
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onRetry}>
          다시 입력
        </Button>
        <Button className="flex-1" onClick={onDone}>
          지도에서 보기
        </Button>
      </div>
    </div>
  );
}
