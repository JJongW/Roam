"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { RoamMotion, THINKING_POOL } from "@/components/companion/roam-motion";
import { Conversation } from "@/components/onboarding/conversation";
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
type Phase = "intro" | "quiz" | "saving";

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
  const [phase, setPhase] = useState<Phase>("intro");

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
              onClick={() => setPhase("quiz")}
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

      {phase === "quiz" && (
        <Conversation
          mode="adaptive"
          questions={APP_QUESTIONS}
          subtitleKey="onboardingQ.learningApp"
          onComplete={complete}
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
