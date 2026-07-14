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
   * 로미가 스스로 인지하는 "취향 파악도" 0~100. 기존 온보딩의 스테이터스바 대신,
   * 로미가 반응·검색으로 사용자를 이해한 정도를 %로 보여준다. 서버 브레인으로 시드하고
   * 반응할 때마다 낙관적으로 오른다. 결정론(수학), LLM 없음.
   */
  progress: number;
  setProgress: (n: number) => void;
  /** 새 반응 등으로 파악도를 올린다(0~100 클램프). */
  bumpProgress: (delta: number) => void;
}

const clampPct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

export const useCompanionStore = create<CompanionState>((set) => ({
  home: null,
  setHome: (home) => set({ home }),
  flash: null,
  say: (text) => set({ flash: text }),
  clearFlash: () => set({ flash: null }),
  progress: 0,
  setProgress: (n) => set({ progress: clampPct(n) }),
  bumpProgress: (delta) =>
    set((s) => ({ progress: clampPct(s.progress + delta) })),
}));
