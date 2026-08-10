import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE } from "@/lib/constants";

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
 * `/privacy` must stay public: Google's OAuth verification reviewers open the
 * privacy policy URL directly, without an account. If the gate bounces them to
 * /login, verification is rejected on the spot.
 */
export const PUBLIC_PATHS = ["/", "/privacy"];
/** 정확한 패턴 매치 — 하위 경로(메모장·커뮤니티 등)는 자동으로 안 걸린다. */
export const PUBLIC_PATH_PATTERNS = [
  /^\/exhibitions\/[^/]+$/,
  /^\/exhibitions\/[^/]+\/map$/,
  /^\/booths\/[^/]+$/,
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

  if (req.cookies.get(USER_COOKIE)?.value) return NextResponse.next();

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
