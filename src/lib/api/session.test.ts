import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authUser: null as { id: string; email?: string } | null,
  cookieValue: undefined as string | undefined,
  authHeader: undefined as string | undefined,
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
        : undefined,
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
});
