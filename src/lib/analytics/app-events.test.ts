import { describe, expect, it } from "vitest";
import { sanitizeProps, summarizeAppEvents } from "./app-events";

describe("sanitizeProps", () => {
  it("좌표, 메모, 회고, 묻는 말 키를 버린다", () => {
    const { props, dropped } = sanitizeProps({
      latitude: 1, lng: 2, location: "x", memo_text: "a", recap: "b", query: "c", nickname: "d",
      booth_id: "b1", source: "map", rank: 2, ok: true,
    });
    expect(props).toEqual({ booth_id: "b1", source: "map", rank: 2, ok: true });
    expect(dropped).toHaveLength(7);
  });

  it("80자를 넘는 문자열은 글 원문으로 보고 버린다", () => {
    expect(sanitizeProps({ reason: "a".repeat(81), kind: "short" }).props).toEqual({ kind: "short" });
  });

  it("비슷하지만 다른 키(step, len_bucket)는 남긴다", () => {
    expect(sanitizeProps({ step: 2, len_bucket: "1-10" }).props).toEqual({ step: 2, len_bucket: "1-10" });
  });

  it("설계서 E 2-4의 길이 키와 참거짓 키(query_len, answered_question)는 남긴다", () => {
    const { props, dropped } = sanitizeProps({ query_len: 4, answered_question: true, query: "원문", question: "원문" });
    expect(props).toEqual({ query_len: 4, answered_question: true });
    expect(dropped).toEqual(["query", "question"]);
  });
});

describe("summarizeAppEvents", () => {
  it("이름, 플랫폼, 버전별로 세고 설치 수는 anon_id로 센다", () => {
    const s = summarizeAppEvents([
      { name: "app_open", platform: "ios", anonId: "a", appVersion: "1.0.0", createdAt: "2026-11-20T01:00:00Z" },
      { name: "app_open", platform: "ios", anonId: "b", appVersion: "1.0.0", createdAt: "2026-11-20T02:00:00Z" },
      { name: "brand_heart_add", platform: "ios", anonId: "a", appVersion: "1.0.1", createdAt: "2026-11-20T03:00:00Z" },
    ]);
    expect(s.total).toBe(3);
    expect(s.installs).toBe(2);
    expect(s.lastAt).toBe("2026-11-20T03:00:00Z");
    expect(s.byName).toEqual([
      { name: "app_open", count: 2, lastAt: "2026-11-20T02:00:00Z" },
      { name: "brand_heart_add", count: 1, lastAt: "2026-11-20T03:00:00Z" },
    ]);
    expect(s.byVersion.map((v) => [v.appVersion, v.count])).toEqual([["1.0.0", 2], ["1.0.1", 1]]);
  });

  it("비어 있으면 0", () => {
    expect(summarizeAppEvents([])).toMatchObject({ total: 0, installs: 0, lastAt: null, byName: [] });
  });
});
