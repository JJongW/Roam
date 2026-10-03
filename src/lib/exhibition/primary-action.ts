/**
 * 전시 화면의 유일한 primary — 관람 아크의 어느 막인지로 정한다.
 *
 * 예전엔 가치 온보딩·지도·메모장·검색이 같은 카드 스타일로 나란히 있어
 * 무엇이 주된 할 일인지 알 수 없었다. 강조는 **하나일 때만** 작동한다
 * (고립 효과) — 넷을 같은 무게로 두면 효과가 0이 아니라 위계가 사라진다.
 *
 * 순수 함수인 이유: 서버 컴포넌트는 직접 테스트하기 어렵다. 결정만 떼어낸다.
 */
export type PrimaryAction = "onboarding" | "feed" | "finish";

export function primaryAction(input: {
  signedIn: boolean;
  hasChosenValues: boolean;
  /** 이 전시에서 사용자가 내린 판정 수(관심·판정 합). */
  judgedCount: number;
}): PrimaryAction {
  // 회고는 계정에 쓰이고 온보딩 결과도 계정에 묶인다 — 비로그인은 읽기만 한다.
  if (!input.signedIn) return "feed";
  // 판정이 하나라도 있으면 마무리가 가장 앞선다. 온보딩을 건너뛰고 반응만 한
  // 사람도 회고로 갈 수 있어야 한다(가치 선택이 회고의 전제가 아니다).
  if (input.judgedCount > 0) return "finish";
  if (!input.hasChosenValues) return "onboarding";
  return "feed";
}
