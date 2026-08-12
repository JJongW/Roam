"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import type { OutcomeCard } from "@/lib/memory/retro-outcomes";

/**
 * "네 예측이 맞았는지" 탭-넘김 카드. app-onboarding.tsx의 GuideSlide와 같은
 * 인터랙션(진행 점 + 다음 버튼) — 이 프로젝트에서 이미 검증된 "짧은 단계
 * 훑기" 패턴을 그대로 재사용한다. 게이트 없이 항상 마운트되므로 별도 완료
 * 콜백은 없다 — 마지막 카드에서 "확인"을 누르면 그냥 사라진다.
 */
export function VisitOutcomeCards({ cards }: { cards: OutcomeCard[] }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (cards.length === 0 || dismissed) return null;

  const current = cards[Math.min(step, cards.length - 1)];
  const isLast = step === cards.length - 1;
  const line = t(`recap.${current.kind === "hit" ? "outcomeHit" : "outcomeReversal"}`, {
    booth: current.boothName,
  });

  return (
    <div className="mb-3 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5">
        {cards.map((_, i) => (
          <span
            key={i}
            className={
              "h-1 flex-1 rounded-full transition-colors " +
              (i <= step ? "bg-primary" : "bg-secondary")
            }
          />
        ))}
      </div>
      <p className="text-[15px] font-medium leading-relaxed">{line}</p>
      <button
        type="button"
        onClick={() => (isLast ? setDismissed(true) : setStep(step + 1))}
        className="mt-3 w-full rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-primary-foreground active:scale-[0.99]"
      >
        {isLast ? t("recap.outcomeDone") : t("recap.outcomeNext")}
      </button>
    </div>
  );
}
