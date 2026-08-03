"use client";

import { create } from "zustand";

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
}));
