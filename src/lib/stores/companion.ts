"use client";

import { create } from "zustand";
import type { InterestNode } from "@/lib/types";

/**
 * 전시 홈에서 서버가 계산한 맥락(상위 관심 가치·골라둔 개수)을 상주 컴패니언 바에
 * 넘겨주는 통로. 상단 고정 배너 대신 하단 플로팅 로미가 이 맥락으로 말하게 한다
 * (휘발성 발화). 페이지가 마운트 시 채우고 이탈 시 비운다.
 */
export interface HomeCompanionContext {
  /** 사용자 상위 관심 가치 라벨(로케일). 비면 아직 취향 없음. */
  values: string[];
  /** 이 전시에서 로미가 골라둔 피드 개수. */
  picked: number;
}

interface CompanionState {
  home: HomeCompanionContext | null;
  setHome: (ctx: HomeCompanionContext | null) => void;
  /**
   * `/booths/[id]` 등 URL에 전시 slug가 없는 화면에서 컴패니언 바가 어느 전시인지
   * 알 방법이 없다 — 그 화면이 아는 exhibitionId를 이 필드로 대신 흘려보낸다.
   * pathname 정규식이 못 잡는 경우의 폴백(companion-bar.tsx).
   */
  activeExhibitionId: string | null;
  setActiveExhibitionId: (id: string | null) => void;
  /**
   * 방금 사용자 행동(반응·검색 등)에 대한 즉답 한 줄. 상주 컴패니언이 잠깐 이 말을
   * 띄우고 스스로 지운다 — "내 행동에 로미가 바로 반응한다"는 동행 느낌. 결정론 선택,
   * 로미는 말만(속도 규칙 준수, LLM 없음).
   */
  flash: string | null;
  /** 즉답 발화를 띄운다. 컴패니언 바가 잠시 뒤 스스로 지운다. */
  say: (text: string) => void;
  clearFlash: () => void;

  /**
   * 취향 정확도 — "로미의 예측을 사용자가 확인해준 정도"(예측 정확도, taste.ts).
   * 접촉량이 아니다: 카드 클릭·검색은 관여 안 하고, 반응(끌림·나중에·별로·가봄
   * 되묻기)만 판정으로 센다. 서버가 유일한 진실이다 — 이 스토어는 매 쓰기 응답의
   * 값을 그대로 반영할 뿐 자체 공식으로 계산하지 않는다(이전 bumpProgress 감쇠
   * 휴리스틱이 서버 값과 어긋나던 문제를 이렇게 없앤다).
   */
  tasteJudged: number;
  /** 판정 5개 미만이면 null(말로만 표시) — companion-bar.tsx가 분기한다. */
  tastePct: number | null;
  setTaste: (judged: number, pct: number | null) => void;

  /**
   * 브레인 상위 관심 분야(신뢰도 내림차순, distill.ts가 이미 정렬해서 준다). 지도
   * 반응 즉답(reaction-line.ts)이 부스 분야와 매칭해 톤을 정하는 데 쓴다.
   * tasteJudged/tastePct와 같은 생명주기 — 화면을 벗어나도 비우지 않는다(지도가
   * 전시 홈을 떠난 뒤에도 이 값이 필요하기 때문). 이 세션에서 전시 홈을 한 번도
   * 안 거치고 지도로 바로 딥링크하면 빈 배열 — 그때 반응 즉답은 분야 언급 없는
   * 기존 문장으로 자연히 떨어진다(별도 처리 없음, 의도된 단순화).
   */
  interests: InterestNode[];
  setInterests: (interests: InterestNode[]) => void;

  /**
   * 앱 온보딩(층 전체 공통)을 방금 완료했다는 1회성 신호 — 지금 보고 있는 전시의
   * ValueOnboarding이 이걸 보고 자동으로 이어서 열린다(AppOnboardingGate가 layout
   * 레벨이라 어느 전시인지 몰라, "방금 끝났다"는 사실만 넘기고 소비 쪽이 판단한다).
   * flash/clearFlash와 같은 펄스 패턴 — 건너뛰기(skip)는 이 신호를 안 보낸다(사용자가
   * 안 하겠다고 한 걸 곧바로 또 물으면 안 됨).
   */
  appOnboardingJustCompleted: boolean;
  signalAppOnboardingComplete: () => void;
  clearAppOnboardingJustCompleted: () => void;

  /**
   * 자발 발화(현장 부스 선택·미방문 이탈·검색) 쿨다운 상태 — "나그지 않기". 직접
   * 유발 발화(반응 탭 즉답)는 이 게이트를 안 거친다.
   */
  lastSpontaneousAt: number | null;
  lastSpontaneousTrigger: string | null;
  /** saySpontaneous가 성공한 뒤로 쌓인 사용자 행동 수 — recordAction()이 늘린다. */
  actionsSinceLastSpontaneous: number;
  /** 부스 선택·검색 등 자발 발화 후보가 될 수 있는 행동마다 호출. */
  recordAction: () => void;
  /** 자발 발화 시도 — 쿨다운을 통과하면 flash를 세팅하고 상태를 갱신하며 true를
   *  반환, 아니면 조용히 아무것도 안 하고 false를 반환한다(무음이 기본). now는
   *  호출부가 Date.now()로 넘긴다. 반환값은 호출부가 "실제로 말했는지"에 따라
   *  다른 UI(예: 토스트)를 추가로 띄울지 판단하는 데 쓴다. */
  saySpontaneous: (trigger: string, text: string, now: number) => boolean;
}

/** 연속 같은 유형 재발화까지 금지하는 창 — 기본 쿨다운(45초)의 2배. 이 안에서
 *  같은 트리거가 다시 시도되면 막지만, 창을 넘기면(다른 조건은 그대로 만족해야
 *  하지만) 다시 같은 트리거로 말할 수 있다 — "다시는 절대 안 됨"이 아니라
 *  "바로 다시는 안 됨"이 의도다. */
const SAME_TRIGGER_BAN_MS = 90_000;

/**
 * 자발 발화 쿨다운 판정 — 순수 함수(테스트 가능). "45초 또는 행동 3회당 1회 중
 * 늦은 쪽"은 두 조건 다 만족해야 한다는 뜻이다(더 늦게 만족되는 쪽이 실제 게이트가
 * 열리는 시점이므로). 직전과 같은 트리거면 재발화 금지 창(90초) 안에서만 금지
 * (연속 같은 유형 금지 — 영구 금지 아님). 첫 발화(lastSpontaneousAt이 null)는
 * 무조건 허용한다 — 비교할 기준이 없다.
 */
export function canSaySpontaneous(
  state: {
    lastSpontaneousAt: number | null;
    lastSpontaneousTrigger: string | null;
    actionsSinceLastSpontaneous: number;
  },
  trigger: string,
  now: number,
): boolean {
  if (state.lastSpontaneousAt === null) return true;
  const elapsed = now - state.lastSpontaneousAt;
  if (
    state.lastSpontaneousTrigger === trigger &&
    elapsed < SAME_TRIGGER_BAN_MS
  ) {
    return false;
  }
  const cooledDown = elapsed >= 45_000;
  const actedEnough = state.actionsSinceLastSpontaneous >= 3;
  return cooledDown && actedEnough;
}

export const useCompanionStore = create<CompanionState>((set, get) => ({
  home: null,
  setHome: (home) => set({ home }),
  activeExhibitionId: null,
  setActiveExhibitionId: (activeExhibitionId) => set({ activeExhibitionId }),
  flash: null,
  say: (text) => set({ flash: text }),
  clearFlash: () => set({ flash: null }),
  tasteJudged: 0,
  tastePct: null,
  setTaste: (judged, pct) => set({ tasteJudged: judged, tastePct: pct }),
  interests: [],
  setInterests: (interests) => set({ interests }),
  appOnboardingJustCompleted: false,
  signalAppOnboardingComplete: () => set({ appOnboardingJustCompleted: true }),
  clearAppOnboardingJustCompleted: () =>
    set({ appOnboardingJustCompleted: false }),
  lastSpontaneousAt: null,
  lastSpontaneousTrigger: null,
  actionsSinceLastSpontaneous: 0,
  recordAction: () =>
    set((s) => ({
      actionsSinceLastSpontaneous: s.actionsSinceLastSpontaneous + 1,
    })),
  saySpontaneous: (trigger, text, now) => {
    if (!canSaySpontaneous(get(), trigger, now)) return false;
    set({
      flash: text,
      lastSpontaneousAt: now,
      lastSpontaneousTrigger: trigger,
      actionsSinceLastSpontaneous: 0,
    });
    return true;
  },
}));
