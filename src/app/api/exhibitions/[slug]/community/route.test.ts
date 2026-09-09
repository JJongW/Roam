import { beforeEach, describe, expect, it, vi } from "vitest";
import { MockRepository } from "@/lib/mock/repository";
import type { User } from "@/lib/types";

// getCurrentUser만 갈아끼운다 — 쿠키·Next 런타임 없이 핸들러 본문을 그대로 태우려고.
const state = vi.hoisted(() => ({ user: null as User | null }));
vi.mock("@/lib/api/session", () => ({
  getCurrentUser: async () => state.user,
}));

import { POST } from "./route";

const ctx = { params: Promise.resolve({ slug: "sibf-2026" }) };

function req(body: unknown) {
  return new Request("http://localhost/api/exhibitions/sibf-2026/community", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

describe("POST /api/exhibitions/[slug]/community", () => {
  const repo = new MockRepository();
  let user: User;

  beforeEach(async () => {
    (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
    user = await repo.createUser("작성자");
    state.user = user;
  });

  // 0056 이전엔 ensureSession()이 익명 세션을 만들어줘서 비로그인도 글이 써졌다.
  // 페이지는 proxy가 막았지만 API는 안 막혀 있었다.
  it("비로그인이면 401 — 익명 작성을 막는다", async () => {
    state.user = null;
    const res = await POST(req({ body: "익명으로 써볼게요" }), ctx);
    expect(res.status).toBe(401);
  });

  it("로그인 상태면 작성되고 소유자가 계정 id로 저장된다", async () => {
    const res = await POST(req({ body: "로그인하고 씁니다" }), ctx);
    expect(res.status).toBe(201);
    const { data } = await res.json();
    expect(data.post.userId).toBe(user.id);
  });

  it("남의 글은 삭제되지 않는다", async () => {
    const other = await repo.createUser("남");
    const post = await repo.createPost(other.id, "ex_sibf_2026", {
      authorName: "남",
      body: "남의 글",
    });
    expect((await repo.deletePost(post.id, user.id)).deleted).toBe(false);
    expect((await repo.deletePost(post.id, other.id)).deleted).toBe(true);
  });
});
