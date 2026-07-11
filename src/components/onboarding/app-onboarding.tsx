"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api/client";
import { RoamMotion } from "@/components/companion/roam-motion";
import { Conversation } from "@/components/onboarding/conversation";
import { useAuthStore } from "@/lib/stores/auth";
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

  if (onboarded || !ready || !user) return null;

  async function complete(tally: Tally) {
    setPhase("saving");
    try {
      await api.post("/api/me/values", { values: topValues(tally, 3) });
    } catch {
      // 실패해도 진행.
    }
    if (typeof window !== "undefined") localStorage.setItem(FLAG, "1");
    setOnboarded(true);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-background">
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
          {/* 하단 고정 CTA */}
          <Button size="lg" className="w-full" onClick={() => setPhase("quiz")}>
            {t("onboardingQ.introCta")}
          </Button>
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
