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

      {/* adaptive: 문항 수가 유동적(5~풀 소진)이라 정확한 n/N 대신 부드러운 진행 표시.
          최소 문항(5) 기준으로 차오르고, 막바지엔 안심 문구. 거짓 "1/5" 약속 안 함. */}
      {mode === "adaptive" && (
        <div className="flex items-center gap-3 pb-2 pt-4">
          <div className="h-1 flex-1 overflow-hidden rounded-full bg-secondary">
            <span
              className="block h-full rounded-full bg-primary transition-all duration-500"
              style={{ width: `${Math.min(((index + 1) / 5) * 100, 100)}%` }}
            />
          </div>
          {index >= 3 && (
            <span className="animate-in fade-in text-xs font-semibold text-muted-foreground">
              {t("onboardingQ.almostThere")}
            </span>
          )}
        </div>
      )}

      {/* Romi 중앙 + 질문 — 화면 상단 2/3에 여유롭게 (ingan.ai 톤) */}
      <div
        key={index}
        className="animate-in fade-in slide-in-from-bottom-1 flex flex-1 flex-col items-center justify-center gap-5 text-center duration-300"
      >
        <span className="flex size-32 items-center justify-center overflow-hidden rounded-[2.5rem]">
          <RoamMotion src="/walk_think.webm" />
        </span>
        <p className="text-[13px] font-medium text-muted-foreground">
          {t(subtitleKey)}
        </p>
        <h1 className="max-w-[18rem] text-2xl font-extrabold leading-snug">
          {t(`onboardingQ.${q.id}.prompt`)}
        </h1>
      </div>

      {/* 답변 카드 — 하단 고정 */}
      <div
        key={`opts-${index}`}
        className="animate-in fade-in flex flex-col gap-2.5 pt-4 duration-300"
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
