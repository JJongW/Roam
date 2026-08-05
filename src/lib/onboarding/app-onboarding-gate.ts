// 앱 온보딩 게이트 재노출 판정 — 순수 함수, 테스트 가능하도록 분리.
//
// 로컬 dismissal(anonDismissed, localStorage 기반)이 항상 우선한다 — 한 번 껐으면
// (완료든 건너뛰기든) 이 브라우저에선 계속 안 뜬다. 로그인 상태에선 서버 신호
// (needsOnboarding)가 추가로 다시 띄울 이유가 된다 — 로컬엔 기록이 없는 새
// 브라우저·새 기기에서 계정에 실제로 취향이 없을 때만 해당한다.
//
// 예전엔 로그인 여부로 완전히 갈라(로그인=서버 신호만, 비로그인=로컬만) 판정했는데,
// 그러면 "방금 로그인 응답의 needsOnboarding는 로그인 시점 기준이라 동기화 전 상태"
// 라는 타이밍 문제와 "로그인 상태 건너뛰기가 서버에 안 남는다"는 두 가지 버그가
// 생겼다 — 둘 다 로컬 dismissal을 무조건 최우선으로 두면 사라진다.
export function isAppOnboardingDismissed(params: {
  user: unknown;
  needsOnboarding: boolean;
  anonDismissed: boolean;
}): boolean {
  return params.anonDismissed || (params.user ? !params.needsOnboarding : false);
}
