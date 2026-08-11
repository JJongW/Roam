"use client";

import { useState } from "react";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import type { InterestValue, VerdictValue } from "@/lib/stores/visit";
import { useAuthStore, promptLoginOncePerExhibition } from "@/lib/stores/auth";
import { useCompanionStore } from "@/lib/stores/companion";
import { buildJudgmentLine } from "@/lib/companion/reaction-line";
import { useT } from "@/lib/i18n/provider";

/**
 * 부스 판단 UI — 관심(피드, 관람 전)과 판정(현장, 관람 후)을 하나의 컴포넌트로
 * 통일한다. 세 모드:
 *
 * - "interest": 꼭 갈래·끌려·패스 3칸만(피드).
 * - "verdict": 좋았어·그냥그랬어·아니었어 3칸만(부스 상세 등 verdict만 다루는 자리).
 * - "adaptive": 지도·부스상세 하단 시트. interest 없으면 interest 3칸+"다녀왔어"
 *   링크, interest 있으면(verdict 없어도) verdict 3칸+"관심 바꾸기" 링크로 뜬다.
 *   verdict가 이미 있으면 그 값이 선택 표시된 verdict 3칸으로 바로 뜬다.
 *   (judgment-vocabulary §8, 2026-08-11 개정 §3-3)
 *
 * 비로그인이어도 버튼은 로컬(visitStore)에 토글된다 — 로미 즉답은 로그인했을
 * 때만(전시당 1회 로그인 안내), 서버 저장도 로그인해야 된다(pushNote가 401을
 * 조용히 삼킴). 로그인하면 소급 반영된다(auth.ts의 syncPendingReactions).
 */
export function JudgmentBar({
  boothId,
  boothName,
  categoryLabel,
  interestSlugs,
  exhibitionSlug,
  mode,
}: {
  boothId: string;
  boothName?: string;
  categoryLabel?: string;
  interestSlugs: string[];
  exhibitionSlug: string;
  mode: "interest" | "verdict" | "adaptive";
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const record = useVisitStore((s) => s.records[boothId]);
  const setInterest = useVisitStore((s) => s.setInterest);
  const setVerdict = useVisitStore((s) => s.setVerdict);
  const say = useCompanionStore((s) => s.say);
  const interests = useCompanionStore((s) => s.interests);

  // adaptive 전용: 링크로 임시 전환한 화면. interest/verdict 실제 값이 바뀌면
  // 이 로컬 오버라이드는 무시되고 실제 상태를 따른다(전환 즉시 반영되도록).
  const [forcedScreen, setForcedScreen] = useState<
    "interest" | "verdict" | null
  >(null);

  const screen: "interest" | "verdict" =
    mode === "interest"
      ? "interest"
      : mode === "verdict"
        ? "verdict"
        : (forcedScreen ??
          (record?.verdict || record?.interest ? "verdict" : "interest"));

  function react(kind: "interest", value: InterestValue): void;
  function react(kind: "verdict", value: VerdictValue): void;
  function react(
    kind: "interest" | "verdict",
    value: InterestValue | VerdictValue,
  ) {
    // good일 때 "예측이 맞았는지"는 반응 직전(스토어 갱신 전)의 interest로 판단한다.
    const matchedPriorInterest =
      kind === "verdict" && value === "good"
        ? record?.interest === "must" || record?.interest === "curious"
        : undefined;

    if (kind === "interest") setInterest(boothId, value as InterestValue);
    else setVerdict(boothId, value as VerdictValue);

    if (user) {
      say(
        buildJudgmentLine(
          kind,
          value,
          interestSlugs,
          boothName,
          categoryLabel,
          interests,
          t,
          { matchedPriorInterest },
        ),
      );
    } else {
      promptLoginOncePerExhibition(exhibitionSlug);
    }
    void pushNote(boothId);
  }

  const interestBtns: { key: InterestValue; label: string }[] = [
    { key: "must", label: t("judge.must") },
    { key: "curious", label: t("judge.curious") },
    { key: "pass", label: t("judge.pass") },
  ];
  const verdictBtns: { key: VerdictValue; label: string }[] = [
    { key: "good", label: t("judge.good") },
    { key: "ok", label: t("judge.ok") },
    { key: "bad", label: t("judge.bad") },
  ];

  return (
    <div className="space-y-1.5">
      {mode === "adaptive" && (record?.interest || record?.verdict) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {record?.interest && `${t(`judge.${record.interest}`)} · `}
            {record?.verdict ? t("judge.visited") : ""}
          </span>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() =>
              setForcedScreen(screen === "interest" ? "verdict" : "interest")
            }
          >
            {screen === "interest"
              ? t("judge.switchToVerdict")
              : t("judge.switchToInterest")}
          </button>
        </div>
      )}

      <div className="flex gap-1.5">
        {(screen === "interest" ? interestBtns : verdictBtns).map((btn) => {
          const active =
            screen === "interest"
              ? record?.interest === btn.key
              : record?.verdict === btn.key;
          return (
            <button
              key={btn.key}
              type="button"
              onClick={() =>
                screen === "interest"
                  ? react("interest", btn.key as InterestValue)
                  : react("verdict", btn.key as VerdictValue)
              }
              aria-pressed={active}
              className={
                active
                  ? "flex-1 rounded-lg border border-primary bg-accent/60 py-1.5 text-xs font-semibold text-primary"
                  : "flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold text-muted-foreground"
              }
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {mode === "adaptive" && screen === "interest" && !record?.verdict && (
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setForcedScreen("verdict")}
        >
          {t("judge.visitedLink")}
        </button>
      )}
    </div>
  );
}
