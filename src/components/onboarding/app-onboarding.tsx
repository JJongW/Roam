"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { RoamMotion } from "@/components/companion/roam-motion";
import { Conversation } from "@/components/onboarding/conversation";
import { useAuthStore, PENDING_VALUES_KEY } from "@/lib/stores/auth";
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
 * (진행바 없음, 충분히 파악될 때까지) → 답변을 관람 가치로 집계해 브레인에 시드. 로그인 후 1회.
 */
export function AppOnboardingGate() {
  const router = useRouter();
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const [onboarded, setOnboarded] = useState(
    () => typeof window !== "undefined" && !!localStorage.getItem(FLAG),
  );
  const [phase, setPhase] = useState<Phase>("intro");

  // 로그인 전에도 뜬다(공개 온보딩) — 취향을 먼저 파악하고, 끝나면 홈 배너로
  // 로그인 가치(추천·저장·다음 전시로 잇기)를 안내한다. ready(하이드레이션)만 기다림.
  if (onboarded || !ready) return null;

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
    if (typeof window !== "undefined") localStorage.setItem(FLAG, "1");
    setOnboarded(true);
    router.refresh();
  }

  // 강제하지 않는다 — 먼저 둘러보고 싶으면 넘어갈 수 있게(플래그만 세팅해 다시 안 뜨게).
  // 취향은 관람하며 반응으로 쌓인다(빈 브레인=인기순 폴백).
  function skip() {
    if (typeof window !== "undefined") localStorage.setItem(FLAG, "1");
    setOnboarded(true);
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
          {/* 로미 + 카피 — 상단 2/3 중앙 (ingan.ai 톤) */}
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <span className="flex size-32 items-center justify-center overflow-hidden rounded-[2.5rem]">
              <RoamMotion src="/walking.mp4" />
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
            <RoamMotion src="/head.mp4" />
          </span>
          <p className="text-[15px] font-medium text-muted-foreground">
            {t("onboardingQ.analyzing")}
          </p>
        </div>
      )}
    </div>
  );
}
