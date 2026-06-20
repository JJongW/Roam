"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { useOnboardingStore } from "@/lib/stores/onboarding";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type {
  CompanionType,
  MovementPreference,
  RoutePlan,
  VisitPurpose,
} from "@/lib/types";

type AiPreference = {
  visitPurpose: VisitPurpose;
  interests: string[];
  availableMinutes: number;
  movementPreference: MovementPreference;
  companionType: CompanionType;
};

const EXAMPLES = [
  "직장인인데 점심에 잠깐, 디자인·예술 신간 보러 왔어요",
  "아이랑 그림책 사주려고요. 체험도 좋아해요, 2시간 정도",
  "SF 좋아해서 신간·사인회 위주로, 사람 많은 덴 피하고 싶어요",
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
        preference: AiPreference;
        chips: string[];
        confidence: number;
      }>("/api/ai/quick-route", { exhibitionSlug: slug, text: prompt });

      setRoute(res.route);
      setCartIds(res.route.boothIds);
      // Mirror the parsed preference into the onboarding draft so route-page
      // reason chips show and the wizard is pre-filled if the user goes back.
      useOnboardingStore.setState({
        interests: res.preference.interests,
        visitPurpose: res.preference.visitPurpose,
        availableMinutes: res.preference.availableMinutes,
        movementPreference: res.preference.movementPreference,
        companionType: res.preference.companionType,
      });

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
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <div className="flex items-center gap-1.5">
        <Wand2 className="size-4 text-primary" aria-hidden />
        <p className="text-sm font-bold">AI 맞춤 추천</p>
        <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-bold text-secondary-foreground">
          BETA
        </span>
      </div>
      <p className="mt-0.5 text-xs text-muted-foreground">
        어떤 분인지, 무엇에 관심 있는지, 왜 오셨는지 편하게 적어주세요. 맥락에
        맞춰 동선을 만들어드려요.
      </p>

      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="예: 디자인 일 해서 예술·디자인 신간 보러 왔고, 굿즈도 챙기고 싶어요"
        rows={3}
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
            <Loader2 className="size-5 animate-spin" /> 조건을 읽고 동선을
            만들고 있어요
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
