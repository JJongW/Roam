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
}

export const useCompanionStore = create<CompanionState>((set) => ({
  home: null,
  setHome: (home) => set({ home }),
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
  clearAppOnboardingJustCompleted: () => set({ appOnboardingJustCompleted: false }),
}));
