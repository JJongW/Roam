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
  return (
    params.anonDismissed || (params.user ? !params.needsOnboarding : false)
  );
}

/**
 * 이 경로에서 온보딩 게이트를 띄워도 되는가.
 *
 * 랜딩(`/`)은 **덮지 않는다.** 처음 온 사람이 보는 첫 화면이 "안녕, 나는 로미야"
 * 전체화면이면 이 서비스가 뭔지 알 방법이 없다 — Google OAuth 인증도 그걸 두고
 * "홈페이지에 앱의 목적에 관한 설명이 없다"로 반려했다. 취향 질문은 전시에 들어가서,
 * 즉 그 답이 실제로 쓰일 자리에서 묻는 게 맞다.
 *
 * 랜딩 밖(전시·지도·부스 상세)에선 그대로 뜬다 — 공유 링크로 바로 들어온 사람도
 * 온보딩을 만난다.
 */
export function canShowAppOnboarding(pathname: string): boolean {
  return pathname !== "/";
}
