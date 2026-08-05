"use client";

import { Check, Clock3, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisitStore, pushNote, type BoothStatus } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useAuthStore, promptLoginOncePerExhibition } from "@/lib/stores/auth";
import { useT } from "@/lib/i18n/provider";
import { buildReactionLine, type ReactionKey } from "@/lib/companion/reaction-line";

/**
 * 부스 반응 버튼(끌림/나중에/별로/이미봄). 스스로 갈지 말지 판단한 결과를 상태로 남기면
 * 지도 부스 색이 칠해지고(초록=가봄, 노랑=끌림), 서버가 그 상태 변화를 신호로 적재해
 * 브레인에 반영한다. companion-reframe §7.5 — 명령이 아니라 사용자의 반응을 받는다.
 *
 * 비로그인이어도 버튼은 그대로 토글된다(로컬 visitStore) — 다만 로미는 "동작"하지
 * 않는다: 즉답이 없고(promptLoginOncePerExhibition만 전시당 1회) 서버 저장도 안 된다
 * (pushNote가 401을 조용히 삼킴). 로그인하면 그동안 쌓인 반응이 소급 반영된다
 * (auth.ts의 syncPendingReactions).
 */
const REACTIONS: {
  key: ReactionKey;
  status: BoothStatus;
  Icon: typeof Heart;
}[] = [
  { key: "interested", status: "interested", Icon: Heart },
  { key: "later", status: "later", Icon: Clock3 },
  { key: "skip", status: "skipped", Icon: X },
  { key: "seen", status: "visited", Icon: Check },
];

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
  interestSlugs,
  categoryLabel,
  exhibitionSlug,
}: {
  boothId: string;
  /** 로미가 이 부스를 이름으로 부르게 한다. 없으면 이름 없는 판본으로 떨어진다. */
  boothName?: string;
  /** boothValueSlugs(booth) — 가치 축 slug. 반응 즉답이 브레인 관심(interests)과
   *  매칭하는 데 쓴다(reaction-line.ts). brain.interests는 이 축으로 쌓인다. */
  interestSlugs: string[];
  /** 발화에 얹을 구체적 분야 이름(카테고리) — 가치 이름은 절대 쓰지 않는다. */
  categoryLabel: string | undefined;
  /** 비로그인일 때 "저장 안 됨" 안내를 전시당 1회로 제한하는 데 쓴다. */
  exhibitionSlug: string;
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const storeStatus = useVisitStore((s) => s.records[boothId]?.status);
  const setStatus = useVisitStore((s) => s.setStatus);
  const say = useCompanionStore((s) => s.say);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const interests = useCompanionStore((s) => s.interests);
  // 눌린 버튼은 스토어에서 파생한다 — 복사본을 두면 부스가 바뀌어도 앞 부스의 상태가
  // 남아, 실제로는 아무 반응도 없는 부스에 버튼이 눌린 채로 보인다(지도에서 부스를
  // 옮겨 다닐 때 실제로 그랬다). 진실은 visitStore 한 곳뿐이다.
  const picked = keyForStatus(storeStatus);

  function react(r: (typeof REACTIONS)[number]) {
    const isSame = picked === r.key;
    setStatus(boothId, isSame ? null : r.status);
    if (!isSame) {
      // 로미 즉답 — 로그인했을 때만. 비로그인은 로미가 "동작"하지 않는다(전시당
      // 1회만 저장 안내).
      if (user) {
        say(buildReactionLine(r.key, interestSlugs, boothName, categoryLabel, interests, t));
      } else {
        promptLoginOncePerExhibition(exhibitionSlug);
      }
    }
    // 네 상태 모두 서버 노트로 동기화 → 폰을 바꾸거나 재로그인해도 지도 색이 남는다.
    // 신호 적재도 이 요청 하나가 겸한다(notes 라우트가 상태를 보고 기록) — 예전처럼
    // /api/me/signal을 따로 치면 가봄·별로만 신호가 두 번 쌓인다.
    //
    // 취향 정확도는 서버 응답을 그대로 반영한다 — 예전엔 클라이언트가 감쇠 곡선으로
    // 낙관적 bump를 했는데, 서버 공식과 어긋나 새로고침하면 값이 오르내렸다. 취소
    // (isSame) 때도 pushNote는 항상 나간다 — 반응을 지우면 판정도 같이 지워지므로
    // 정확도가 내려갈 수 있고, 그것도 서버가 계산해 알려준다. 비로그인이면 401로
    // 조용히 실패한다(로컬 캐시는 유지, syncPendingReactions가 로그인 시 다시 시도).
    const prevJudged = useCompanionStore.getState().tasteJudged;
    void pushNote(boothId).then((taste) => {
      if (!taste) return;
      setTaste(taste.judgedCount, taste.pct);
      // "감 잡았다" — 판정 5개를 막 넘기는 순간에만, 1회.
      if (prevJudged < 5 && taste.judgedCount >= 5) {
        say(t("companion.tasteInsight"));
      }
    });
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
