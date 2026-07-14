"use client";

import { useState } from "react";
import { Check, Clock3, Heart, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { cn } from "@/lib/utils";
import { useVisitStore, pushNote, type BoothStatus } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";
import type { TFn } from "@/lib/i18n/resolve";
import type { SignalKind } from "@/lib/types";

/**
 * 부스 반응 버튼(끌림/나중에/별로/이미봄). 스스로 갈지 말지 판단한 결과를 신호로 남겨
 * 브레인에 피드백하고, 방문 상태(visitStore)에도 반영해 지도 부스 색을 칠한다
 * (초록=가봄, 노랑=끌림). companion-reframe §7.5 — 명령이 아니라 사용자의 반응을 받는다.
 */
const REACTIONS: {
  key: string;
  label: string;
  kind: SignalKind;
  /** 지도 색칠용 방문 상태(로컬). null이면 상태 없음. */
  status: BoothStatus | null;
  Icon: typeof Heart;
}[] = [
  {
    key: "interested",
    label: "끌림",
    kind: "reaction_interested",
    status: "interested",
    Icon: Heart,
  },
  {
    key: "later",
    label: "나중에",
    kind: "reaction_later",
    status: "interested",
    Icon: Clock3,
  },
  {
    key: "skip",
    label: "별로",
    kind: "booth_skipped",
    status: "skipped",
    Icon: X,
  },
  {
    key: "seen",
    label: "이미 봄",
    kind: "booth_visited",
    status: "visited",
    Icon: Check,
  },
];

/** 반응 종류 + 대표 가치 → 로미 즉답. 가치 라벨 있으면 그 결로 구체화. */
function reactionLine(
  key: string,
  valueLabel: string | undefined,
  t: TFn,
): string | null {
  switch (key) {
    case "interested":
      return valueLabel
        ? t("companion.reactInterested", { value: valueLabel })
        : t("companion.reactInterestedPlain");
    case "later":
      return t("companion.reactLater");
    case "skip":
      return valueLabel
        ? t("companion.reactSkip", { value: valueLabel })
        : t("companion.reactSkipPlain");
    case "seen":
      return t("companion.reactSeen");
    default:
      return null;
  }
}

/** 저장된 상태 → 초기 선택 버튼 키. */
function keyForStatus(s: BoothStatus | undefined): string | null {
  if (s === "visited") return "seen";
  if (s === "skipped") return "skip";
  if (s === "interested") return "interested";
  return null;
}

export function ReactionBar({
  boothId,
  valueLabel,
}: {
  boothId: string;
  /** 이 부스의 대표 관심 가치 라벨 — 로미 즉답을 그 가치에 맞춰 말하게 한다. */
  valueLabel?: string;
}) {
  const t = useT();
  const storeStatus = useVisitStore((s) => s.records[boothId]?.status);
  const setStatus = useVisitStore((s) => s.setStatus);
  const say = useCompanionStore((s) => s.say);
  const bumpProgress = useCompanionStore((s) => s.bumpProgress);
  const [picked, setPicked] = useState<string | null>(() =>
    keyForStatus(storeStatus),
  );

  function react(r: (typeof REACTIONS)[number]) {
    const isSame = picked === r.key;
    setPicked(isSame ? null : r.key);
    setStatus(boothId, isSame ? null : r.status);
    // 방문/별로(visited·skipped)는 서버 노트에 동기화 → 새로고침·재로그인 후에도 유지
    // (setFromNotes가 병합하므로 지도 색이 사라지지 않음). interested는 로컬 전용.
    void pushNote(boothId).catch(() => {});
    if (!isSame) {
      void api
        .post("/api/me/signal", { boothId, kind: r.kind })
        .catch(() => {});
      // 로미 즉답 — 취소가 아니라 새 반응일 때만. 내 행동에 바로 반응한다는 느낌.
      const line = reactionLine(r.key, valueLabel, t);
      if (line) say(line);
      // 반응 하나가 취향 파악도를 올린다 — '별로'도 취향을 좁히는 신호라 함께 오른다.
      bumpProgress(r.key === "skip" ? 5 : 9);
    }
  }

  return (
    <div className="flex gap-1.5">
      {REACTIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => react(r)}
          aria-pressed={picked === r.key}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold active:opacity-70",
            picked === r.key
              ? "border-primary bg-accent/60 text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          <r.Icon className="size-3.5" aria-hidden />
          {t(`reaction.${r.key}`)}
        </button>
      ))}
    </div>
  );
}
