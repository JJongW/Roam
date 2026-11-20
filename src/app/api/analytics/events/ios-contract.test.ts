// iOS 계약(#173, Roam-ios). 이 본문은 Roam-ios 의 AnalyticsServerContractTests 가 진짜 APIClient 로
// 보낸 바이트를 그대로 떠 둔 것이다(ROAM_IOS_EVENTS_FIXTURE_OUT). 화면 설계서 E 2-4 이벤트 전부와
// W-22 브랜드 하트가 들어 있다. iOS 가 모양을 바꾸면 그쪽 테스트로 이 파일을 다시 뜬다.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repositories";
import batches from "./__fixtures__/ios-batches.json";

vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  getUserId: async () => null,
}));

import { POST } from "./route";

type Stored = { name?: string; platform?: string; anonId?: string; meta?: Record<string, unknown>; type: string };

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

async function stored(): Promise<Stored[]> {
  await getRepository();
  return (globalThis as unknown as { __roamStore: { analytics: Stored[] } }).__roamStore.analytics.filter((a) => a.type === "app");
}

describe("iOS 가 보낸 묶음(#173)", () => {
  it("묶음 전부 202 이고, 보낸 이벤트가 하나도 빠지지 않고 저장된다", async () => {
    const sent = (batches as { events: { name: string }[] }[]).flatMap((b) => b.events.map((e) => e.name));
    expect(sent.length).toBeGreaterThan(70);
    for (const b of batches) expect((await post(b)).status).toBe(202);
    const rows = await stored();
    expect(rows.map((r) => r.name).sort()).toEqual([...sent].sort());
    expect(new Set(rows.map((r) => r.platform))).toEqual(new Set(["ios"]));
  });

  it("W-22 브랜드 하트 세 이벤트가 이름과 자리(from) 그대로 남는다", async () => {
    for (const b of batches) await post(b);
    const rows = await stored();
    const add = rows.find((r) => r.name === "brand_heart_add");
    expect(add?.meta?.from).toBe("detail_row");
    expect(rows.some((r) => r.name === "brand_heart_remove")).toBe(true);
    expect(rows.some((r) => r.name === "brand_heart_undo")).toBe(true);
  });

  it("측정에 쓰는 길이와 참거짓 키(query_len, answered_question)가 서버에서 지워지지 않는다", async () => {
    for (const b of batches) await post(b);
    const rows = await stored();
    expect(rows.find((r) => r.name === "search_submit")?.meta?.query_len).toBe(4);
    expect(rows.find((r) => r.name === "recap_save")?.meta?.answered_question).toBe(true);
    expect(rows.every((r) => typeof r.meta?.is_logged_in === "boolean")).toBe(true);
  });

  it("같은 묶음을 다시 보내도 두 번 쌓이지 않는다(재전송)", async () => {
    for (const b of batches) await post(b);
    const n = (await stored()).length;
    for (const b of batches) await post(b);
    expect((await stored()).length).toBe(n);
  });
});
