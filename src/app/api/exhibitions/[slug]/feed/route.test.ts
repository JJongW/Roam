import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repositories";
import type { User } from "@/lib/types";

// getCurrentUser·getI18n만 갈아끼운다 — 쿠키·Next 런타임(next/headers) 없이
// 핸들러 본문을 그대로 태우려고. me/values/route.test.ts와 같은 패턴.
const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({
  getCurrentUser: async () => state.user,
}));
vi.mock("@/lib/i18n/server", () => ({
  getI18n: async () => ({ locale: "ko", t: (s: string) => s }),
}));

import { GET } from "./route";

function req(url: string) {
  return new Request(url);
}

describe("GET /api/exhibitions/[slug]/feed", () => {
  beforeEach(() => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore =
      undefined;
    state.user = null;
  });

  it("비로그인이면 개인화 없이 인기순 피드를 준다", async () => {
    const repo = await getRepository();
    const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });
    const slug = exhibitions[0].slug;

    const res = await GET(req(`http://localhost/api/exhibitions/${slug}/feed`), {
      params: Promise.resolve({ slug }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    // {data: {data: [...]}} 이중 래핑이 아니라 {data: [...]} 한 겹인지 확인.
    expect(body.data.data).toBeUndefined();
  });

  it("rhythm 파라미터가 없거나 잘못된 값이면 기본값(light)으로 동작한다 — 에러 없이 200", async () => {
    const repo = await getRepository();
    const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });
    const slug = exhibitions[0].slug;

    const res = await GET(
      req(`http://localhost/api/exhibitions/${slug}/feed?rhythm=nonsense`),
      { params: Promise.resolve({ slug }) },
    );
    expect(res.status).toBe(200);
  });

  it("존재하지 않는 slug면 404를 준다", async () => {
    const res = await GET(
      req("http://localhost/api/exhibitions/no-such-slug/feed"),
      { params: Promise.resolve({ slug: "no-such-slug" }) },
    );
    expect(res.status).toBe(404);
  });
});
