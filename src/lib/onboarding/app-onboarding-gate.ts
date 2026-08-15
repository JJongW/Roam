// 앱 온보딩 게이트 재노출 판정 — 순수 함수, 테스트 가능하도록 분리.
//
// 로컬 스토리지·세션 스토리지 키 — auth.ts(재시작 액션)와 app-onboarding.tsx(게이트
// 자체) 둘 다 같은 키를 써야 해서 여기 한 곳에서만 정의한다.
export const APP_ONBOARDING_DISMISS_KEY = "roam-app-onboarded";
export const APP_ONBOARDING_PHASE_KEY = "roam-onboarding-app-phase";
export const APP_ONBOARDING_GUIDE_STEP_KEY = "roam-onboarding-app-guide-step";
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
 * 모든 경로에서 뜬다 — 랜딩(`/`)도 포함. 예전엔 "첫 화면이 전체화면 인트로면
 * 이 서비스가 뭔지 알 방법이 없다"(Google OAuth가 그 사유로 반려)는 이유로
 * 랜딩만 제외했는데, 이후 랜딩을 먼저 보여준 채로 재심사를 넣어도 Google이
 * 같은 사유로 계속 반려했다 — "홈을 무조건 먼저 보여줘야 통과한다"는 전제 자체가
 * 성립하지 않았다는 뜻이라 이 제약을 없앤다(2026-08-11 판단, 앱 진입 플로우 재설계).
 * pathname 인자는 향후 다시 경로별 예외가 필요해질 가능성을 열어두기 위해 그대로
 * 남긴다(현재는 항상 true).
 */
export function canShowAppOnboarding(_pathname: string): boolean {
  return true;
}

/**
 * 부스 상세로의 딥링크 진입인가 — 이 경로에서만 인트로를 풀스크린 대신
 * 상단 배너(비차단)로 완화한다. 콘텐츠는 바로 보이되, 앱 이름·한줄소개는
 * 계속 화면에 남아있어 "서비스 설명 없이 콘텐츠로 직행"이라는 반려 사유를
 * 다시 건드리지 않는다(canShowAppOnboarding 문서 주석 참고). 홈 등 그 외
 * 경로는 기존 풀스크린을 그대로 유지 — 이미 검증된 통과 케이스라 안 건드린다.
 * (2026-08-15 판단, B-1)
 */
export function isBoothDeepLinkPath(pathname: string): boolean {
  return /^\/booths\//.test(pathname);
}
