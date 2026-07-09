"use client";

import { useState } from "react";
import { RoamMotion } from "@/components/companion/roam-motion";
import { useT } from "@/lib/i18n/provider";
import {
  shouldStopAdaptive,
  tallyAdd,
  type Question,
  type Tally,
} from "@/lib/onboarding/questions";

/**
 * 대화형 온보딩 — ingan.ai 스타일. Romi가 화면 중앙에, 시나리오 질문 + 4개 답변 카드.
 * mode="adaptive": 진행바 없음, 충분히 파악될 때까지 풀에서 계속(앱 최초진입).
 * mode="fixed": n/N 진행바, 고정 문항 셋(전시별). 답변→가치 tally 누적 후 onComplete.
 * 레이아웃만 담당 — 부모가 전체화면/시트로 감싼다.
 */
export function Conversation({
  mode,
  questions,
  subtitleKey,
  onComplete,
}: {
  mode: "adaptive" | "fixed";
  questions: Question[];
  /** Romi 아래 서브카피 i18n 키(예: onboardingQ.learning). */
  subtitleKey: string;
  onComplete: (tally: Tally, answered: number) => void;
}) {
  const t = useT();
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState<Tally>({});

  const q = questions[index];
  const total = questions.length;

  function pick(optKey: string) {
    const opt = q.options.find((o) => o.key === optKey);
    if (!opt) return;
    const next = tallyAdd(tally, opt);
    const answered = index + 1;
    const done =
      mode === "fixed"
        ? answered >= total
        : shouldStopAdaptive(next, answered, total);
    if (done) {
      onComplete(next, answered);
      return;
    }
    setTally(next);
    setIndex(index + 1);
  }

  return (
    <div className="flex flex-1 flex-col px-6 pb-8 pt-safe">
      {/* fixed: 상단 n/N 진행 */}
      {mode === "fixed" && (
        <div className="flex items-center gap-3 pb-2 pt-4">
          <div className="flex flex-1 gap-1.5">
            {Array.from({ length: total }).map((_, i) => (
              <span
                key={i}
                className={
                  "h-1 flex-1 rounded-full transition-colors " +
                  (i <= index ? "bg-primary" : "bg-secondary")
                }
              />
            ))}
          </div>
          <span className="text-xs font-semibold tabular-nums text-muted-foreground">
            {index + 1}/{total}
          </span>
        </div>
      )}

      {/* Romi 중앙 + 질문 */}
      <div
        key={index}
        className="animate-in fade-in slide-in-from-bottom-1 flex flex-col items-center gap-4 pt-8 text-center duration-300"
      >
        <span className="flex size-28 items-center justify-center overflow-hidden rounded-[2rem]">
          <RoamMotion src="/walking.mp4" />
        </span>
        <p className="text-[13px] text-muted-foreground">{t(subtitleKey)}</p>
        <h1 className="max-w-[20rem] text-xl font-extrabold leading-relaxed">
          {t(`onboardingQ.${q.id}.prompt`)}
        </h1>
      </div>

      {/* 답변 카드 */}
      <div
        key={`opts-${index}`}
        className="animate-in fade-in mt-6 flex flex-col gap-2.5 duration-300"
      >
        {q.options.map((o) => (
          <button
            key={o.key}
            type="button"
            onClick={() => pick(o.key)}
            className="rounded-2xl border border-border bg-card px-5 py-4 text-left text-[15px] font-medium active:scale-[0.99] active:bg-accent/40"
          >
            {t(`onboardingQ.${q.id}.${o.key}`)}
          </button>
        ))}
      </div>
    </div>
  );
}
