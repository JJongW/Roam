import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import intake from "../../data/intake/ddp-designfair-2026.json";

describe("DDP디자인페어 2026 도면", () => {
  const fp = FLOORPLANS["ddp-designfair-2026"];
  it("공식 공간안내의 부스 99개 + 입구·출구", () => {
    expect(fp.booths).toHaveLength(99);
    expect(fp.entrance && fp.exit).toBeTruthy();
  });
  it("인입 파일의 모든 부스가 도면에 있다(좌표는 도면이 댄다)", () => {
    const codes = new Set(fp.booths.map((b) => b.code));
    expect(intake.booths.filter((b) => !codes.has(b.code))).toEqual([]);
  });
});
