"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { RoutePlan } from "@/lib/types";

const EXAMPLES = [
  "문학 위주로 1시간만, 사람 많은 곳은 피하고 싶어",
  "아이랑 그림책·체험 위주로 2시간 코스",
  "굿즈·사인회 있는 곳 위주로 빠르게",
];

/**
 * AI Quick Recommendation — one natural-language prompt instead of the full
 * 5-step flow. Gemini parses the prompt server-side into a validated
 * preference, the existing engine builds the route, and we drop the visitor on
 * the route page (which they can still refine).
 */
export function AiQuickStart({ slug }: { slug: string }) {
  const router = useRouter();
  const setRoute = useRouteStore((s) => s.setRoute);
  const setCartIds = useCartStore((s) => s.setIds);
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);

  async function run() {
    const prompt = text.trim();
    if (!prompt || loading) return;
    setLoading(true);
    try {
      const res = await api.post<{
        route: RoutePlan;
        chips: string[];
        confidence: number;
      }>("/api/ai/quick-route", { exhibitionSlug: slug, text: prompt });

      setRoute(res.route);
      setCartIds(res.route.boothIds);

      const summary = res.chips.length ? ` · ${res.chips.join(" / ")}` : "";
      if (res.confidence < 0.4) {
        toast("이렇게 이해했어요. 결과에서 조건을 바꿀 수 있어요" + summary);
      } else {
        toast.success("동선을 만들었어요" + summary);
      }
      router.push(`/exhibitions/${slug}/route`);
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? e.error.message
          : "AI 추천을 만들지 못했어요";
      toast.error(`${msg}. 아래에서 직접 골라도 돼요.`);
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4">
      <div className="flex items-center gap-1.5">
        <Wand2 className="size-4 text-primary" aria-hidden />
        <p className="text-sm font-bold">AI 빠른 추천</p>
        <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
          BETA
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        한 문장으로 말해주면 바로 동선을 만들어드려요.
      </p>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="예: 문학 위주로 1시간만, 사람 많은 곳은 피하고 싶어"
        rows={2}
        maxLength={500}
        disabled={loading}
        className="mt-2.5 resize-none bg-background"
        aria-label="AI 추천 요청"
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing) return;
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") run();
        }}
      />

      <div className="mt-2 flex flex-wrap gap-1.5">
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            type="button"
            disabled={loading}
            onClick={() => setText(ex)}
            className="rounded-full border border-border bg-card px-2.5 py-1 text-[11px] text-muted-foreground active:bg-accent/40 disabled:opacity-50"
          >
            {ex}
          </button>
        ))}
      </div>

      <Button
        className="mt-2.5 w-full"
        disabled={!text.trim() || loading}
        onClick={run}
      >
        {loading ? (
          <>
            <Loader2 className="size-5 animate-spin" /> 조건을 읽고 동선을 만들고
            있어요
          </>
        ) : (
          <>
            <Sparkles className="size-5" /> AI로 바로 추천 받기
          </>
        )}
      </Button>
    </div>
  );
}
