"use client";

// ---------------------------------------------------------------------------
// AI Companion 온보딩 — 오케스트레이터.
//
// 폼이 아니라 대화. 한 번에 하나 묻고, 답에 즉시(0ms, 로컬 템플릿) 반응하고,
// 직전 답에 따라 다음 질문이 바뀐다. Gemini는 탭 경로에 없다 — 가용 시간 답
// 직후 백그라운드로 추론을 prefetch 해두고, 요약 화면에서 이미 와 있으면 쓰고
// 아니면 결정론 빌더 결과로 즉시 보여준다. 동선 빌드는 기존 엔진(/api/route).
// ---------------------------------------------------------------------------

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Check, ChevronLeft, Loader2, X, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api, ApiClientError } from "@/lib/api/client";
import { useOnboardingStore } from "@/lib/stores/onboarding";
import { useRouteStore } from "@/lib/stores/route";
import { useCartStore } from "@/lib/stores/cart";
import { LOADING_MESSAGES } from "@/lib/loading-messages";
import { useRotatingMessage } from "@/lib/hooks/use-rotating-message";
import {
  STEPS,
  FIRST_STEP_ID,
  buildUnderstanding,
  followupAnsweredCount,
  type StepId,
} from "@/lib/onboarding/onboarding-flow";
import {
  emptyOnboardingContext,
  type OnboardingContext,
} from "@/lib/onboarding/onboarding-types";
import { buildProfileFromContext } from "@/lib/onboarding/route-profile-builder";
import type { Category, RoutePlan } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  OnboardingMessage,
  OnboardingOptionButton,
  OnboardingProgress,
  RoutePreviewCard,
  UnderstandingPanel,
} from "@/components/onboarding/parts";

// 한 스텝씩 풀카드로 보여주고, 답하면 통째로 슬라이드 전환(샤라락).
// dir=+1 전진(다음 질문이 오른쪽에서 들어옴), dir=-1 뒤로.
const slideVariants = {
  enter: (dir: number) => ({ x: dir >= 0 ? 48 : -48, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir >= 0 ? -48 : 48, opacity: 0 }),
};
const slideTransition = { duration: 0.32, ease: [0.22, 1, 0.36, 1] as const };

// 로컬 기준 yyyy-mm-dd.
function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const WEEKDAY_KO = ["일", "월", "화", "수", "목", "금", "토"] as const;

/** 전시 기간(start~end) 중 오늘(포함) 이후 날짜만. 지난 날짜는 제외. */
function availableVisitDates(
  startISO: string | undefined,
  endISO: string | undefined,
  todayISO: string,
): { iso: string; label: string; isToday: boolean }[] {
  if (!startISO || !endISO) return [];
  const out: { iso: string; label: string; isToday: boolean }[] = [];
  const cur = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  // 무한루프 방지(최대 60일).
  for (let i = 0; i < 60 && cur <= end; i++) {
    const iso = toLocalISO(cur);
    if (iso >= todayISO) {
      const isToday = iso === todayISO;
      const label = `${cur.getMonth() + 1}/${cur.getDate()} (${WEEKDAY_KO[cur.getDay()]})`;
      out.push({ iso, label, isToday });
    }
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

interface Inference {
  source: string;
  summary: string;
  routeName: string;
  reason: string;
  strategy: string;
  interests: string[];
}

/** 부스 picker용 가벼운 부스 형태. */
export interface PickableBooth {
  id: string;
  name: string;
  code?: string;
  company: string;
  /** Category slugs — shown as chips in the recommendation review. */
  tags?: string[];
}

export function AICompanionOnboarding({
  slug,
  categories,
  booths,
  startDate,
  endDate,
}: {
  slug: string;
  categories: Category[];
  booths: PickableBooth[];
  startDate?: string;
  endDate?: string;
}) {
  const router = useRouter();

  const [ctx, setCtx] = useState<OnboardingContext>(emptyOnboardingContext);
  const [stepId, setStepId] = useState<StepId | null>(FIRST_STEP_ID);
  const [history, setHistory] = useState<
    Array<{ stepId: StepId; ctx: OnboardingContext }>
  >([]);
  const [dir, setDir] = useState(1); // 슬라이드 방향: +1 전진, -1 뒤로
  const [multiSel, setMultiSel] = useState<string[]>([]);
  const [boothQuery, setBoothQuery] = useState(""); // 부스 picker 검색어
  const [submitting, setSubmitting] = useState(false);
  const submitMsg = useRotatingMessage(LOADING_MESSAGES.route, submitting);

  // 추천 결과 리뷰 — 동선을 받은 뒤 바로 지도로 보내지 않고, 추천 부스를
  // 먼저 보여주고 빼거나 더하게 한다. null이면 리뷰 단계 아님.
  const [review, setReview] = useState<{
    route: RoutePlan;
    reason: string;
  } | null>(null);
  const [reviewIds, setReviewIds] = useState<string[]>([]);
  const [reviewQuery, setReviewQuery] = useState("");

  const boothById = useMemo(
    () => new Map(booths.map((b) => [b.id, b])),
    [booths],
  );
  const catNameBySlug = useMemo(
    () => new Map(categories.map((c) => [c.slug, c.name])),
    [categories],
  );

  // 추론 결과는 state — prefetch가 도착하면 요약 화면이 조용히 갱신된다.
  const [inference, setInference] = useState<Inference | null>(null);
  const prefetchedRef = useRef(false);

  const stepDef = stepId ? STEPS[stepId] : null;
  const message = stepDef ? stepDef.message(ctx) : "";
  const question = stepDef ? stepDef.question(ctx) : "";
  const options = useMemo(
    () => (stepDef ? stepDef.options(ctx) : []),
    [stepDef, ctx],
  );
  const isMulti = Boolean(stepDef?.multi);
  const hint = stepDef?.hint;
  const understanding = useMemo(() => buildUnderstanding(ctx), [ctx]);

  // 분기마다 스텝 수가 달라 인덱스 대신 답한 개수로 대략 진행률을 잡는다.
  const progress = stepId ? Math.min(0.92, (history.length + 1) / 8) : 1;

  // 부스 검색 필터 — 이름/회사/코드 부분일치.
  const filteredBooths = useMemo(() => {
    const q = boothQuery.trim().toLowerCase();
    if (!q) return booths.slice(0, 60);
    return booths
      .filter((b) =>
        `${b.name} ${b.company} ${b.code ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, 60);
  }, [booths, boothQuery]);

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

  // 이미 적용된 nextCtx로 다음 스텝으로 전진(슬라이드). 모든 답이 여기로 모인다.
  function advance(nextCtx: OnboardingContext) {
    if (!stepId || !stepDef) return;
    setHistory((h) => [...h, { stepId, ctx }]);
    const nextId = stepDef.next(nextCtx) as StepId | null;
    maybePrefetch(stepId, nextCtx);

    setDir(1);
    setMultiSel([]);
    setBoothQuery("");
    setCtx(nextCtx);
    setStepId(nextId); // null이면 요약 카드로 슬라이드.
  }

  function commit(answer: string | string[]) {
    if (!stepDef) return;
    advance(stepDef.apply(ctx, answer));
  }

  function selectSingle(value: string) {
    if (typeof navigator !== "undefined" && navigator.vibrate)
      navigator.vibrate(8);
    commit(value);
  }

  // 방문 시점 — 커스텀 날짜 선택. 날짜를 직접 고르거나 "아직 미정"만 허용.
  // 빈 채로 넘어가던 버그 차단: 각 버튼이 곧 답이라 미선택 통과가 없다.
  const today = useMemo(() => toLocalISO(new Date()), []);
  const visitDates = useMemo(
    () => availableVisitDates(startDate, endDate, today),
    [startDate, endDate, today],
  );

  function selectDate(iso: string | null) {
    if (typeof navigator !== "undefined" && navigator.vibrate)
      navigator.vibrate(8);
    const nextCtx: OnboardingContext =
      iso === null
        ? { ...ctx, visitDate: undefined, visitDateType: "undecided" }
        : {
            ...ctx,
            visitDate: iso,
            visitDateType: iso === today ? "today" : "specific_date",
          };
    advance(nextCtx);
  }

  function toggleMulti(value: string) {
    setMultiSel((s) =>
      s.includes(value) ? s.filter((v) => v !== value) : [...s, value],
    );
  }

  function confirmMulti() {
    if (multiSel.length === 0) return;
    commit(multiSel);
  }

  // 온보딩을 건너뛰고 지도로 바로 — 동선 생성 없이 빈손으로 지도 진입.
  // 지도에서 "AI 추천"으로 언제든 동선을 만들 수 있다.
  function skipToMap() {
    if (submitting) return;
    router.replace(`/exhibitions/${slug}`); // 피드 착지(지도 강등)
  }

  function goBack() {
    if (history.length === 0) {
      router.back();
      return;
    }
    const prev = history[history.length - 1];
    setHistory((h) => h.slice(0, -1));
    setDir(-1);
    setMultiSel([]);
    setBoothQuery("");
    setCtx(prev.ctx);
    setStepId(prev.stepId);
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
      const { route, reason } = await api.post<{
        route: RoutePlan;
        reason?: string;
      }>("/api/onboarding/route", { exhibitionSlug: slug, context: ctx });
      useOnboardingStore.getState().applyProfile(preference, ctx);
      useCartStore.getState().setIds(route.boothIds);
      // 바로 지도로 보내지 않고 추천 리뷰 단계로 — 부스를 빼거나 더할 수 있게.
      setReviewIds(route.boothIds);
      setReview({ route, reason: reason || routeReason });
      setSubmitting(false);
    } catch (e) {
      toast.error(
        e instanceof ApiClientError
          ? e.error.message
          : "동선 생성에 실패했어요",
      );
      setSubmitting(false);
    }
  }

  // 리뷰에서 부스 빼기/더하기. 지도의 동선 번호는 cart에서 다시 계산되므로
  // (map-view의 buildHallSweepRoute) cart만 맞추면 순서는 자동 재정렬된다.
  function removeReviewBooth(id: string) {
    setReviewIds((ids) => ids.filter((x) => x !== id));
  }
  function addReviewBooth(id: string) {
    setReviewIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
    setReviewQuery("");
  }

  // 리뷰 확정 — 편집한 부스 집합을 동선·cart에 반영하고 지도로.
  function startWithSelection() {
    const r = review?.route;
    if (!r || reviewIds.length === 0) return;
    useRouteStore.getState().setRoute({ ...r, boothIds: reviewIds });
    useCartStore.getState().setIds(reviewIds);
    router.replace(`/exhibitions/${slug}`); // 피드 착지(지도 강등)
  }

  // 리뷰 add-picker 후보 — 아직 안 고른 부스 중 검색어 매칭.
  const reviewCandidates = useMemo(() => {
    const q = reviewQuery.trim().toLowerCase();
    if (!q) return [];
    const chosen = new Set(reviewIds);
    return booths
      .filter(
        (b) =>
          !chosen.has(b.id) &&
          `${b.name} ${b.company} ${b.code ?? ""}`.toLowerCase().includes(q),
      )
      .slice(0, 8);
  }, [booths, reviewQuery, reviewIds]);

  const inSummary = stepId === null;

  // --- 추천 리뷰 화면 ------------------------------------------------------
  if (review) {
    return (
      <div className="flex min-h-dvh flex-col bg-background md:fixed md:inset-0 md:z-30 landscape:fixed landscape:inset-0 landscape:z-30">
        <header className="sticky top-0 z-40 flex items-center gap-3 bg-background/80 px-2 pt-safe backdrop-blur-xl">
          <Button
            variant="ghost"
            size="icon"
            aria-label="이전"
            onClick={() => setReview(null)}
          >
            <ChevronLeft className="size-6" />
          </Button>
          <OnboardingProgress value={1} />
          <div className="w-10 shrink-0" />
        </header>

        <div className="flex-1 overflow-y-auto pb-safe">
          <div className="mx-auto w-full max-w-md space-y-4 px-5 py-6">
            <OnboardingMessage
              text={"이런 동선을 준비했어.\n맘에 안 드는 건 빼도 돼."}
            />
            <p className="rounded-2xl bg-secondary/60 p-3 text-sm leading-relaxed text-foreground/80">
              {review.reason}
            </p>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                추천 부스 {reviewIds.length}곳
              </p>
              {reviewIds.map((id, i) => {
                const b = boothById.get(id);
                if (!b) return null;
                const tagNames = (b.tags ?? [])
                  .map((t) => catNameBySlug.get(t))
                  .filter((n): n is string => Boolean(n))
                  .slice(0, 3);
                return (
                  <div
                    key={id}
                    className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3"
                  >
                    <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold">
                        {b.name}
                        {b.code && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            {b.code}
                          </span>
                        )}
                      </p>
                      {b.company && (
                        <p className="truncate text-xs text-muted-foreground">
                          {b.company}
                        </p>
                      )}
                      {tagNames.length > 0 && (
                        <div className="mt-1.5 flex flex-wrap gap-1">
                          {tagNames.map((n) => (
                            <span
                              key={n}
                              className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      aria-label={`${b.name} 빼기`}
                      onClick={() => removeReviewBooth(id)}
                      className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground active:bg-secondary"
                    >
                      <X className="size-4.5" />
                    </button>
                  </div>
                );
              })}
            </div>

            {/* 부스 더 추가 */}
            <div className="space-y-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={reviewQuery}
                  onChange={(e) => setReviewQuery(e.target.value)}
                  placeholder="부스 더 추가 (이름·회사 검색)"
                  className="pl-9"
                />
              </div>
              {reviewCandidates.length > 0 && (
                <div className="space-y-1.5">
                  {reviewCandidates.map((b) => (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => addReviewBooth(b.id)}
                      className="flex w-full items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-left active:bg-secondary"
                    >
                      <Plus className="size-4 shrink-0 text-primary" />
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold">
                        {b.name}
                        <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                          {b.company}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="sticky bottom-0 border-t border-border bg-background/90 px-5 py-3 pb-safe backdrop-blur-xl">
          <Button
            size="lg"
            className="w-full"
            disabled={reviewIds.length === 0}
            onClick={startWithSelection}
          >
            {reviewIds.length === 0
              ? "부스를 1곳 이상 골라줘"
              : `이 ${reviewIds.length}곳으로 시작하기`}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background md:fixed md:inset-0 md:z-30 landscape:fixed landscape:inset-0 landscape:z-30">
      <header className="sticky top-0 z-40 flex items-center gap-3 bg-background/80 px-2 pt-safe backdrop-blur-xl">
        <Button variant="ghost" size="icon" aria-label="이전" onClick={goBack}>
          <ChevronLeft className="size-6" />
        </Button>
        <OnboardingProgress value={progress} />
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 text-muted-foreground"
          disabled={submitting}
          onClick={skipToMap}
        >
          건너뛰기
        </Button>
      </header>

      <div className="flex flex-1 overflow-hidden md:gap-8 md:px-10 landscape:gap-8 landscape:px-10">
        {/* 대화 — 한 스텝씩 풀카드, 답하면 통째로 슬라이드(샤라락) */}
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

          <div className="relative flex-1 overflow-x-hidden overflow-y-auto pb-safe">
            <AnimatePresence mode="wait" custom={dir} initial={false}>
              <motion.div
                key={
                  inSummary
                    ? "summary"
                    : stepId === "followup"
                      ? `followup:${followupAnsweredCount(ctx)}`
                      : stepId
                }
                custom={dir}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={slideTransition}
                className="mx-auto flex min-h-full w-full max-w-md flex-col justify-center gap-7 px-5 py-8"
              >
                {inSummary ? (
                  <div className="space-y-3">
                    <OnboardingMessage
                      text={"좋아.\n지금까지 이야기한 내용을 정리해볼게."}
                    />
                    {inference?.summary && (
                      <p className="text-sm leading-relaxed text-foreground/80">
                        {inference.summary}
                      </p>
                    )}
                    <UnderstandingPanel items={understanding} />
                    <RoutePreviewCard name={routeName} reason={routeReason} />
                    <Button
                      size="lg"
                      className="mt-1 w-full"
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
                  </div>
                ) : (
                  <>
                    <div className="space-y-2.5">
                      <OnboardingMessage text={message} />
                      <p className="text-xl font-bold leading-snug">
                        {question}
                      </p>
                      {hint && (
                        <p className="text-sm text-muted-foreground">{hint}</p>
                      )}
                    </div>

                    {stepId === "visit_date" ? (
                      // 커스텀 날짜 선택 — 전시 기간 중 오늘 이후만. 빈 통과 없음.
                      <div className="space-y-2.5">
                        {visitDates.length === 0 && (
                          <p className="text-sm text-muted-foreground">
                            전시 기간이 지났어. 아래에서 이어가자.
                          </p>
                        )}
                        {visitDates.length > 0 && (
                          <div className="grid grid-cols-2 gap-2.5">
                            {visitDates.map((d) => (
                              <button
                                key={d.iso}
                                type="button"
                                onClick={() => selectDate(d.iso)}
                                className="rounded-2xl border border-border bg-card px-4 py-3.5 text-left transition-colors hover:bg-secondary/50 active:scale-[0.99]"
                              >
                                <span className="block font-bold">
                                  {d.isToday ? "오늘" : d.label}
                                </span>
                                {d.isToday && (
                                  <span className="mt-0.5 block text-xs text-muted-foreground">
                                    {d.label}
                                  </span>
                                )}
                              </button>
                            ))}
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => selectDate(null)}
                          className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 text-left font-bold transition-colors hover:bg-secondary/50 active:scale-[0.99]"
                        >
                          아직 정하지 않았어
                        </button>
                      </div>
                    ) : stepId === "booth_pick" ? (
                      // 부스 직접 선택 — 검색 + 다중 선택. 확정 시 commit(선택 id).
                      <div className="space-y-2.5">
                        <input
                          type="text"
                          value={boothQuery}
                          onChange={(e) => setBoothQuery(e.target.value)}
                          placeholder="부스 이름·출판사·코드 검색"
                          className="w-full rounded-2xl border border-border bg-card px-4 py-3 text-[15px] outline-none focus:border-primary"
                        />
                        {multiSel.length > 0 && (
                          <p className="text-sm text-muted-foreground">
                            {multiSel.length}곳 선택됨
                          </p>
                        )}
                        <div className="max-h-[46vh] space-y-2 overflow-y-auto">
                          {filteredBooths.length === 0 && (
                            <p className="px-1 py-4 text-sm text-muted-foreground">
                              검색 결과가 없어. 다른 키워드로 찾아봐.
                            </p>
                          )}
                          {filteredBooths.map((b) => {
                            const selected = multiSel.includes(b.id);
                            return (
                              <button
                                key={b.id}
                                type="button"
                                aria-pressed={selected}
                                onClick={() => toggleMulti(b.id)}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-2xl border px-4 py-3 text-left transition-colors active:scale-[0.99]",
                                  selected
                                    ? "border-primary bg-accent/40"
                                    : "border-border bg-card hover:bg-secondary/50",
                                )}
                              >
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate font-bold">
                                    {b.name}
                                  </span>
                                  <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                                    {b.code ? `${b.code} · ` : ""}
                                    {b.company}
                                  </span>
                                </span>
                                {selected && (
                                  <Check className="size-5 shrink-0 text-primary" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                        <Button
                          size="lg"
                          className="mt-1 w-full"
                          disabled={multiSel.length === 0}
                          onClick={confirmMulti}
                        >
                          {multiSel.length > 0
                            ? `${multiSel.length}곳 담고 계속`
                            : "부스를 골라줘"}
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {options.map((o) => (
                          <OnboardingOptionButton
                            key={o.value}
                            option={o}
                            selected={isMulti && multiSel.includes(o.value)}
                            onClick={() =>
                              isMulti
                                ? toggleMulti(o.value)
                                : selectSingle(o.value)
                            }
                          />
                        ))}
                        {/* 다중 선택만 확정 버튼 필요. 단일은 누르면 바로 다음. */}
                        {isMulti && (
                          <Button
                            size="lg"
                            className="mt-1 w-full"
                            disabled={multiSel.length === 0}
                            onClick={confirmMulti}
                          >
                            다음
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
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
