import { describe, expect, it } from "vitest";
import { GET } from "./route";

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
});
