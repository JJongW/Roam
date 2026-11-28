import { describe, expect, it } from "vitest";
import { FLOORPLANS, VENUE_OF } from "@/lib/floorplans";
import { boothCorners, findBoothOverlaps } from "@/lib/floorplan/overlap";
import intake from "../../data/intake/newyear-store-2026.json";
import brands from "../../data/brands/newyear-store-2026.json";

// 공식 온라인 부스맵(map.mynewyear27.com, 배치도 PDF 1121의 벡터)에서 읽은 칸이다.
// 번호 붙은 부스 261칸 + 주최 공간 6곳(무대, 새해 광장, 워크숍 라운지, 새해 사랑방, F&B, 경품데스크).
describe("새해 준비상점 2026 도면(킨텍스 제2전시장 6홀)", () => {
  const fp = FLOORPLANS["newyear-store-2026"];

  it("부스 261칸과 주최 공간 6곳, 번호가 겹치지 않는다", () => {
    expect(fp.booths).toHaveLength(267);
    expect(new Set(fp.booths.map((b) => b.code)).size).toBe(267);
  });

  it("킨텍스 6홀 위에 얹히고 입구와 출구가 하나씩 있다", () => {
    expect(VENUE_OF["newyear-store-2026"]?.id).toBe("kintex-2-hall-6");
    expect(fp.halls).toHaveLength(1);
    expect(fp.gates?.map((g) => g.kind).sort()).toEqual(["in", "out"]);
  });

  it("표준부스(C열)가 3x3m로 떨어진다", () => {
    const upm = VENUE_OF["newyear-store-2026"]!.unitsPerMeter;
    const c12 = fp.booths.find((b) => b.code === "C12")!;
    expect(c12.w / upm).toBeCloseTo(3, 1);
    expect(c12.h / upm).toBeCloseTo(3, 1);
  });

  it("칸끼리 겹치지 않는다", () => {
    expect(findBoothOverlaps(fp.booths).map((o) => `${o.a}×${o.b}`)).toEqual([]);
  });

  it("모든 칸(돌린 모서리 칸 포함)이 홀 벽 안에 있다", () => {
    const h = fp.halls[0];
    const out = fp.booths.filter((b) =>
      boothCorners(b).some(([x, y]) => x < h.x - 0.5 || x > h.x + h.w + 0.5 || y < h.y - 0.5 || y > h.y + h.h + 0.5),
    );
    expect(out.map((b) => b.code)).toEqual([]);
  });

  it("벽 쪽 줄이 벽에 붙는다(왼쪽, 오른쪽, 위 0.5m 이하)", () => {
    const h = fp.halls[0];
    const upm = VENUE_OF["newyear-store-2026"]!.unitsPerMeter;
    const xs = fp.booths.flatMap((b) => boothCorners(b).map(([x]) => x));
    const ys = fp.booths.flatMap((b) => boothCorners(b).map(([, y]) => y));
    expect((Math.min(...xs) - h.x) / upm).toBeLessThanOrEqual(0.5);
    expect((h.x + h.w - Math.max(...xs)) / upm).toBeLessThanOrEqual(0.5);
    expect((Math.min(...ys) - h.y) / upm).toBeLessThanOrEqual(0.5);
  });

  it("인입 파일의 모든 부스가 도면에 있고, 도면의 모든 칸이 인입 파일에 있다", () => {
    const codes = new Set(fp.booths.map((b) => b.code));
    const inIntake = new Set(intake.booths.map((b) => b.code));
    expect(intake.booths.filter((b) => !codes.has(b.code)).map((b) => b.code)).toEqual([]);
    expect([...codes].filter((c) => !inIntake.has(c))).toEqual([]);
  });

  it("인입 파일의 참가 부스 이름은 brands.v1 이름과 같은 글자다(같은 행사 참가 사실에 잇는다)", () => {
    const names = new Set(brands.brands.map((b) => b.name));
    const exhibitors = intake.booths.filter((b) => b.kind === "exhibitor");
    expect(exhibitors).toHaveLength(261);
    expect(exhibitors.filter((b) => !names.has(b.name)).map((b) => b.code)).toEqual([]);
    expect(new Set(exhibitors.map((b) => b.name)).size).toBe(261);
  });
});
