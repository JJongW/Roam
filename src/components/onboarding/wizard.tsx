"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  COMPANION_OPTIONS,
  MOVEMENT_OPTIONS,
  TIME_OPTIONS,
  VISIT_PURPOSE_OPTIONS,
} from "@/lib/constants";
import { useOnboardingStore } from "@/lib/stores/onboarding";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { api, ApiClientError } from "@/lib/api/client";
import { userPreferenceInputSchema } from "@/lib/schemas";
import type { Category, RoutePlan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { OptionCard } from "@/components/onboarding/option-card";
import { AiQuickStart } from "@/components/onboarding/ai-quick-start";

// Interests first: it's the only field quick-start requires, so putting it on
// the opening screen makes "바로 추천 받기" reachable immediately.
const STEPS = [
  "interests",
  "purpose",
  "time",
  "movement",
  "companion",
] as const;
const TITLES: Record<(typeof STEPS)[number], { title: string; sub: string }> = {
  purpose: {
    title: "방문 목적이 무엇인가요?",
    sub: "여러 개 선택할 수 있어요",
  },
  interests: {
    title: "어떤 분야에 관심 있으세요?",
    sub: "여러 개 선택할 수 있어요",
  },
  time: {
    title: "얼마나 둘러보실 예정인가요?",
    sub: "시간에 맞춰 동선을 짜드려요",
  },
  movement: {
    title: "어떻게 움직이고 싶으세요?",
    sub: "이동 스타일을 골라주세요",
  },
  companion: {
    title: "누구와 함께 오셨나요?",
    sub: "동행에 맞는 동선을 제안해요",
  },
};

export function OnboardingWizard({
  slug,
  categories,
  aiEnabled = false,
}: {
  slug: string;
  categories: Category[];
  aiEnabled?: boolean;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const store = useOnboardingStore();
  const setRoute = useRouteStore((s) => s.setRoute);
  const setCartIds = useCartStore((s) => s.setIds);

  const key = STEPS[step];
  const meta = TITLES[key];
  const progress = ((step + 1) / STEPS.length) * 100;

  const canNext = useMemo(() => {
    switch (key) {
      case "purpose":
        return store.visitPurposes.length > 0;
      case "interests":
        return store.interests.length > 0;
      case "time":
        return Boolean(store.availableMinutes);
      case "movement":
        return Boolean(store.movementPreference);
      case "companion":
        return Boolean(store.companionType);
    }
  }, [key, store]);

  function go(delta: number) {
    setDir(delta);
    setStep((s) => Math.min(STEPS.length - 1, Math.max(0, s + delta)));
  }

  async function generate(input: Record<string, unknown>) {
    const parsed = userPreferenceInputSchema.safeParse(input);
    if (!parsed.success) {
      toast.error("관심 분야를 1개 이상 선택해 주세요");
      return;
    }
    setSubmitting(true);
    try {
      const { route } = await api.post<{ route: RoutePlan }>("/api/route", {
        exhibitionSlug: slug,
        preference: parsed.data,
      });
      setRoute(route);
      // Recommendation fills the cart; the route page lets the user edit it.
      setCartIds(route.boothIds);
      router.push(`/exhibitions/${slug}/route`);
    } catch (e) {
      const msg =
        e instanceof ApiClientError
          ? e.error.message
          : "경로 생성에 실패했어요";
      toast.error(msg);
      setSubmitting(false);
    }
  }

  // Full path: use every answered step.
  function submit() {
    return generate({
      visitPurposes: store.visitPurposes,
      interests: store.interests,
      availableMinutes: store.availableMinutes,
      movementPreference: store.movementPreference,
      companionType: store.companionType,
    });
  }

  // Quick start (1-2 steps): only interests are required; sensible defaults
  // fill the rest, and the route page lets the visitor refine afterwards.
  function quickSubmit() {
    return generate({
      visitPurposes: store.visitPurposes.length
        ? store.visitPurposes
        : ["experience"],
      interests: store.interests,
      availableMinutes: store.availableMinutes ?? 120,
      movementPreference: store.movementPreference ?? "balanced",
      companionType: store.companionType ?? "alone",
    });
  }

  // Quick start becomes available as soon as interests are chosen, except on
  // the final step (where the primary button already generates the route).
  const canQuickStart = store.interests.length > 0 && step < STEPS.length - 1;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 flex items-center gap-2 bg-background/80 px-2 pt-safe backdrop-blur-xl">
        <Button
          variant="ghost"
          size="icon"
          aria-label="이전"
          onClick={() => (step === 0 ? router.back() : go(-1))}
        >
          <ChevronLeft className="size-6" />
        </Button>
        <Progress value={progress} className="flex-1" />
        <span className="w-12 text-right text-sm font-semibold tabular text-muted-foreground">
          {step + 1}/{STEPS.length}
        </span>
      </header>

      <div className="flex-1 overflow-y-auto overflow-x-hidden px-5 pt-6">
        {aiEnabled && step === 0 && (
          <div className="mb-5">
            <AiQuickStart slug={slug} />
            <div className="mt-5 flex items-center gap-3">
              <span className="h-px flex-1 bg-border" />
              <span className="text-xs font-medium text-muted-foreground">
                또는 직접 골라보기
              </span>
              <span className="h-px flex-1 bg-border" />
            </div>
          </div>
        )}
        <div className="space-y-1.5">
          <h1 className="text-2xl font-extrabold leading-snug">{meta.title}</h1>
          <p className="text-sm text-muted-foreground">{meta.sub}</p>
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={key}
            custom={dir}
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="mt-6"
          >
            {key === "purpose" && (
              <div className="grid grid-cols-2 gap-2.5">
                {VISIT_PURPOSE_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    layout="tile"
                    label={o.label}
                    description={o.description}
                    icon={o.icon}
                    selected={store.visitPurposes.includes(o.value)}
                    onSelect={() => store.togglePurpose(o.value)}
                  />
                ))}
              </div>
            )}

            {key === "interests" && (
              <div className="grid grid-cols-2 gap-2.5">
                {categories.map((c) => (
                  <OptionCard
                    key={c.id}
                    layout="tile"
                    label={c.name}
                    icon={c.icon}
                    selected={store.interests.includes(c.slug)}
                    onSelect={() => store.toggleInterest(c.slug)}
                  />
                ))}
              </div>
            )}

            {key === "time" && (
              <div className="grid grid-cols-2 gap-2.5">
                {TIME_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    selected={store.availableMinutes === o.value}
                    onSelect={() => store.setTime(o.value)}
                  />
                ))}
              </div>
            )}

            {key === "movement" && (
              <div className="space-y-2.5">
                {MOVEMENT_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    description={o.description}
                    icon={o.icon}
                    selected={store.movementPreference === o.value}
                    onSelect={() => store.setMovement(o.value)}
                  />
                ))}
              </div>
            )}

            {key === "companion" && (
              <div className="space-y-2.5">
                {COMPANION_OPTIONS.map((o) => (
                  <OptionCard
                    key={o.value}
                    label={o.label}
                    description={o.description}
                    icon={o.icon}
                    selected={store.companionType === o.value}
                    onSelect={() => store.setCompanion(o.value)}
                  />
                ))}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/90 p-4 pb-safe backdrop-blur-xl">
        {step < STEPS.length - 1 ? (
          <>
            <Button
              size="lg"
              className="w-full"
              disabled={!canNext}
              onClick={() => go(1)}
            >
              다음
            </Button>
            {canQuickStart && (
              <Button
                variant="ghost"
                className="w-full"
                disabled={submitting}
                onClick={quickSubmit}
              >
                {submitting ? (
                  <Loader2 className="size-5 animate-spin" />
                ) : (
                  <Sparkles className="size-5" />
                )}
                {submitting ? "추천 받는 중" : "바로 추천 받기"}
              </Button>
            )}
          </>
        ) : (
          <Button
            size="lg"
            className="w-full"
            disabled={!canNext || submitting}
            onClick={submit}
          >
            {submitting && <Loader2 className="size-5 animate-spin" />}
            {submitting ? "맞춤 동선 만드는 중" : "맞춤 동선 만들기"}
          </Button>
        )}
      </div>
    </div>
  );
}
