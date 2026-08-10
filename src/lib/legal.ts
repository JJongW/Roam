/**
 * 법적 고지 링크. 서비스 곳곳(로그인 동의 지점·계정 패널·홈 푸터)에서 공통 참조.
 * 문서가 옮겨가면 여기만 바꾸면 된다.
 *
 * ⚠️ privacy는 **반드시 자체 도메인**이어야 한다. Google OAuth 동의 화면에 등록한
 * 개인정보처리방침 URL(`https://roam.ai.kr/privacy`)과 사이트가 실제로 가리키는 링크가
 * 다르면 인증 심사에서 걸린다. 예전엔 여기가 Notion을 가리켜 둘이 어긋나 있었고,
 * `app.notion.com/p/...`는 워크스페이스 앱 URL이라 로그아웃 상태에선 열리지 않을 수
 * 있었다 — 심사관에겐 방침이 없는 사이트로 보인다.
 */
export const LEGAL_LINKS = {
  privacy: "/privacy",
  terms: "/terms",
} as const;

/** 외부 호스팅 링크만 새 탭으로 연다(자체 페이지는 같은 탭). */
export function isExternalLegalLink(href: string): boolean {
  return href.startsWith("http");
}
