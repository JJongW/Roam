import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE } from "@/lib/constants";
import { verifySignedUserId } from "@/lib/auth/user-cookie";

/**
 * Global auth gate. Personalized/interactive visitor pages require a signed-in
 * identity (`roam_user`) — unauthenticated visitors are bounced to /login with a
 * `next` param so they return to where they were headed after logging in.
 *
 * The home page (`/`) is intentionally public: it's the landing that shows the
 * open exhibitions (some info) plus why signing in helps. A hard wall on the
 * very first screen felt like an arbitrary account gate; login is framed as
 * memory/continuity, so browsing the shelf without it should be possible.
 *
 * 전시 상세·지도·부스 상세도 같은 이유로 공개다 — 정보 열람은 계정 벽 없이 되고,
 * 로미(반응 즉답·개인화 피드·컴패니언 바)만 로그인 계정에서 동작한다(컴포넌트
 * 레벨에서 막음, 여기선 라우트만 연다). 더 깊은 경로(메모장·커뮤니티 등)는 이
 * 패턴에 안 걸려 그대로 로그인 필수다.
 *
 * Exempt prefixes:
 *  - /login  : the gate itself
 *  - /auth   : OAuth callback (issues the cookie)
 *  - /admin  : organizer console has its own code gate (roam_admin), a separate
 *              persona from visitor accounts — don't double-gate it here
 *
 * API routes and static assets are excluded via the matcher below (APIs still
 * validate their own session/cookie server-side; the login endpoints must stay
 * reachable so the gate is passable).
 */
const EXEMPT_PREFIXES = ["/login", "/auth", "/admin"];
/**
 * Public pages reachable without an identity (exact match).
 *
 * `/privacy` and `/terms` must stay public: Google's OAuth verification reviewers
 * open those URLs directly, without an account. If the gate bounces them to
 * /login, verification is rejected on the spot.
 *
 * `/survey`는 공개 설문이다 — 링크를 받은 사람이 계정을 만들 이유가 없다.
 * `/visited`는 "다녀왔어요" 목록(UI 6-10)이다. 기록은 이 기기에 먼저 남고 로그인 전에는 기기 것만
 * 보여 준다(화면 설계서 6-10 상태, "로그인 없이 모두 할 수 있어요").
 * `/me`, `/me/hearts`, `/me/settings`는 마이페이지(UI 14-01, 14-02)와 설정이다. 로그인 전에도 이 브라우저의
 * 하트를 보여 준다. 프로필, 닉네임, 계정 삭제, 하트 남긴 브랜드(계정 목록)는 여기 없어 로그인으로 보낸다.
 * `/fairs`는 박람회 전체(UI 20-02)다. 홈과 같은 공개 목록이라 계정 벽이 없다.
 */
export const PUBLIC_PATHS = [
  "/",
  "/fairs",
  "/privacy",
  "/terms",
  "/survey",
  "/visited",
  "/me",
  "/me/hearts",
  "/me/settings",
];
/** 정확한 패턴 매치 — 하위 경로(메모장·커뮤니티 등)는 자동으로 안 걸린다. */
export const PUBLIC_PATH_PATTERNS = [
  /^\/exhibitions\/[^/]+$/,
  /^\/exhibitions\/[^/]+\/map$/,
  // 부스 목록(UI 8 둘러보기). 지도처럼 로그인 없이 둘러본다(브랜드 규칙 §4 로그인).
  /^\/exhibitions\/[^/]+\/booths$/,
  /^\/booths\/[^/]+$/,
  /^\/me\/hearts\/[^/]+$/,
];

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    PUBLIC_PATH_PATTERNS.some((re) => re.test(pathname)) ||
    EXEMPT_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
  ) {
    return NextResponse.next();
  }

  // 존재가 아니라 서명을 본다 — 값이 들어 있기만 하면 통과시키면 `roam_user=아무거나`
  // 로 게이트를 넘을 수 있고, 그 뒤 메모장·커뮤니티 페이지는 신원을 따로 확인하지
  // 않는다. 검증 함수는 라우트 핸들러(`getUserId`)와 같은 것을 쓴다.
  const raw = req.cookies.get(USER_COOKIE)?.value;
  if (raw && verifySignedUserId(raw)) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = "";
  url.searchParams.set("next", `${pathname}${search}`);
  return NextResponse.redirect(url);
}

export const config = {
  // Run on every path except API routes, Next internals, and files with an
  // extension (static assets). Those never need the visitor gate.
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|.*\\..*).*)",
  ],
};
