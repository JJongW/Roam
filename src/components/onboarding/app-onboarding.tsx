"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { RoamMotion, THINKING_POOL } from "@/components/companion/roam-motion";
import { Conversation } from "@/components/onboarding/conversation";
import {
  clearSessionState,
  useSessionState,
} from "@/lib/hooks/use-session-state";
import { LegalLinks } from "@/components/common/legal-links";
import { useAuthStore, PENDING_VALUES_KEY } from "@/lib/stores/auth";
import { useCompanionStore } from "@/lib/stores/companion";
import {
  canShowAppOnboarding,
  isAppOnboardingDismissed,
} from "@/lib/onboarding/app-onboarding-gate";
import { useT } from "@/lib/i18n/provider";
import {
  APP_QUESTIONS,
  topValues,
  type Tally,
} from "@/lib/onboarding/questions";
import { Button } from "@/components/ui/button";

const FLAG = "roam-app-onboarded";
type Phase = "intro" | "guide" | "quiz" | "saving";

/** "이렇게 쓰면 돼" 3단계 — 기능 자랑이 아니라 실제 사용 순서를 그대로 보여준다
 *  (브레인스토밍에서 "기능 카드"로 먼저 시도했다가 "신뢰가 안 간다"는 피드백으로
 *  이 안내형 구조로 바뀌었다). titleKey/descKey는 dictionaries.ts의 onboardingQ.*
 *  네임스페이스를 가리킨다. */
const GUIDE_STEPS = [
  { titleKey: "onboardingQ.guide1Title", descKey: "onboardingQ.guide1Desc" },
  { titleKey: "onboardingQ.guide2Title", descKey: "onboardingQ.guide2Desc" },
  { titleKey: "onboardingQ.guide3Title", descKey: "onboardingQ.guide3Desc" },
] as const;

/**
 * 앱 최초진입 온보딩 — Romi 중앙 대화형(ingan.ai 스타일). 짧은 인사 → 적응형 시나리오 Q&A
 * (진행바 없음, 충분히 파악될 때까지) → 답변을 관람 가치로 집계해 브레인에 시드.
 *
 * 재노출 판정은 isAppOnboardingDismissed(로컬 dismiss 우선, 로그인 상태에선 서버
 * 신호가 추가 조건) — 완료든 건너뛰기든 로그인 여부와 무관하게 항상 로컬(localStorage)
 * 에도 기록한다. 로그인 응답의 needsOnboarding은 로그인 시점(소급 반영 전) 기준이라
 * 낡을 수 있어서, 로컬 dismiss가 없으면 그 낡은 값 때문에 방금 끝낸 온보딩이 로그인
 * 직후 다시 뜨는 버그가 있었다 — 로컬 dismiss를 항상 같이 남겨 방지한다.
 */
export function AppOnboardingGate() {
  const router = useRouter();
  const pathname = usePathname();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const needsOnboarding = useAuthStore((s) => s.needsOnboarding);
  const setNeedsOnboarding = useAuthStore((s) => s.setNeedsOnboarding);
  const signalAppOnboardingComplete = useCompanionStore(
    (s) => s.signalAppOnboardingComplete,
  );
  const [anonDismissed, setAnonDismissed] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem(FLAG),
  );
  // 뒤로가기가 이 오버레이를 언마운트시켰다 돌아와도(canShowAppOnboarding이 false인
  // 경로로 잠깐 나갔다 온 경우 등) phase가 "intro"로 리셋되지 않게 sessionStorage에
  // 같이 남긴다.
  const [phase, setPhase] = useSessionState<Phase>(
    "roam-onboarding-app-phase",
    "intro",
  );
  // guide phase 자체의 몇 번째 슬라이드인지도 세션스토리지에 남긴다 — phase가
  // "guide"로 남아있어도 이 값이 리셋되면 뒤로가기 한 번에 슬라이드 진행이
  // 처음으로 돌아간 것처럼 보인다.
  const [guideStep, setGuideStep] = useSessionState<number>(
    "roam-onboarding-app-guide-step",
    0,
  );

  const onboarded = isAppOnboardingDismissed({
    user,
    needsOnboarding,
    anonDismissed,
  });
  // 랜딩은 덮지 않는다 — 첫 화면은 이 서비스가 뭔지 알 수 있는 홈이어야 한다.
  if (onboarded || !ready || !canShowAppOnboarding(pathname)) return null;

  // 로그인 여부와 무관하게 항상 로컬에도 dismiss를 남긴다(위 문서 주석 참고).
  function dismissLocally() {
    if (typeof window !== "undefined") localStorage.setItem(FLAG, "1");
    setAnonDismissed(true);
    clearSessionState("roam-onboarding-app-phase");
  }

  // guide는 3장 다 보거나 건너뛰면 quiz로 — 둘 다 같은 목적지라 별도 분기가
  // 필요 없다(건너뛰기가 "이 온보딩 전체를 그만둔다"는 뜻이 아니라 "안내만
  // 생략한다"는 뜻이므로 dismissLocally를 부르지 않는다).
  function finishGuide() {
    setGuideStep(0);
    setPhase("quiz");
  }

  async function complete(tally: Tally) {
    setPhase("saving");
    const values = topValues(tally, 3);
    try {
      if (user) {
        await api.post("/api/me/values", { values });
      } else if (typeof window !== "undefined") {
        // 미로그인: 취향을 로컬에 담아두고, 로그인 시 브레인에 동기화(auth store).
        localStorage.setItem(PENDING_VALUES_KEY, JSON.stringify(values));
      }
    } catch {
      // 실패해도 진행.
    }
    if (user) setNeedsOnboarding(false);
    dismissLocally();
    // 지금 전시 페이지에 있으면 그 전시의 관람 가치 온보딩으로 자동으로 이어준다
    // (ValueOnboarding이 구독). 건너뛰기(skip)는 이 신호를 안 보낸다.
    signalAppOnboardingComplete();
    router.refresh();
  }

  // 강제하지 않는다 — 먼저 둘러보고 싶으면 넘어갈 수 있게(로컬에 dismiss만 남겨
  // 다시 안 뜨게). 취향은 관람하며 반응으로 쌓인다(빈 브레인=인기순 폴백).
  function skip() {
    if (user) setNeedsOnboarding(false);
    dismissLocally();
  }

  return (
    // aria-modal: 온보딩 활성 동안 뒤 홈 콘텐츠를 보조기술 트리에서 비활성으로 —
    // 스크린리더가 질문과 배경 카드를 동시에 읽지 않도록. 시각적으론 불투명 bg가 덮음.
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("onboardingQ.introTitle")}
      className="fixed inset-0 z-[100] flex flex-col bg-background"
    >
      {phase === "intro" && (
        <div className="flex flex-1 flex-col px-6 pb-8 pt-safe">
          {/* 앱 이름 + 한 줄 소개 — 이 인트로는 언어 게이트 다음, 홈보다 **먼저** 뜨는
              전체화면이라 처음 온 사람(그리고 Google OAuth 심사관)이 실제로 보는 화면이다.
              로미 인사만 있으면 "이게 무슨 앱인지"와 "앱 이름"이 어디에도 안 나온다 —
              심사가 그 두 가지로 반려했다. 로미 톤을 해치지 않게 상단에 작게만 둔다. */}
          <div className="flex flex-col items-center gap-0.5 pt-1">
            <span className="text-base font-extrabold tracking-tight">
              Roam
            </span>
            <span className="text-xs text-muted-foreground">
              {t("home.taglineShort")}
            </span>
          </div>
          {/* 로미 + 카피 — 상단 2/3 중앙 (ingan.ai 톤) */}
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <span className="flex size-32 items-center justify-center overflow-hidden rounded-[2.5rem]">
              <RoamMotion src="/walk_think.webm" />
            </span>
            <h1 className="text-2xl font-extrabold leading-snug">
              {t("onboardingQ.introTitle")}
            </h1>
            <p className="max-w-[20rem] text-[15px] leading-relaxed text-muted-foreground">
              {t("onboardingQ.introSub")}
            </p>
          </div>
          {/* 하단 고정 CTA + 스킵(강제 아님) */}
          <div className="space-y-2">
            <Button
              size="lg"
              className="w-full"
              onClick={() => setPhase("guide")}
            >
              {t("onboardingQ.introCta")}
            </Button>
            <button
              type="button"
              onClick={skip}
              className="w-full py-2 text-sm font-medium text-muted-foreground active:opacity-70"
            >
              {t("onboardingQ.introSkip")}
            </button>
            {/* 이 인트로도 화면 전체를 덮어 홈 푸터를 가린다 — 방침 링크를 여기에도. */}
            <LegalLinks className="pt-1" />
          </div>
        </div>
      )}

      {phase === "guide" && (
        <GuideSlide
          step={guideStep}
          onNext={() =>
            guideStep >= GUIDE_STEPS.length - 1
              ? finishGuide()
              : setGuideStep(guideStep + 1)
          }
          onSkip={finishGuide}
          t={t}
        />
      )}

      {phase === "quiz" && (
        <Conversation
          mode="adaptive"
          questions={APP_QUESTIONS}
          subtitleKey="onboardingQ.learningApp"
          onComplete={complete}
          persistKey="roam-onboarding-app-quiz"
        />
      )}

      {phase === "saving" && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center">
          <span className="flex size-24 items-center justify-center overflow-hidden rounded-[2rem]">
            <RoamMotion pool={THINKING_POOL} />
          </span>
          <p className="text-[15px] font-medium text-muted-foreground">
            {t("onboardingQ.analyzing")}
          </p>
        </div>
      )}
    </div>
  );
}

/**
 * "이렇게 쓰면 돼" 3단계 안내 슬라이드 — 각 단계는 실제 앱 화면을 최소한으로
 * 재현한 미리보기를 보여준다(아이콘 카드가 아니다 — 브레인스토밍에서 아이콘
 * 버전은 "신뢰가 안 간다"는 반응을 받았다). 색상은 지도·JudgmentBar와 같은
 * --judge-* 토큰을 그대로 참조해, 나중에 실제 화면에서 볼 색과 여기서 미리
 * 본 색이 어긋나지 않게 한다.
 */
function GuideSlide({
  step,
  onNext,
  onSkip,
  t,
}: {
  step: number;
  onNext: () => void;
  onSkip: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const current = GUIDE_STEPS[step];
  const isLast = step === GUIDE_STEPS.length - 1;

  return (
    <div className="flex flex-1 flex-col px-6 pb-8 pt-safe">
      <div className="flex items-center gap-1.5 pt-2">
        {GUIDE_STEPS.map((_, i) => (
          <span
            key={i}
            className={
              "h-1 flex-1 rounded-full transition-colors " +
              (i <= step ? "bg-primary" : "bg-secondary")
            }
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          STEP {step + 1}
        </span>
        <h2 className="max-w-[18rem] text-2xl font-extrabold leading-snug">
          {t(current.titleKey)}
        </h2>
        <p className="max-w-[20rem] text-[15px] leading-relaxed text-muted-foreground">
          {t(current.descKey)}
        </p>

        <GuidePreview step={step} />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-2xl bg-primary px-5 py-4 text-center font-bold text-primary-foreground active:scale-[0.99]"
        >
          {isLast ? t("onboardingQ.guideDone") : t("onboardingQ.guideNext")}
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2 text-sm font-medium text-muted-foreground active:opacity-70"
          >
            {t("onboardingQ.introSkip")}
          </button>
        )}
      </div>
    </div>
  );
}

/** 단계별 미니 미리보기 — 실제 색상 토큰·카드 형태를 그대로 쓴다. */
function GuidePreview({ step }: { step: number }) {
  if (step === 0) {
    // STEP 1: 취향 질문 카드 — Conversation의 답변 카드와 같은 모양.
    return (
      <div className="w-full max-w-[16rem] rounded-2xl border border-border bg-card px-4 py-3.5 text-left">
        <div className="mb-2.5 text-[13px] font-bold">오늘은 뭐가 끌려?</div>
        <div className="space-y-1.5">
          <div className="rounded-xl border border-border px-3 py-2 text-xs">
            직접 만져보고 사는 게 좋아
          </div>
          <div className="rounded-xl border border-primary px-3 py-2 text-xs font-semibold text-primary">
            몰랐던 걸 발견하고 싶어
          </div>
        </div>
      </div>
    );
  }
  if (step === 1) {
    // STEP 2: 피드 카드 + JudgmentBar와 같은 반응 버튼 모양(색은 --judge-must).
    return (
      <div className="w-full max-w-[16rem] rounded-2xl border border-border bg-card p-3.5 text-left">
        <div className="mb-2 h-16 rounded-lg bg-secondary" />
        <div className="mb-2 text-[13px] font-bold">단어의 시각적 번역</div>
        <div className="flex gap-1.5">
          <div
            className="flex-1 rounded-lg border py-1.5 text-center text-[11px] font-semibold"
            style={{
              borderColor: "var(--judge-must)",
              backgroundColor:
                "color-mix(in srgb, var(--judge-must) 16%, transparent)",
              color: "var(--judge-must)",
            }}
          >
            꼭 갈래
          </div>
          <div className="flex-1 rounded-lg border border-border py-1.5 text-center text-[11px] text-muted-foreground">
            패스
          </div>
        </div>
      </div>
    );
  }
  // STEP 3: 지도 색 미리보기 — 판단 색 4가지를 점으로.
  return (
    <div className="flex w-full max-w-[16rem] items-center justify-center gap-4 rounded-2xl border border-border bg-card px-4 py-6">
      {(
        [
          ["var(--judge-must)", "꼭 갈래"],
          ["var(--judge-good)", "좋았어"],
          ["var(--judge-bad)", "아니었어"],
          ["var(--judge-pass)", "패스"],
        ] as const
      ).map(([color, label]) => (
        <div key={label} className="flex flex-col items-center gap-1">
          <span
            className="size-5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
