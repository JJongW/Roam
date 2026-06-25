"use client";

// ---------------------------------------------------------------------------
// AI Companion 온보딩 — 오케스트레이터.
//
// 폼이 아니라 대화. 한 번에 하나 묻고, 답에 즉시(0ms, 로컬 템플릿) 반응하고,
// 직전 답에 따라 다음 질문이 바뀐다. Gemini는 탭 경로에 없다 — 가용 시간 답
// 직후 백그라운드로 추론을 prefetch 해두고, 요약 화면에서 이미 와 있으면 쓰고
// 아니면 결정론 빌더 결과로 즉시 보여준다. 동선 빌드는 기존 엔진(/api/route).
// ---------------------------------------------------------------------------

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { useOnboardingStore } from "@/lib/stores/onboarding";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { LOADING_MESSAGES } from "@/lib/loading-messages";
import { useRotatingMessage } from "@/lib/hooks/use-rotating-message";
import {
  STEPS,
  STEP_IDS,
  FIRST_STEP_ID,
  buildUnderstanding,
  type StepId,
} from "@/lib/onboarding/onboarding-flow";
import {
  emptyOnboardingContext,
  type OnboardingContext,
  type OnboardingOption,
} from "@/lib/onboarding/onboarding-types";
import { buildProfileFromContext } from "@/lib/onboarding/route-profile-builder";
import type { Category, RoutePlan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  OnboardingEcho,
  OnboardingMessage,
  OnboardingOptionButton,
  OnboardingProgress,
  RoutePreviewCard,
  UnderstandingPanel,
} from "@/components/onboarding/parts";

type Turn =
  | { kind: "ai"; message: string; question: string }
  | { kind: "user"; label: string };

interface Inference {
  source: string;
  summary: string;
  routeName: string;
  reason: string;
  strategy: string;
  interests: string[];
}

function labelOf(options: OnboardingOption[], value: string): string {
  return options.find((o) => o.value === value)?.label ?? value;
}

export function AICompanionOnboarding({
  slug,
  categories,
}: {
  slug: string;
  categories: Category[];
}) {
  const router = useRouter();

  const [ctx, setCtx] = useState<OnboardingContext>(emptyOnboardingContext);
  const [stepId, setStepId] = useState<StepId | null>(FIRST_STEP_ID);
  const [history, setHistory] = useState<
    Array<{ stepId: StepId; ctx: OnboardingContext }>
  >([]);
  const [turns, setTurns] = useState<Turn[]>(() => {
    const def = STEPS[FIRST_STEP_ID];
    const c = emptyOnboardingContext();
    return [{ kind: "ai", message: def.message(c), question: def.question(c) }];
  });
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const submitMsg = useRotatingMessage(LOADING_MESSAGES.route, submitting);

  // 추론 결과는 state — prefetch가 도착하면 요약 화면이 조용히 갱신된다.
  const [inference, setInference] = useState<Inference | null>(null);
  const prefetchedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // 새 turn이 붙으면 대화 영역을 아래로.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  const stepDef = stepId ? STEPS[stepId] : null;
  const options = useMemo(
    () => (stepDef ? stepDef.options(ctx) : []),
    [stepDef, ctx],
  );
  const isMulti = Boolean(stepDef?.multi);
  const understanding = useMemo(() => buildUnderstanding(ctx), [ctx]);

  const progress = stepId ? STEP_IDS.indexOf(stepId) / STEP_IDS.length : 1;

  // 가용 시간 답 직후 백그라운드 추론 prefetch (논블로킹, 1회).
  function maybePrefetch(answeredStep: StepId, nextCtx: OnboardingContext) {
    if (answeredStep !== "time" || prefetchedRef.current) return;
    prefetchedRef.current = true;
    api
      .post<Inference>("/api/onboarding/infer", {
        exhibitionSlug: slug,
        context: nextCtx,
      })
      .then((inf) => setInference(inf))
      .catch(() => {
        /* 폴백은 요약 시 빌더가 담당 */
      });
  }

  function commit(answer: string | string[], echo: string) {
    if (!stepId || !stepDef) return;
    setHistory((h) => [...h, { stepId, ctx }]);
    const nextCtx = stepDef.apply(ctx, answer);
    setCtx(nextCtx);
    setMultiSel([]);

    const nextId = stepDef.next(nextCtx) as StepId | null;
    maybePrefetch(stepId, nextCtx);

    setTurns((t) => {
      const out: Turn[] = [...t, { kind: "user", label: echo }];
      if (nextId) {
        const d = STEPS[nextId];
        out.push({
          kind: "ai",
          message: d.message(nextCtx),
          question: d.question(nextCtx),
        });
      }
      return out;
    });
    setStepId(nextId);
  }

  function selectSingle(value: string) {
    if (typeof navigator !== "undefined" && navigator.vibrate)
      navigator.vibrate(8);
    commit(value, labelOf(options, value));
  }

  function toggleMulti(value: string) {
    setMultiSel((s) =>
      s.includes(value) ? s.filter((v) => v !== value) : [...s, value],
    );
  }

  function confirmMulti() {
    if (multiSel.length === 0) return;
    const echo = multiSel.map((v) => labelOf(options, v)).join(" · ");
    commit(multiSel, echo);
  }

  function goBack() {
    if (history.length === 0) {
      router.back();
      return;
    }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setCtx(prev.ctx);
    setStepId(prev.stepId);
    setMultiSel([]);
    // 마지막 user echo + 그 다음 ai turn 제거(질문으로 되돌아가기).
    setTurns((t) => {
      const copy = [...t];
      // 뒤에서부터 ai 하나 제거(있으면) + user 하나 제거.
      if (copy.length && copy[copy.length - 1].kind === "ai") copy.pop();
      if (copy.length && copy[copy.length - 1].kind === "user") copy.pop();
      return copy;
    });
  }

  // --- 요약 + 동선 생성 ----------------------------------------------------
  const built = useMemo(
    () => buildProfileFromContext(ctx, categories),
    [ctx, categories],
  );
  const routeName = inference?.routeName || built.routeName;
  const routeReason = inference?.reason || built.reason;

  async function generate() {
    if (submitting) return;
    setSubmitting(true);
    try {
      const preference = {
        ...built.preference,
        interests:
          inference?.interests && inference.interests.length
            ? inference.interests
            : built.preference.interests,
      };
      // LLM 주도 동선 생성(검색·URL·RAG). 컨텍스트 전체를 보내 서버가 후보를
      // 추려 Gemini로 고르고 결정론 엔진으로 정렬한다. 무키/실패 시 결정론 폴백.
      const { route } = await api.post<{ route: RoutePlan }>(
        "/api/onboarding/route",
        { exhibitionSlug: slug, context: ctx },
      );
      useOnboardingStore.getState().applyProfile(preference, ctx);
      useRouteStore.getState().setRoute(route);
      useCartStore.getState().setIds(route.boothIds);
      router.replace(`/exhibitions/${slug}/map`);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError
          ? e.error.message
          : "동선 생성에 실패했어요",
      );
      setSubmitting(false);
    }
  }

  const inSummary = stepId === null;

  return (
    <div className="flex min-h-dvh flex-col bg-background md:fixed md:inset-0 md:z-30 landscape:fixed landscape:inset-0 landscape:z-30">
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-background/80 px-2 pt-safe backdrop-blur-xl">
        <Button variant="ghost" size="icon" aria-label="이전" onClick={goBack}>
          <ChevronLeft className="size-6" />
        </Button>
        <OnboardingProgress value={progress} />
        <span className="w-8" />
      </header>

      <div className="flex flex-1 overflow-hidden md:gap-8 md:px-10 landscape:gap-8 landscape:px-10">
        {/* 대화 */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* 모바일 이해 패널 — 답이 하나라도 있으면 위에 컴팩트하게. */}
          {understanding.length > 0 && !inSummary && (
            <div className="px-5 pt-3 md:hidden landscape:hidden">
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto">
                {understanding.map((it) => (
                  <span
                    key={it.key}
                    className="shrink-0 rounded-full border border-border bg-card px-2.5 py-1 text-xs"
                  >
                    <span className="text-muted-foreground">{it.key} </span>
                    <span className="font-semibold">{it.value}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto px-5 py-5 md:py-8"
          >
            {turns.map((t, i) =>
              t.kind === "ai" ? (
                <div key={i} className="space-y-2">
                  <OnboardingMessage text={t.message} />
                  <p className="text-xl font-extrabold leading-snug">
                    {t.question}
                  </p>
                </div>
              ) : (
                <OnboardingEcho key={i} label={t.label} />
              ),
            )}

            {inSummary && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-3"
              >
                <OnboardingMessage
                  text={"좋아.\n내가 이해한 내용을 정리해볼게."}
                />
                {inference?.summary && (
                  <p className="text-sm leading-relaxed text-foreground/80">
                    {inference.summary}
                  </p>
                )}
                <UnderstandingPanel items={understanding} />
                <RoutePreviewCard name={routeName} reason={routeReason} />
              </motion.div>
            )}
          </div>

          {/* 액션 영역 */}
          <div className="sticky bottom-0 space-y-2 border-t border-border bg-background/90 p-4 pb-safe backdrop-blur-xl">
            {!inSummary && stepDef && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={stepId}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="space-y-2"
                >
                  {options.map((o) => (
                    <OnboardingOptionButton
                      key={o.value}
                      option={o}
                      selected={isMulti && multiSel.includes(o.value)}
                      onClick={() =>
                        isMulti ? toggleMulti(o.value) : selectSingle(o.value)
                      }
                    />
                  ))}
                  {isMulti && (
                    <Button
                      size="lg"
                      className="w-full"
                      disabled={multiSel.length === 0}
                      onClick={confirmMulti}
                    >
                      이걸로 할게
                    </Button>
                  )}
                </motion.div>
              </AnimatePresence>
            )}

            {inSummary && (
              <Button
                size="lg"
                className="w-full"
                disabled={submitting}
                onClick={generate}
              >
                {submitting ? (
                  <>
                    <Loader2 className="size-5 animate-spin" />
                    {submitMsg}…
                  </>
                ) : (
                  "좋아, 같이 가자"
                )}
              </Button>
            )}
          </div>
        </div>

        {/* 데스크탑 이해 패널 (우측 고정) */}
        <aside className="hidden w-72 shrink-0 self-center md:block landscape:block">
          <UnderstandingPanel items={understanding} />
        </aside>
      </div>

      {submitting && (
        <div className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-background/80 backdrop-blur-sm">
          <Loader2 className="size-8 animate-spin text-primary" />
          <p className="text-sm font-semibold">{submitMsg}…</p>
          <p className="text-xs text-muted-foreground">
            현장 정보까지 살펴보느라 잠깐 걸려요
          </p>
        </div>
      )}
    </div>
  );
}
