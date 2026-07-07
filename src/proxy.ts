import { NextResponse, type NextRequest } from "next/server";
import { USER_COOKIE } from "@/lib/constants";

/**
 * Global auth gate. The service requires a signed-in identity (`roam_user`) —
 * unauthenticated visitors are bounced to /login with a `next` param so they
 * return to where they were headed after logging in.
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

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  if (
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
