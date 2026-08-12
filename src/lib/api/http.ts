import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError, type ZodType } from "zod";
import { SESSION_COOKIE, USER_COOKIE, ADMIN_COOKIE } from "@/lib/constants";
import { env, adminEmailAllowlist, hasAdminEmailGate } from "@/lib/env";
import type { ApiError, ApiErrorCode } from "@/lib/types";

const STATUS: Record<ApiErrorCode, number> = {
  VALIDATION: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE: 422,
  INTERNAL: 500,
};

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function created<T>(data: T) {
  return NextResponse.json({ data }, { status: 201 });
}

export function noContent() {
  return new NextResponse(null, { status: 204 });
}

export function fail(
  code: ApiErrorCode,
  message: string,
  fields?: ApiError["fields"],
) {
  return NextResponse.json(
    { error: { code, message, fields } },
    { status: STATUS[code] },
  );
}

export function notFound(message = "찾을 수 없습니다") {
  return fail("NOT_FOUND", message);
}

/** Parse + validate a request body with a Zod schema, or return a 400 response. */
export async function parseBody<T>(
  req: Request,
  schema: ZodType<T>,
): Promise<{ ok: true; data: T } | { ok: false; res: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { ok: false, res: fail("VALIDATION", "잘못된 요청 본문입니다") };
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    return {
      ok: false,
      res: fail(
        "VALIDATION",
        "입력값을 확인해 주세요",
        flattenZod(result.error),
      ),
    };
  }
  return { ok: true, data: result.data };
}

export function flattenZod(error: ZodError): Record<string, string[]> {
  const fields: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    (fields[key] ??= []).push(issue.message);
  }
  return fields;
}

/** Read the anonymous session id from the cookie (or null). */
export async function getSessionId(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function setSessionCookie(id: string) {
  const store = await cookies();
  store.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Read the signed-in user id from the cookie (or null). */
export async function getUserId(): Promise<string | null> {
  const store = await cookies();
  return store.get(USER_COOKIE)?.value ?? null;
}

export async function setUserCookie(id: string) {
  const store = await cookies();
  store.set(USER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function clearUserCookie() {
  const store = await cookies();
  store.delete(USER_COOKIE);
}

/** True if the request carries a valid admin-gate cookie.
 *  ADMIN_EMAILS(있으면) 최우선 — 쿠키 값을 매 요청 허용목록과 대조하므로, 목록에서
 *  이메일을 빼면 이미 발급된 쿠키도 바로 무효가 된다(로그아웃 없이도 즉시 회수).
 *  없으면 ORGANIZER_CODE(공유 코드)로 폴백, 둘 다 없으면 게이트 자체가 꺼진다
 *  (로컬 mock 개발 전용 — 실배포에서 이 상태로 두면 /admin이 통째로 열린다). */
export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  if (hasAdminEmailGate) {
    const email = store.get(ADMIN_COOKIE)?.value?.toLowerCase();
    return !!email && adminEmailAllowlist.includes(email);
  }
  if (!env.ORGANIZER_CODE) return true; // gate disabled when unconfigured
  return store.get(ADMIN_COOKIE)?.value === env.ORGANIZER_CODE;
}

/**
 * Guard an admin-only route handler. Returns a 401 response when the
 * organizer gate is configured but the request lacks a valid admin cookie,
 * or `null` when access is allowed (gate disabled or cookie valid).
 */
export async function requireAdmin(): Promise<NextResponse | null> {
  if (await isAdminAuthed()) return null;
  return fail("UNAUTHORIZED", "운영자 인증이 필요합니다");
}

/** email이 있으면 이메일 화이트리스트 게이트용(값=검증된 Google 이메일).
 *  없으면 기존 조직자 코드 게이트용(값=코드 자체). */
export async function setAdminCookie(email?: string) {
  const store = await cookies();
  if (email) {
    store.set(ADMIN_COOKIE, email.toLowerCase(), {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 30,
    });
    return;
  }
  if (!env.ORGANIZER_CODE) return;
  store.set(ADMIN_COOKIE, env.ORGANIZER_CODE, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
}

export function withErrorBoundary(handler: () => Promise<NextResponse>) {
  return handler().catch((e) => {
    console.error("[api] unhandled", e);
    return fail("INTERNAL", "서버 오류가 발생했습니다");
  });
}
