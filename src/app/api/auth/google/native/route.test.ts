import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  claims: {
    sub: "google-sub-1",
    email: "g@example.com",
    name: "테스터",
    picture: "https://example.com/avatar.png",
  } as {
    sub: string;
    email?: string;
    name?: string;
    picture?: string;
  } | null,
  shouldThrow: false,
  cookieJar: new Map<string, { value: string }>(),
}));
vi.mock("@/lib/auth/verify-google-token", () => ({
  verifyGoogleIdToken: async () => {
    if (state.shouldThrow) throw new Error("bad token");
    return state.claims;
  },
}));
vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    env: { ...actual.env, GOOGLE_IOS_CLIENT_ID: "google-client-id" },
  };
});
// route.ts calls setUserCookie() → next/headers cookies(), which throws outside
// a real Next.js request scope (`cookies was called outside a request scope`).
// No other route test in this repo exercises a cookie-setting route yet, so
// there's no existing pattern to reuse — stub with a plain in-memory jar; the
// tests below only assert on the JSON body, never on cookies themselves.
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
import { POST } from "./route";

function req(body: unknown) {
  return new Request("http://localhost/api/auth/google/native", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/google/native", () => {
  beforeEach(() => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore =
      undefined;
    state.claims = {
      sub: "google-sub-1",
      email: "g@example.com",
      name: "테스터",
      picture: "https://example.com/avatar.png",
    };
    state.shouldThrow = false;
    state.cookieJar.clear();
  });

  it("신규 Google 계정이면 생성하고 needsOnboarding true를 준다", async () => {
    const res = await POST(req({ idToken: "t" }));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.data.needsOnboarding).toBe(true);
    expect(body.data.user.nickname).toContain("테스터");
  });

  it("이미 연결된 Google 계정이면 기존 유저로 로그인한다", async () => {
    const first = await POST(req({ idToken: "t" }));
    const firstBody = await first.json();

    const second = await POST(req({ idToken: "t" }));
    const secondBody = await second.json();

    expect(secondBody.data.user.id).toBe(firstBody.data.user.id);
  });

  it("가치 온보딩을 마친 계정이면 needsOnboarding false를 준다", async () => {
    const first = await POST(req({ idToken: "t" }));
    const firstBody = await first.json();

    // /api/me/values 라우트와 동일한 패턴: 명시 신호를 심어 브레인을 채운다.
    const repo = await getRepository();
    const { data } = await repo.listExhibitions({ limit: 1 });
    await recordSignal(firstBody.data.user.id, {
      kind: "reaction_must",
      exhibitionId: data[0].id,
      slugs: ["goods"],
    });

    const second = await POST(req({ idToken: "t" }));
    const secondBody = await second.json();
    expect(secondBody.data.needsOnboarding).toBe(false);
  });

  it("토큰 검증 실패 시 401을 준다", async () => {
    state.shouldThrow = true;
    const res = await POST(req({ idToken: "bad" }));
    expect(res.status).toBe(401);
  });

  it("바디가 스키마에 안 맞으면 400을 준다", async () => {
    const res = await POST(req({}));
    expect(res.status).toBe(400);
  });
});
