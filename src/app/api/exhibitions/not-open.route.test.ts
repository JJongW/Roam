import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repositories";
import { exhibitionInputSchema } from "@/lib/schemas";

// 방문객 요청으로 본다. 로컬과 테스트에선 운영자 게이트가 꺼져 있어 isAdminAuthed가 true다.
const admin = { value: false };
vi.mock("@/lib/api/http", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/http")>()),
  isAdminAuthed: async () => admin.value,
}));

import { GET as list } from "./route";
import { GET as detail } from "./[slug]/route";
import { GET as booths } from "./[slug]/booths/route";
import { GET as feed } from "./[slug]/feed/route";
import { GET as floorplan } from "./[slug]/floorplan/route";
import { GET as heatmap } from "./[slug]/heatmap/route";
import { GET as boothDetail } from "../booths/[id]/route";

const ctx = (slug: string) => ({ params: Promise.resolve({ slug }) });
const req = (url = "http://localhost/api") => new Request(url);

let upcomingId = "";
let unplacedBoothId = "";

beforeEach(async () => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  admin.value = false;
  const repo = await getRepository();
  // 브랜드부터 올린 박람회 — 부스는 있어도 도면에 없어 0,0이다(인입이 그렇게 만든다).
  const ex = await repo.createExhibition(
    exhibitionInputSchema.parse({
      slug: "newyear-store-2026",
      name: "새해 준비상점",
      venue: "코엑스",
      startDate: "2026-12-11",
      endDate: "2026-12-14",
    }),
  );
  upcomingId = ex.id;
  const { data: [any] } = await repo.listBooths("sif-2026", { limit: 1 });
  const b = await repo.createBooth({
    exhibitionId: ex.id,
    hallId: any.hallId,
    categoryId: any.categoryId,
    name: "모모상점",
    company: "모모상점",
    description: "",
    images: [],
    tags: [],
    x: 0,
    y: 0,
    popularity: 0,
  } as Parameters<typeof repo.createBooth>[0]);
  unplacedBoothId = b.id;
});

describe("지도에 놓인 부스가 없는 박람회(2026-11-20 Ted 결정)", () => {
  it("목록엔 나오고 openable=false, availability=upcoming_no_map이 붙는다", async () => {
    const res = await list(req("http://localhost/api/exhibitions?limit=100"));
    const { data } = await res.json();
    const row = data.data.find((e: { id: string }) => e.id === upcomingId);
    expect(row).toMatchObject({ openable: false, availability: "upcoming_no_map" });
    const open = data.data.find((e: { slug: string }) => e.slug === "sif-2026");
    expect(open).toMatchObject({ openable: true, availability: "open" });
  });

  it("상세, 부스 목록, 피드, 도면, 히트맵은 409 NOT_OPEN — 빈 데이터를 주지 않는다", async () => {
    for (const [name, handler] of [
      ["detail", detail],
      ["booths", booths],
      ["feed", feed],
      ["floorplan", floorplan],
      ["heatmap", heatmap],
    ] as const) {
      const res = await handler(req(), ctx("newyear-store-2026"));
      expect(res.status, name).toBe(409);
      const body = await res.json();
      expect(body.error.code, name).toBe("NOT_OPEN");
    }
  });

  it("그 박람회의 부스 상세도 막는다", async () => {
    const res = await boothDetail(req(), { params: Promise.resolve({ id: unplacedBoothId }) });
    expect(res.status).toBe(409);
  });

  it("열린 박람회는 그대로 열리고 상세에 openable=true가 붙는다", async () => {
    const res = await detail(req(), ctx("sif-2026"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.openable).toBe(true);
    expect(data.exhibition.slug).toBe("sif-2026");
  });

  it("운영자는 막지 않는다", async () => {
    admin.value = true;
    const res = await detail(req(), ctx("newyear-store-2026"));
    expect(res.status).toBe(200);
    expect((await res.json()).data.openable).toBe(false);
    expect((await booths(req(), ctx("newyear-store-2026"))).status).toBe(200);
  });

  it("부스가 지도에 놓이면 평소처럼 열린다", async () => {
    const repo = await getRepository();
    await repo.updateBooth(unplacedBoothId, { x: 300, y: 200 });
    const res = await detail(req(), ctx("newyear-store-2026"));
    expect(res.status).toBe(200);
  });
});
