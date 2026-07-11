"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { api } from "@/lib/api/client";
import { useT } from "@/lib/i18n/provider";
import { RoamMotion } from "@/components/companion/roam-motion";
import { Conversation } from "@/components/onboarding/conversation";
import { OnboardingResult } from "@/components/onboarding/onboarding-result";
import {
  EXHIBITION_QUESTIONS,
  topValues,
  type Tally,
} from "@/lib/onboarding/questions";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";

type Phase = "intro" | "quiz" | "saving" | "result";

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
}: {
  slug: string;
  exhibitionName?: string;
  hallCount?: number;
  themes?: string;
}) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("intro");

  function start() {
    setPhase("intro");
    setOpen(true);
  }

  async function complete(tally: Tally) {
    setPhase("saving");
    try {
      await api.post("/api/me/values", {
        exhibitionSlug: slug,
        values: topValues(tally, 3),
      });
    } catch {
      // 실패해도 결과로 진행.
    }
    setPhase("result");
  }

  function finish() {
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {/* 이 전시의 메인 액션 — 관람 가치 정하기. 눈에 띄게 primary 강조(다른 카드에
          묻히지 않도록). companion 톤: 로미가 먼저 제안. */}
      <button
        type="button"
        onClick={start}
        className="flex w-full items-center gap-3 rounded-2xl bg-gradient-to-br from-primary to-[#4338ca] p-4 text-left text-primary-foreground shadow-[var(--shadow-pop)] active:scale-[0.99]"
      >
        <span className="flex size-11 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-white/15 ring-1 ring-white/25">
          <RoamMotion src="/head.mp4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t("valueOnboarding.cardTitle")}</p>
          <p className="text-sm text-primary-foreground/80">
            {t("valueOnboarding.cardSub")}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-primary-foreground/80" />
      </button>

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
                  <RoamMotion src="/head.mp4" />
                </span>
                <h1 className="text-2xl font-extrabold leading-snug">
                  {t("valueOnboarding.intro1", { name: exhibitionName ?? "" })}
                </h1>
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
              onComplete={complete}
            />
          )}
          {phase === "saving" && (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
              <span className="flex size-24 items-center justify-center overflow-hidden rounded-[2rem]">
                <RoamMotion src="/head.mp4" />
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
