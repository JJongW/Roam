import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pushNote, useVisitStore } from "./visit";

/**
 * pushNote의 필드 포함 로직 회귀 테스트 — judgment-vocabulary 최종 리뷰 Fix 1.
 * 예전엔 매 호출이 interest·verdict를 항상 `?? null`로 채워 보내서, 메모만 고쳐도
 * verdict가 null로 덮이고 서버에서 visited_at까지 지워졌다. touched 힌트로 밝힌
 * 필드만 body에 들어가야 한다 — fetch 호출을 가로채 실제 전송 바디를 확인한다.
 */
describe("pushNote — touched로 밝힌 필드만 서버에 보낸다", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    useVisitStore.setState({
      records: { b1: { interest: "must", verdict: "good", memo: "hi" } },
      hasPendingSync: false,
    });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  function mockFetch() {
    let capturedBody: Record<string, unknown> | null = null;
    global.fetch = vi.fn(async (_input, init?: RequestInit) => {
      capturedBody = init?.body
        ? (JSON.parse(init.body as string) as Record<string, unknown>)
        : null;
      return {
        status: 200,
        ok: true,
        json: async () => ({
          data: { note: {}, taste: { judgedCount: 1, pct: null } },
        }),
      } as Response;
    }) as unknown as typeof fetch;
    return () => capturedBody;
  }

  it("touched.interest만 true면 verdict 키는 body에서 빠진다", async () => {
    const getBody = mockFetch();
    await pushNote("b1", { interest: true });
    const body = getBody();
    expect(body).toMatchObject({ interest: "must" });
    expect(body).not.toHaveProperty("verdict");
  });

  it("touched.verdict만 true면 interest 키는 body에서 빠진다", async () => {
    const getBody = mockFetch();
    await pushNote("b1", { verdict: true });
    const body = getBody();
    expect(body).toMatchObject({ verdict: "good" });
    expect(body).not.toHaveProperty("interest");
  });

  it("touched={}면 interest·verdict 둘 다 안 보낸다(메모/사진만 편집하는 쓰기)", async () => {
    const getBody = mockFetch();
    await pushNote("b1", {});
    const body = getBody();
    expect(body).not.toHaveProperty("interest");
    expect(body).not.toHaveProperty("verdict");
    expect(body).toMatchObject({ memo: "hi" });
  });

  it("touched를 생략하면 둘 다 보낸다(로컬 전용 반응의 배치 소급 동기화 기본값)", async () => {
    const getBody = mockFetch();
    await pushNote("b1");
    const body = getBody();
    expect(body).toMatchObject({ interest: "must", verdict: "good" });
  });
});
