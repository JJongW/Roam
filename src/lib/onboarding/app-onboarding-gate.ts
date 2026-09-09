// 앱 온보딩 게이트 재노출 판정 — 순수 함수, 테스트 가능하도록 분리.
//
// 로컬 스토리지·세션 스토리지 키 — auth.ts(재시작 액션)와 app-onboarding.tsx(게이트
// 자체) 둘 다 같은 키를 써야 해서 여기 한 곳에서만 정의한다.
export const APP_ONBOARDING_DISMISS_KEY = "roam-app-onboarded";
export const APP_ONBOARDING_PHASE_KEY = "roam-onboarding-app-phase";
export const APP_ONBOARDING_GUIDE_STEP_KEY = "roam-onboarding-app-guide-step";
//
// **누가 껐는지**를 같이 기록한다(`"anon"` 또는 app_user.id). 예전엔 "1"만 저장해
// 로컬 dismissal이 무조건 최우선이었는데, 그러면 비로그인으로 "먼저 둘러볼게"를
// 한 번 누른 브라우저는 **로그인해도 온보딩이 영영 안 떴다**. 온보딩 결과(가치·
// 브레인)는 계정에 묶이므로, 계정이 생기는 순간이야말로 온보딩이 의미를 갖는
// 시점이다 — 비로그인 기록은 거기서 효력을 잃어야 한다(2026-09-09).
//
// 이 계정이 직접 끈 기록은 그대로 최우선이다 — 그게 "로그인 응답의
// needsOnboarding은 로그인 시점 기준이라 낡을 수 있어, 방금 끝낸 온보딩이 로그인
// 직후 다시 뜬다"는 예전 버그를 막던 조건이다.
//
// `dismissedBy`가 옛 값 `"1"`이어도 안전하다 — 로그인 상태에선 어차피 내 id와
// 달라 서버 신호를 보게 되고, 비로그인이면 예전과 똑같이 "껐음"으로 읽힌다.
export function isAppOnboardingDismissed(params: {
  /** 로그인한 계정 id. 비로그인이면 null. */
  userId?: string | null;
  needsOnboarding: boolean;
  /** localStorage에 남은 "누가 껐는가" — "anon" | app_user.id | 옛 "1" | null. */
  dismissedBy: string | null;
}): boolean {
  const { userId, needsOnboarding, dismissedBy } = params;
  if (userId && dismissedBy === userId) return true;
  if (userId) return !needsOnboarding;
  return dismissedBy !== null;
}

/** localStorage에 넣을 소유자 표식. 비로그인은 "anon". */
export function onboardingDismissOwner(userId?: string | null): string {
  return userId || ANON_DISMISS_OWNER;
}

export const ANON_DISMISS_OWNER = "anon";

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
