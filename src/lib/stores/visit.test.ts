import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isHearted, isVisited, pushNote, useVisitStore } from "./visit";

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

describe("하트와 다녀왔어요(새 칸, 2026-11-07, 11-17)", () => {
  const originalFetch = global.fetch;
  afterEach(() => {
    global.fetch = originalFetch;
  });
  beforeEach(() => {
    useVisitStore.setState({ records: {}, hasPendingSync: false });
  });

  it("하트를 켜면 interest도 must로 맞추고, 끄면 비운다", () => {
    const s = useVisitStore.getState();
    s.setHeart("b1", true);
    expect(useVisitStore.getState().records.b1).toMatchObject({ heart: true, interest: "must" });
    expect(isHearted(useVisitStore.getState().records.b1)).toBe(true);
    useVisitStore.getState().setHeart("b1", false);
    expect(useVisitStore.getState().records.b1).toBeUndefined();
  });

  it("옛 interest curious는 하트로 읽고, pass는 하트가 아니다", () => {
    expect(isHearted({ interest: "curious" })).toBe(true);
    expect(isHearted({ interest: "pass" })).toBe(false);
  });

  it("다녀왔어요를 끄면 평가도 지우고, 메모는 남긴다", () => {
    useVisitStore.setState({ records: { b1: { visited: true, verdict: "good", memo: "m" } } });
    useVisitStore.getState().setVisited("b1", false);
    const r = useVisitStore.getState().records.b1;
    expect(r.verdict).toBeUndefined();
    expect(isVisited(r)).toBe(false);
    expect(r.memo).toBe("m");
  });

  it("평가가 있으면 다녀온 것으로 읽는다(옛 기록)", () => {
    expect(isVisited({ verdict: "ok" })).toBe(true);
    expect(isVisited({ interest: "must" })).toBe(false);
  });

  it("pushNote는 touched.heart, touched.visited일 때 새 칸만 보낸다", async () => {
    let body: Record<string, unknown> = {};
    global.fetch = vi.fn(async (_i, init?: RequestInit) => {
      body = JSON.parse(init!.body as string);
      return { status: 200, ok: true, json: async () => ({ data: { note: {}, taste: null } }) } as Response;
    }) as unknown as typeof fetch;
    useVisitStore.getState().setHeart("b1", true);
    await pushNote("b1", { heart: true });
    expect(body).toMatchObject({ heart: true });
    expect(body).not.toHaveProperty("interest");
    expect(body).not.toHaveProperty("visited");
    useVisitStore.getState().setVisited("b1", true);
    await pushNote("b1", { visited: true });
    expect(body).toMatchObject({ visited: true });
    expect(body).not.toHaveProperty("heart");
  });
});

describe("다녀온 시각(visitedAt, UI 6-05, 6-04)", () => {
  beforeEach(() => useVisitStore.setState({ records: {}, hasPendingSync: false }));

  it("다녀왔어요를 켜면 처음 시각을 남기고, 다시 켜도 처음 시각을 지킨다", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-18T05:20:00Z"));
    useVisitStore.getState().setVisited("b1", true);
    const first = useVisitStore.getState().records.b1.visitedAt;
    expect(first).toBe("2026-11-18T05:20:00.000Z");
    vi.setSystemTime(new Date("2026-11-18T06:00:00Z"));
    useVisitStore.getState().setVisited("b1", true);
    expect(useVisitStore.getState().records.b1.visitedAt).toBe(first);
    vi.useRealTimers();
  });

  it("다녀왔어요를 끄면 시각과 평가가 같이 빠지고, 평가를 풀면 방문과 시각은 남는다", () => {
    useVisitStore.getState().setVisited("b1", true);
    useVisitStore.getState().setVerdict("b1", "good");
    useVisitStore.getState().setVerdict("b1", "good"); // 같은 칩 다시 = 풀기
    const r = useVisitStore.getState().records.b1;
    expect(r.verdict).toBeUndefined();
    expect(isVisited(r)).toBe(true);
    expect(r.visitedAt).toBeTruthy();
    useVisitStore.getState().setVerdict("b1", "ok");
    useVisitStore.getState().setVisited("b1", false);
    const off = useVisitStore.getState().records.b1;
    expect(off?.verdict).toBeUndefined();
    expect(off?.visitedAt).toBeUndefined();
  });

  it("평가를 먼저 남기면 그때가 다녀온 시각이다", () => {
    useVisitStore.getState().setVerdict("b2", "bad");
    expect(useVisitStore.getState().records.b2.visitedAt).toBeTruthy();
    expect(isVisited(useVisitStore.getState().records.b2)).toBe(true);
  });
});
