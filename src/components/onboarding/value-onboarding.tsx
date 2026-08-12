"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCompanionStore } from "@/lib/stores/companion";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";
import { RoamMotion, THINKING_POOL } from "@/components/companion/roam-motion";
import { Conversation } from "@/components/onboarding/conversation";
import {
  clearSessionState,
  useSessionState,
} from "@/lib/hooks/use-session-state";
import { OnboardingResult } from "@/components/onboarding/onboarding-result";
import {
  EXHIBITION_QUESTIONS,
  topValues,
  type Tally,
} from "@/lib/onboarding/questions";
import { RHYTHMS, DEFAULT_RHYTHM, type Rhythm } from "@/lib/feed/rhythm";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type Phase = "intro" | "quiz" | "rhythm" | "saving" | "result";

/**
 * 전시별 관람 가치 온보딩 — Romi 중앙 대화형(고정 4문항, n/N 진행바). 질문 전에 왜 묻는지
 * 사전 설명(intro)부터 — 폼처럼 냅다 질문하지 않는다. 답변을 이 전시의 관람 가치로 집계해
 * 시드한 뒤, 완료 결과 모달을 띄우고 닫으면 피드로. companion-reframe(ingan.ai 스타일).
 */
export function ValueOnboarding({
  slug,
  exhibitionName,
  hallCount,
  themes,
  hasChosenValues,
}: {
  slug: string;
  exhibitionName?: string;
  hallCount?: number;
  themes?: string;
  /** 이미 확신 가치가 있으면(온보딩을 거쳤든 반응으로 쌓였든) 진입 카드를 숨긴다.
   *  예전엔 취향 % 100 도달로 판단했는데, 그 %는 이제 예측 정확도라 5개 판정만
   *  맞아도 100이 되고 하나 틀리면 다시 내려간다 — 카드가 나타났다 사라졌다 하는
   *  근거로 못 쓴다. 확신 가치 존재 여부는 오르내리지 않는다. */
  hasChosenValues: boolean;
}) {
  const router = useRouter();
  const t = useT();
  // 전시별로 키를 나눠 sessionStorage에 남긴다 — 뒤로가기가 이 페이지를 언마운트
  // 시켰다 돌아와도(예전엔 phase가 "intro"로 리셋됐다) 있던 자리에서 이어진다.
  const storeKey = (name: string) => `roam-onboarding-value-${slug}-${name}`;
  const [open, setOpen] = useSessionState(storeKey("open"), false);
  const [phase, setPhase] = useSessionState<Phase>(storeKey("phase"), "intro");
  // 가치 집계는 rhythm 스텝을 거쳐 저장하므로 잠깐 들고 있는다.
  const [tally, setTally] = useSessionState<Tally | null>(
    storeKey("tally"),
    null,
  );
  // 온보딩에서 고른 오늘의 리듬 — 완료 시 ?rhythm= 으로 피드에 반영.
  const [rhythm, setRhythm] = useSessionState<Rhythm>(
    storeKey("rhythm"),
    DEFAULT_RHYTHM,
  );
  // hasChosenValues는 서버 브레인(confidence) 기반이라 router.refresh() 왕복 사이
  // 잠깐 뒤처질 수 있고, 애초에 hasChosenValues가 될 수 없는 경우(로그인 안 한 채
  // 완료 — /api/me/values가 401, 로컬에만 pending으로 쌓인다)도 있다. 두 경우 다
  // "방금 이 전시에서 이미 끝냈다"는 로컬 사실은 always true이므로, 이 플래그가
  // 있으면 진입 카드를 계속 숨긴다(finish에서 안 지운다 — 세션 내내 유지).
  const [completedThisSession, setCompletedThisSession] = useSessionState(
    storeKey("completedThisSession"),
    false,
  );

  // 앱 온보딩을 방금 끝냈고(건너뛰기 아님) 이 전시가 아직 확신 가치가 없으면
  // 자동으로 이어서 연다 — 사용자가 카드를 따로 탭할 필요 없이 "온보딩 하나로
  // 느껴지게" 한다.
  const appOnboardingJustCompleted = useCompanionStore(
    (s) => s.appOnboardingJustCompleted,
  );
  const clearAppOnboardingJustCompleted = useCompanionStore(
    (s) => s.clearAppOnboardingJustCompleted,
  );
  useEffect(() => {
    if (!appOnboardingJustCompleted) return;
    // 이 신호는 hasChosenValues와 무관하게 항상 소비한다 — 앱 온보딩이 이제 홈(/)
    // 에서도 끝날 수 있어 ValueOnboarding이 아예 마운트 안 된 경로에서 신호가 켜진
    // 채 남을 수 있다. 여기서 안 지우면 나중에 방문한, 이미 확신 가치가 있는 다른
    // 전시에서 뒤늦게 잘못 시트가 열린다.
    if (!hasChosenValues) start();
    clearAppOnboardingJustCompleted();
    // start는 리렌더마다 새로 만들어지는 함수라 deps에 넣지 않는다(무한 루프 방지) —
    // appOnboardingJustCompleted가 true → false로 바뀌는 그 순간에만 반응하면 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    appOnboardingJustCompleted,
    hasChosenValues,
    clearAppOnboardingJustCompleted,
  ]);

  function start() {
    setPhase("intro");
    setOpen(true);
  }

  // 가치 4문항 완료 → 바로 저장하지 않고 "오늘 어떻게 볼까"(리듬) 스텝으로.
  function afterQuiz(result: Tally) {
    setTally(result);
    setPhase("rhythm");
  }

  async function complete(picked: Rhythm) {
    setRhythm(picked);
    setPhase("saving");
    const values = tally ? topValues(tally, 3) : [];
    try {
      // 이 컴포넌트 자체가 로그인 사용자에게만 렌더된다(page.tsx의 {user && ...}) —
      // 비로그인 저장 경로는 없다.
      await api.post("/api/me/values", { exhibitionSlug: slug, values });
    } catch {
      // 실패해도 결과로 진행.
    }
    setCompletedThisSession(true);
    setPhase("result");
  }

  function finish() {
    setOpen(false);
    // 다 끝났다 — 남겨두면 다음에 이 전시에 다시 들어왔을 때 "result" 단계로
    // 잘못 이어붙는다(이미 확신 가치가 생겨 카드 자체는 안 뜨지만, 방어적으로 지운다).
    clearSessionState(
      storeKey("open"),
      storeKey("phase"),
      storeKey("tally"),
      storeKey("rhythm"),
    );
    // 고른 리듬을 쿼리로 반영 → 서버가 그 밀도로 피드를 다시 큐레이션.
    router.replace(`/exhibitions/${slug}?rhythm=${rhythm}`, { scroll: false });
    router.refresh();
  }

  return (
    <>
      {/* 이 전시의 메인 액션 — 관람 가치 정하기. 눈에 띄게 primary 강조(다른 카드에
          묻히지 않도록). companion 톤: 로미가 먼저 제안. 취향 파악도 100%면 온보딩을
          이미 마친 것이라 진입 카드를 숨긴다(추가 온보딩 버튼 불필요). */}
      {!hasChosenValues && !completedThisSession && (
        <button
          type="button"
          onClick={start}
          className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-primary to-[#4338ca] p-4 text-left text-primary-foreground shadow-[var(--shadow-pop)] active:scale-[0.99]"
        >
          <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/15 ring-1 ring-white/25">
            <RoamMotion src="/walk_think.webm" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold">{t("valueOnboarding.cardTitle")}</p>
            <p className="text-sm text-primary-foreground/80">
              {t("valueOnboarding.cardSub")}
            </p>
          </div>
          <ChevronRight className="size-5 shrink-0 text-primary-foreground/80" />
        </button>
      )}

      {/* 대화형(고정 진행바) — 전체화면 시트 */}
      <Sheet open={open && phase !== "result"} onOpenChange={setOpen}>
        <SheetContent
          side="bottom"
          className="flex h-[92dvh] flex-col gap-0 p-0"
        >
          <SheetTitle className="sr-only">
            {t("valueOnboarding.cardTitle")}
          </SheetTitle>
          {/* 사전 설명 — 왜 묻는지, 몇 개 물을지 먼저 알려준다(폼 아님). */}
          {phase === "intro" && (
            <div className="flex flex-1 flex-col px-6 pb-8 pt-safe">
              <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
                <span className="flex size-28 items-center justify-center overflow-hidden rounded-[2.25rem]">
                  <RoamMotion src="/walk_think.webm" />
                </span>
                <h2 className="text-2xl font-extrabold leading-snug">
                  {t("valueOnboarding.intro1", { name: exhibitionName ?? "" })}
                </h2>
                <p className="max-w-[20rem] text-[15px] leading-relaxed text-muted-foreground">
                  {hallCount && themes
                    ? t("valueOnboarding.intro3", {
                        halls: hallCount,
                        themes,
                      })
                    : t("valueOnboarding.valuePrompt")}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPhase("quiz")}
                className="w-full rounded-2xl bg-primary px-5 py-4 text-center font-bold text-primary-foreground active:scale-[0.99]"
              >
                {t("valueOnboarding.youOk")}
              </button>
            </div>
          )}
          {phase === "quiz" && (
            <Conversation
              mode="fixed"
              questions={EXHIBITION_QUESTIONS}
              subtitleKey="onboardingQ.learningExhibition"
              onComplete={afterQuiz}
              persistKey={storeKey("quiz")}
            />
          )}
          {phase === "rhythm" && (
            <div className="flex flex-1 flex-col px-6 pb-8 pt-safe">
              <div className="flex flex-1 flex-col justify-center gap-6">
                <div className="flex flex-col items-center gap-4 text-center">
                  <span className="flex size-24 items-center justify-center overflow-hidden rounded-[2rem]">
                    <RoamMotion src="/walk_think.webm" />
                  </span>
                  <h2 className="text-2xl font-extrabold leading-snug">
                    {t("rhythm.question")}
                  </h2>
                </div>
                <div className="flex flex-col gap-2.5">
                  {RHYTHMS.map((r) => (
                    <button
                      key={r.key}
                      type="button"
                      onClick={() => complete(r.key)}
                      className={cn(
                        "flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-4 text-left active:scale-[0.99]",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-bold">{t(`rhythm.${r.key}`)}</p>
                        <p className="text-sm text-muted-foreground">
                          {t(`rhythm.${r.key}Hint`)}
                        </p>
                      </div>
                      <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {phase === "saving" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-24 items-center justify-center overflow-hidden rounded-[2rem]">
                <RoamMotion pool={THINKING_POOL} />
              </span>
              <p className="text-[15px] font-medium text-muted-foreground">
                {t("onboardingQ.analyzing")}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>

      <OnboardingResult open={open && phase === "result"} onClose={finish} />
    </>
  );
}
