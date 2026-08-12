"use client";

import { useState } from "react";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import type { InterestValue, VerdictValue } from "@/lib/stores/visit";
import { useAuthStore, promptLoginOncePerExhibition } from "@/lib/stores/auth";
import { TASTE_DROP_ALERT_POINTS } from "@/lib/constants";
import { useCompanionStore } from "@/lib/stores/companion";
import { buildJudgmentLine } from "@/lib/companion/reaction-line";
import { useT } from "@/lib/i18n/provider";

/** 지도·범례와 같은 색을 버튼에도 그대로 쓴다 — 어떤 판단인지 색으로도 바로 읽힌다. */
const JUDGE_COLOR: Record<InterestValue | VerdictValue, string> = {
  must: "var(--judge-must)",
  curious: "var(--judge-curious)",
  pass: "var(--judge-pass)",
  good: "var(--judge-good)",
  ok: "var(--judge-ok)",
  bad: "var(--judge-bad)",
};

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

  // adaptive 전용: "다녀왔어"/"관심 바꾸기" 링크로 임시 전환한 화면. react()가
  // interest/verdict를 실제로 바꿀 때마다 null로 되돌려, 다음 렌더는 이 오버라이드
  // 없이 실제 상태(record.verdict||interest)로 다시 계산된다 — 그래서 값을 실제로
  // 바꾸는 순간에만 "따라간다"(그 전엔 링크로 고정한 화면이 그대로 유지된다).
  const [forcedScreen, setForcedScreen] = useState<
    "interest" | "verdict" | null
  >(null);
  // 방금 누른 버튼에만 한 번 팝 애니메이션을 태운다 — 안 눌린 버튼도 옅게 색이
  // 있으면 선택 여부가 안 읽힌다는 피드백으로, 안 눌린 쪽은 색을 완전히 빼고
  // 선택 자체는 이 애니메이션 + active 스타일로만 표시한다.
  const [justSelected, setJustSelected] = useState<
    InterestValue | VerdictValue | null
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
    setForcedScreen(null);
    setJustSelected(value);

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

    // touched: 이 호출이 실제로 바꾸는 필드만 서버로 보낸다(judgment-vocabulary
    // 최종 리뷰 Fix 1) — 나머지 필드 키는 아예 안 넣어 "안 건드림"으로 읽히게 한다.
    const prevJudged = useCompanionStore.getState().tasteJudged;
    const prevPct = useCompanionStore.getState().tastePct;
    const touched =
      kind === "interest" ? { interest: true } : { verdict: true };
    void pushNote(boothId, touched).then((taste) => {
      if (!taste) return;
      useCompanionStore.getState().setTaste(taste.judgedCount, taste.pct);
      if (prevJudged < 5 && taste.judgedCount >= 5) {
        useCompanionStore.getState().say(t("companion.tasteInsight"));
      } else if (
        prevPct !== null &&
        taste.pct !== null &&
        prevPct - taste.pct >= TASTE_DROP_ALERT_POINTS
      ) {
        useCompanionStore.getState().say(t("companion.tasteDropInsight"));
      }
    });
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
      {/* "다녀왔어" 링크로 넘어온 것뿐, interest·verdict 둘 다 아직 없는 경우도
          아래 판정 화면에 걸린다 — 그런데 이 블록 조건이 record만 봐서 그 경우
          되돌아갈 링크 자체가 안 떴다("다녀왔어"가 편도였다). forcedScreen도
          같이 본다. */}
      {mode === "adaptive" &&
        (record?.interest || record?.verdict || forcedScreen) && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {record?.interest && t(`judge.${record.interest}`)}
              {record?.interest && record?.verdict && " · "}
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
                : record?.interest || record?.verdict
                  ? t("judge.switchToInterest")
                  : t("judge.notVisitedYet")}
            </button>
          </div>
        )}

      <div className="flex gap-1.5">
        {(screen === "interest" ? interestBtns : verdictBtns).map((btn) => {
          const active =
            screen === "interest"
              ? record?.interest === btn.key
              : record?.verdict === btn.key;
          const color = JUDGE_COLOR[btn.key];
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
              // 안 눌린 상태는 색을 아예 빼서 눌린 것과 확실히 갈린다(옅은 색조는
              // 선택 여부가 안 읽힌다는 피드백으로 뺐다) — 선택은 색 + 팝 애니메이션으로만.
              style={
                active
                  ? {
                      borderColor: color,
                      backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
                      color,
                    }
                  : undefined
              }
              onAnimationEnd={() => setJustSelected(null)}
              className={`flex-1 scale-100 rounded-lg border py-1.5 text-xs font-semibold transition-all duration-200 active:scale-95 ${
                active
                  ? btn.key === justSelected
                    ? "animate-in zoom-in-95 duration-300"
                    : ""
                  : "border-border bg-card text-muted-foreground"
              }`}
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
