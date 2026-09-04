import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  authUser: { id: "supabase-uid-1", email: "a@example.com" } as {
    id: string;
    email?: string;
  } | null,
  cookieJar: new Map<string, { value: string }>(),
}));
vi.mock("@/lib/auth/supabase-bearer-user", () => ({
  getSupabaseUserFromBearer: vi.fn(async () => state.authUser),
}));
// route.ts calls setUserCookie() → next/headers cookies(), which throws outside
// a real Next.js request scope — 기존 apple/native 테스트와 동일한 스텁 패턴 재사용.
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => state.cookieJar.get(name),
    set: (name: string, value: string) => {
      state.cookieJar.set(name, { value });
    },
    delete: (name: string) => {
      state.cookieJar.delete(name);
    },
  }),
}));

import { getRepository } from "@/lib/repositories";
import { recordSignal } from "@/lib/memory/service";
import { getSupabaseUserFromBearer } from "@/lib/auth/supabase-bearer-user";
import { POST } from "./route";

function req(body: unknown, token = "supabase-access-token") {
  return new Request("http://localhost/api/auth/apple/link", {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/apple/link", () => {
  beforeEach(() => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore =
      undefined;
    state.authUser = { id: "supabase-uid-1", email: "a@example.com" };
    state.cookieJar.clear();
    vi.mocked(getSupabaseUserFromBearer).mockClear();
  });

  it("신규 Apple 계정이면 생성하고 needsOnboarding true를 준다 — app_user.id는 auth.uid()와 같다", async () => {
    const res = await POST(req({ fullName: "테스터" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.needsOnboarding).toBe(true);
    expect(body.data.user.nickname).toContain("테스터");
    expect(body.data.user.id).toBe("supabase-uid-1");
  });

  it("이미 연결된 Apple 계정이면 기존 유저로 로그인한다", async () => {
    const first = await POST(req({ fullName: "테스터" }));
    const firstBody = await first.json();

    const second = await POST(req({}));
    const secondBody = await second.json();

    expect(secondBody.data.user.id).toBe(firstBody.data.user.id);
  });

  it("가치 온보딩을 마친 계정이면 needsOnboarding false를 준다", async () => {
    const first = await POST(req({ fullName: "테스터" }));
    const firstBody = await first.json();

    const repo = await getRepository();
    const { data } = await repo.listExhibitions({ limit: 1 });
    await recordSignal(firstBody.data.user.id, {
      kind: "reaction_must",
      exhibitionId: data[0].id,
      slugs: ["goods"],
    });

    const second = await POST(req({}));
    const secondBody = await second.json();
    expect(secondBody.data.needsOnboarding).toBe(false);
  });

  it("Authorization 헤더가 없으면 401을 준다", async () => {
    const res = await POST(req({}, ""));
    expect(res.status).toBe(401);
  });

  it("bearer 토큰이 유효하지 않으면 401을 준다", async () => {
    state.authUser = null;
    const res = await POST(req({}));
    expect(res.status).toBe(401);
  });

  it("바디가 스키마에 안 맞으면 400을 준다", async () => {
    const res = await POST(req({ fullName: "" }));
    expect(res.status).toBe(400);
  });
});
