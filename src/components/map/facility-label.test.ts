import { describe, expect, it } from "vitest";
import { FLOORPLANS } from "@/lib/floorplans";
import {
  besideRect,
  facilityBeside,
  layoutFacilityInside,
  wrapFacilityName,
  type CenterRect,
} from "./facility-label";

// iOS `FacilityLabelTests`(PR #234)와 같은 사례. 글자 폭은 한 글자 10으로 어림한다.
// iOS 상자는 왼쪽 위 기준이고 여기 칸은 가운데 기준이라 좌표만 옮겨 적었다.
const measure = (s: string) => [...s].length * 10;
const fromTopLeft = (x: number, y: number, w: number, h: number): CenterRect => ({
  x: x + w / 2,
  y: y + h / 2,
  w,
  h,
});

describe("시설 칸 이름 줄바꿈", () => {
  it("어절 단위로 줄을 바꾼다", () => {
    expect(
      wrapFacilityName("디자인하우스 50년 특별전 〈막 포스터 프로젝트〉", 130, measure),
    ).toEqual(["디자인하우스 50년", "특별전 〈막 포스터", "프로젝트〉"]);
  });

  it("들어가면 한 줄", () => {
    expect(wrapFacilityName("무대", 100, measure)).toEqual(["무대"]);
    expect(wrapFacilityName("SDF SHOP", 100, measure)).toEqual(["SDF SHOP"]);
  });

  it("어절 하나가 칸보다 길면 어절 안에서 끊지 않고 포기한다", () => {
    expect(wrapFacilityName("디자인하우스", 50, measure)).toBeNull();
    expect(wrapFacilityName("", 50, measure)).toBeNull();
  });

  it("칸 안에 안 들어가면 글자를 줄이거나 …을 붙이지 않고 null", () => {
    // 얇은 세로 막대(SDF 2026 A-05, 21×194)
    expect(layoutFacilityInside("SDF Stage", 21, 194)).toBeNull();
    // 넓은 칸은 어절 단위 여러 줄, 글자 크기는 부스 이름 기준 크기 그대로
    const l = layoutFacilityInside("디자인하우스 50년 특별전 〈막 포스터 프로젝트〉", 399, 127);
    expect(l?.lines.join(" ")).toBe("디자인하우스 50년 특별전 〈막 포스터 프로젝트〉");
    expect(l?.lines.every((line) => !line.includes("…"))).toBe(true);
  });
});

describe("시설 칸 옆 이름", () => {
  it("얇은 막대의 오른쪽 빈 바닥에 쓴다", () => {
    const bar = fromTopLeft(20, 100, 3, 60);
    const floor = { x: 10, y: 0, w: 400, h: 400 };
    expect(besideRect({ w: 60, h: 15 }, bar, 4, [bar], [floor])).toEqual(
      fromTopLeft(27, 122.5, 60, 15),
    );
  });

  it("오른쪽이 막히면 왼쪽, 양쪽 다 막히면 쓰지 않는다. 홀 밖으로도 나가지 않는다", () => {
    const bar = fromTopLeft(100, 100, 3, 60);
    const floor = { x: 0, y: 0, w: 400, h: 400 };
    const right = fromTopLeft(110, 110, 40, 40);
    const size = { w: 60, h: 15 };
    expect(besideRect(size, bar, 4, [bar, right], [floor])).toEqual(
      fromTopLeft(36, 122.5, 60, 15),
    );
    const leftCell = fromTopLeft(40, 110, 40, 40);
    expect(besideRect(size, bar, 4, [bar, right, leftCell], [floor])).toBeNull();
    const wallBar = fromTopLeft(2, 100, 3, 60);
    const blocker = fromTopLeft(8, 100, 40, 60);
    expect(besideRect(size, wallBar, 4, [wallBar, blocker], [floor])).toBeNull();
  });

  it("기울어진 칸, 글자가 막대보다 긴 칸은 옆에 쓰지 않는다", () => {
    const floor = { x: 0, y: 0, w: 1000, h: 1000 };
    const bar = { ...fromTopLeft(100, 100, 21, 194), rotate: 30 };
    expect(facilityBeside("SDF Stage", bar, [bar], [floor])).toBeNull();
    const short = fromTopLeft(100, 100, 21, 20);
    expect(facilityBeside("SDF Stage", short, [short], [floor])).toBeNull();
  });

  it("SDF 2026 A-05(SDF Stage) 이름은 칸 안이 아니라 막대 옆 빈 바닥에 쓴다", () => {
    const fp = FLOORPLANS["sdf-2026"];
    const a05 = fp.booths.find((b) => b.code === "A-05")!;
    expect(layoutFacilityInside("SDF Stage", a05.w, a05.h)).toBeNull();
    const beside = facilityBeside("SDF Stage", a05, fp.booths, fp.halls);
    expect(beside).not.toBeNull();
    // 막대 오른쪽(또는 왼쪽)에 붙고, 세로는 막대 가운데
    expect(beside!.rect.y).toBe(a05.y);
    expect(Math.abs(beside!.rect.x - a05.x)).toBeGreaterThan(a05.w / 2);
  });
});
