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

type Phase = "quiz" | "saving" | "result";

/**
 * 전시별 관람 가치 온보딩 — Romi 중앙 대화형(고정 4문항, n/N 진행바). 답변을 이 전시의 관람
 * 가치로 집계해 시드한 뒤, 완료 결과 모달(관람 프로필)을 띄우고 닫으면 피드로.
 * companion-reframe: 온보딩 대화형 재정의(ingan.ai 스타일).
 */
export function ValueOnboarding({ slug }: { slug: string }) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("quiz");

  function start() {
    setPhase("quiz");
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
      <button
        type="button"
        onClick={start}
        className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-accent/40 p-4 text-left shadow-[var(--shadow-card)] active:scale-[0.99]"
      >
        <span className="flex size-11 items-center justify-center overflow-hidden rounded-xl ring-1 ring-border">
          <RoamMotion src="/head.mp4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{t("valueOnboarding.cardTitle")}</p>
          <p className="text-sm text-muted-foreground">
            {t("valueOnboarding.cardSub")}
          </p>
        </div>
        <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
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
