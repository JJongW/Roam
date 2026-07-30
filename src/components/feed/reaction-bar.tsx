"use client";

import { Check, Clock3, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisitStore, pushNote, type BoothStatus } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";
import type { TFn } from "@/lib/i18n/resolve";

/**
 * 부스 반응 버튼(끌림/나중에/별로/이미봄). 스스로 갈지 말지 판단한 결과를 상태로 남기면
 * 지도 부스 색이 칠해지고(초록=가봄, 노랑=끌림), 서버가 그 상태 변화를 신호로 적재해
 * 브레인에 반영한다. companion-reframe §7.5 — 명령이 아니라 사용자의 반응을 받는다.
 */
const REACTIONS: {
  key: string;
  status: BoothStatus;
  Icon: typeof Heart;
}[] = [
  { key: "interested", status: "interested", Icon: Heart },
  { key: "later", status: "later", Icon: Clock3 },
  { key: "skip", status: "skipped", Icon: X },
  { key: "seen", status: "visited", Icon: Check },
];

/**
 * 반응 → 로미 즉답. 말하는 대상은 **그 부스**다.
 *
 * 예전엔 부스의 대표 가치를 주어로 삼아 "영감은 별로였구나"처럼 말했다. 부스 하나를
 * 뺐다고 가치 전체를 부정하는 말인데, 실제 학습은 그렇게 세지 않다(별로 가중치는
 * 끌림의 절반이다). 말이 학습보다 앞서면 사용자가 "얘가 날 잘못 알아들었다"고 느낀다.
 * 이름은 따옴표로 묶고 조사 대신 쉼표를 써서 은/는 선택 문제를 아예 없앤다.
 */
function reactionLine(
  key: string,
  boothName: string | undefined,
  t: TFn,
): string | null {
  const k = {
    interested: "reactInterested",
    later: "reactLater",
    skip: "reactSkip",
    seen: "reactSeen",
  }[key];
  if (!k) return null;
  // 이름을 모르면(호출부가 안 넘겼으면) 부스 없는 판본으로 자연 degrade.
  return boothName
    ? t(`companion.${k}`, { booth: boothName })
    : t(`companion.${k}Plain`);
}

/** 저장된 상태 → 초기 선택 버튼 키. */
function keyForStatus(s: BoothStatus | undefined): string | null {
  if (s === "visited") return "seen";
  if (s === "skipped") return "skip";
  if (s === "interested") return "interested";
  if (s === "later") return "later";
  return null;
}

export function ReactionBar({
  boothId,
  boothName,
}: {
  boothId: string;
  /** 로미가 이 부스를 이름으로 부르게 한다. 없으면 이름 없는 판본으로 떨어진다. */
  boothName?: string;
}) {
  const t = useT();
  const storeStatus = useVisitStore((s) => s.records[boothId]?.status);
  const setStatus = useVisitStore((s) => s.setStatus);
  const say = useCompanionStore((s) => s.say);
  const bumpProgress = useCompanionStore((s) => s.bumpProgress);
  const tickReaction = useCompanionStore((s) => s.tickReaction);
  const progress = useCompanionStore((s) => s.progress);
  // 눌린 버튼은 스토어에서 파생한다 — 복사본을 두면 부스가 바뀌어도 앞 부스의 상태가
  // 남아, 실제로는 아무 반응도 없는 부스에 버튼이 눌린 채로 보인다(지도에서 부스를
  // 옮겨 다닐 때 실제로 그랬다). 진실은 visitStore 한 곳뿐이다.
  const picked = keyForStatus(storeStatus);

  function react(r: (typeof REACTIONS)[number]) {
    const isSame = picked === r.key;
    setStatus(boothId, isSame ? null : r.status);
    // 네 상태 모두 서버 노트로 동기화 → 폰을 바꾸거나 재로그인해도 지도 색이 남는다.
    // 신호 적재도 이 요청 하나가 겸한다(notes 라우트가 상태를 보고 기록) — 예전처럼
    // /api/me/signal을 따로 치면 가봄·별로만 신호가 두 번 쌓인다.
    void pushNote(boothId).catch(() => {});
    if (!isSame) {
      // 로미 즉답 — 취소가 아니라 새 반응일 때만. 내 행동에 바로 반응한다는 느낌.
      const line = reactionLine(r.key, boothName, t);
      if (line) say(line);
      // 파악도 상승 — 남은 거리(100-현재)에 비례한 감쇠 증가라 서버 포화 곡선을 따라가
      // 재접속 시 값 점프가 작고, 100까지 대략 15~20번의 반응이 필요하다(완만). '별로'도
      // 취향을 좁히는 신호라 함께 오르되 절반만.
      const factor = r.key === "skip" ? 0.06 : 0.13;
      const floor = r.key === "skip" ? 1 : 2;
      bumpProgress(Math.max(floor, Math.round((100 - progress) * factor)));
      // 재추천 트리거 — 버스트가 멎으면 컨트롤러가 피드를 갱신 브레인으로 다시 부른다.
      tickReaction();
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
