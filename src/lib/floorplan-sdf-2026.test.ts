import { describe, expect, it } from "vitest";
import { FLOORPLANS, VENUE_OF } from "@/lib/floorplans";
import { findBoothOverlaps } from "@/lib/floorplan/overlap";
import intake from "../../data/intake/sdf-2026.json";
import exhibition from "../../data/exhibitions/sdf-2026.json";

// 공식 부스배치도(2026-11-23 게시) 1쪽에서 벡터로 읽은 칸이다. 번호 붙은 칸 250개 + SDF Stage(A-05) 막대 하나.
describe("서울디자인페스티벌 2026 도면(코엑스 A홀)", () => {
  const fp = FLOORPLANS["sdf-2026"];

  it("배치도의 부스 251칸, 번호가 겹치지 않는다", () => {
    expect(fp.booths).toHaveLength(251);
    expect(new Set(fp.booths.map((b) => b.code)).size).toBe(251);
  });

  it("코엑스 A홀 위에 얹히고 출입구가 있다", () => {
    expect(VENUE_OF["sdf-2026"]?.id).toBe("coex-hall-a");
    expect(fp.halls).toHaveLength(1);
    expect(fp.gates?.length).toBeGreaterThan(0);
  });

  it("칸끼리 겹치지 않는다", () => {
    expect(findBoothOverlaps(fp.booths).map((o) => `${o.a}×${o.b}`)).toEqual([]);
  });

  it("모든 칸이 홀 벽 안에 있다", () => {
    const h = fp.halls[0];
    const out = fp.booths.filter(
      (b) => b.x - b.w / 2 < h.x || b.x + b.w / 2 > h.x + h.w || b.y - b.h / 2 < h.y || b.y + b.h / 2 > h.y + h.h,
    );
    expect(out.map((b) => b.code)).toEqual([]);
  });

  it("인입 파일의 모든 부스가 도면에 있고, 도면의 모든 칸이 인입 파일에 있다", () => {
    const codes = new Set(fp.booths.map((b) => b.code));
    const inIntake = new Set(intake.booths.map((b) => b.code));
    expect(intake.booths.filter((b) => !codes.has(b.code)).map((b) => b.code)).toEqual([]);
    expect([...codes].filter((c) => !inIntake.has(c))).toEqual([]);
  });

  it("행사 행의 지도 크기가 도면과 같다", () => {
    expect([exhibition.mapWidth, exhibition.mapHeight]).toEqual([fp.width, fp.height]);
  });
});
