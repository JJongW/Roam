import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { ZodError, type ZodType } from "zod";
import { SESSION_COOKIE, USER_COOKIE } from "@/lib/constants";
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

export function withErrorBoundary(handler: () => Promise<NextResponse>) {
  return handler().catch((e) => {
    console.error("[api] unhandled", e);
    return fail("INTERNAL", "서버 오류가 발생했습니다");
  });
}
