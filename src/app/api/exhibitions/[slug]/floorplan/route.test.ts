import { describe, expect, it } from "vitest";
import { GET } from "./route";
import { FLOORPLANS, VENUE_OF } from "@/lib/floorplans";

function ctx(slug: string) {
  return { params: Promise.resolve({ slug }) };
}

describe("GET /api/exhibitions/[slug]/floorplan", () => {
  it("도면과 장소 제원을 같이 내보낸다 — iOS가 미터로 계산할 수 있게", async () => {
    const res = await GET(new Request("http://localhost"), ctx("sif-2026"));
    expect(res.status).toBe(200);
    const { data } = await res.json();
    expect(data.floorplan.booths.length).toBe(914);
    expect(data.floorplan.halls).toHaveLength(1); // 벽
    expect(data.venue).toMatchObject({
      id: "coex-hall-c",
      meters: { w: 144, h: 72 },
      unitsPerMeter: 20,
      standardBoothMeters: { w: 3, h: 3 },
    });
  });

  it("venue 위에 못 얹은 도면(SIBF)도 도면 자체는 내보낸다", async () => {
    const res = await GET(new Request("http://localhost"), ctx("sibf-2026"));
    const { data } = await res.json();
    expect(data.floorplan.booths.length).toBeGreaterThan(0);
    expect(data.venue).toBeNull();
  });

  it("도면이 없는 전시는 404", async () => {
    const res = await GET(new Request("http://localhost"), ctx("nope-2026"));
    expect(res.status).toBe(404);
  });

  it("도면이 있는 모든 박람회를 내보내고, 버전과 축척을 싣는다", async () => {
    for (const slug of Object.keys(FLOORPLANS)) {
      const res = await GET(new Request("http://localhost"), ctx(slug));
      expect(res.status, slug).toBe(200);
      const { data } = await res.json();
      expect(data.version, slug).toMatch(/^[0-9a-f]{16}$/);
      expect(res.headers.get("etag")).toBe(`"${data.version}"`);
      // 장소 위에 합성한 도면만 축척이 있다.
      expect(data.scale == null, slug).toBe(VENUE_OF[slug] == null);
    }
  });

  it("If-None-Match가 같으면 304, 다르면 200", async () => {
    const first = await GET(new Request("http://localhost"), ctx("sif-2026"));
    const etag = first.headers.get("etag")!;
    const again = await GET(new Request("http://localhost", { headers: { "if-none-match": etag } }), ctx("sif-2026"));
    expect(again.status).toBe(304);
    const stale = await GET(new Request("http://localhost", { headers: { "if-none-match": '"0000"' } }), ctx("sif-2026"));
    expect(stale.status).toBe(200);
  });
});
