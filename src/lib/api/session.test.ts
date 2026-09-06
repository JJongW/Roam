import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authUser: null as { id: string; email?: string } | null,
  cookieValue: undefined as string | undefined,
  authHeader: undefined as string | undefined,
  jar: new Map<string, { value: string }>(),
}));

vi.mock("@/lib/auth/supabase-bearer-user", () => ({
  getSupabaseUserFromBearer: vi.fn(async () => state.authUser),
}));
// getUserId()(cookies)와 getCurrentUser()(headers)가 둘 다 next/headers를 쓴다 —
// api/auth/apple/link의 route.test.ts와 같은 스텁 패턴, cookies/headers 둘 다 얹는다.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) =>
      name === "roam_user" && state.cookieValue
        ? { value: state.cookieValue }
        : state.jar.get(name),
    set: (name: string, value: string) => {
      state.jar.set(name, { value });
    },
    delete: (name: string) => {
      state.jar.delete(name);
    },
  }),
  headers: async () => ({
    get: (name: string) =>
      name === "authorization" ? (state.authHeader ?? null) : null,
  }),
}));

import { getRepository } from "@/lib/repositories";
import { getSupabaseUserFromBearer } from "@/lib/auth/supabase-bearer-user";
import { getCurrentUser } from "@/lib/api/session";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  state.authUser = null;
  state.cookieValue = undefined;
  state.authHeader = undefined;
  state.jar.clear();
  vi.mocked(getSupabaseUserFromBearer).mockClear();
});

// iOS는 더 이상 roam_user 쿠키를 발급받지 않는다(Apple 로그인이 Supabase Auth로
// 완전히 옮겨감) — getCurrentUser가 Authorization: Bearer 헤더도 봐야 한다.
// `docs/decisions/`(iOS 레포) 2026-09-06 로그인 리뷰 회귀 수정 참고.
describe("getCurrentUser", () => {
  it("쿠키도 Authorization 헤더도 없으면 null", async () => {
    expect(await getCurrentUser()).toBeNull();
    expect(getSupabaseUserFromBearer).not.toHaveBeenCalled();
  });

  it("Authorization: Bearer 헤더가 유효하면 그 id로 app_user를 조회한다", async () => {
    const repo = await getRepository();
    const created = await repo.createOAuthUser({
      id: "supabase-uid-1",
      provider: "apple_ios",
      providerAccountId: "supabase-uid-1",
      nickname: "테스터",
    });
    state.authUser = { id: "supabase-uid-1" };
    state.authHeader = "Bearer supabase-access-token";

    const result = await getCurrentUser();
    expect(result?.id).toBe(created.id);
    expect(getSupabaseUserFromBearer).toHaveBeenCalledWith("supabase-access-token");
  });

  it("Authorization 헤더가 있어도 토큰이 무효면 null", async () => {
    state.authUser = null;
    state.authHeader = "Bearer invalid-token";
    expect(await getCurrentUser()).toBeNull();
  });

  // 실기기에서 실제로 난 문제: 옛 roam_user 쿠키가 남은 채 계정이 병합되면
  // (link_app_user_by_email이 옛 행을 지운다) 쿠키가 죽은 id를 계속 가리켜,
  // 유효한 Bearer 토큰을 들고 와도 영원히 401이 됐다.
  it("쿠키가 가리키는 계정이 이미 없으면 Bearer 신원으로 폴백한다", async () => {
    const repo = await getRepository();
    const alive = await repo.createOAuthUser({
      id: "supabase-uid-1",
      provider: "apple_ios",
      providerAccountId: "supabase-uid-1",
      nickname: "테스터",
    });
    // 서명이 유효하지만 이미 삭제된 계정을 가리키는 쿠키 — 공개 API로 발급해
    // 실제 서명 경로를 그대로 태운다(테스트용 내부 함수 노출 안 함).
    const { setUserCookie } = await import("@/lib/api/http");
    await setUserCookie("deleted-user-id");
    state.authUser = { id: "supabase-uid-1" };
    state.authHeader = "Bearer supabase-access-token";

    const result = await getCurrentUser();
    expect(result?.id).toBe(alive.id);
  });

  // 시크릿 회전·다른 환경 쿠키 등으로 서명 검증이 깨진 경우에도 마찬가지다 —
  // 죽은 쿠키 하나가 멀쩡한 Bearer 요청을 통째로 비로그인으로 만들면 안 된다.
  it("쿠키 서명이 깨져도 Bearer 헤더로 로그인 사용자를 찾는다", async () => {
    const repo = await getRepository();
    const alive = await repo.createOAuthUser({
      id: "supabase-uid-2",
      provider: "apple_ios",
      providerAccountId: "supabase-uid-2",
      nickname: "테스터2",
    });
    state.cookieValue = "tampered.cookie.value";
    state.authUser = { id: "supabase-uid-2" };
    state.authHeader = "Bearer supabase-access-token";

    const result = await getCurrentUser();
    expect(result?.id).toBe(alive.id);
  });
});
