import { describe, expect, it } from "vitest";
import type { Floorplan } from "@/lib/floorplans";
import { heartedByHall, heartedOnTheWay, nearestEntrance, nextStop, routePath } from "./guide";

// 홀 둘(A 왼쪽, B 오른쪽). A홀에 부스 세 줄, 가운데 통로.
const fp: Floorplan = {
  width: 1000,
  height: 500,
  halls: [
    { name: "A홀", x: 0, y: 0, w: 480, h: 500 },
    { name: "B홀", x: 520, y: 0, w: 480, h: 500 },
  ],
  decor: [
    { type: "entrance", x: 240, y: 495, text: "출입구", dir: "up" },
    { type: "entrance", x: 760, y: 495, text: "출입구", dir: "up" },
  ],
  booths: [
    { code: "A1", x: 100, y: 100, w: 80, h: 60 },
    { code: "A2", x: 240, y: 100, w: 80, h: 60 },
    { code: "A3", x: 380, y: 100, w: 80, h: 60 },
    { code: "A4", x: 100, y: 300, w: 80, h: 60 },
    { code: "A5", x: 380, y: 300, w: 80, h: 60 },
    { code: "B1", x: 700, y: 200, w: 80, h: 60 },
  ],
};
const B = (id: string, code: string, name = id) => ({ id, code, name });

describe("routePath", () => {
  it("부스 칸을 뚫지 않고 통로로 간다", () => {
    const pts = routePath(fp, "A1", "A3")!;
    expect(pts.length).toBeGreaterThanOrEqual(2);
    const a2 = fp.booths[1];
    for (let i = 1; i < pts.length; i++) {
      for (let s = 0; s <= 10; s++) {
        const x = pts[i - 1].x + ((pts[i].x - pts[i - 1].x) * s) / 10;
        const y = pts[i - 1].y + ((pts[i].y - pts[i - 1].y) * s) / 10;
        const insideA2 = Math.abs(x - a2.x) < a2.w / 2 && Math.abs(y - a2.y) < a2.h / 2;
        expect(insideA2).toBe(false);
      }
    }
  });
  it("출발을 모르면 가까운 출입구에서", () => {
    const pts = routePath(fp, undefined, "A4")!;
    expect(pts[0]).toEqual({ x: 240, y: 495 });
  });
  it("배치도에 없는 부스면 null", () => {
    expect(routePath(fp, undefined, "Z9")).toBeNull();
  });
  it("B홀 부스는 B홀 출입구", () => {
    expect(nearestEntrance(fp, { x: 700, y: 200, w: 80, h: 60 })).toEqual({ x: 760, y: 495 });
  });
});

describe("heartedOnTheWay", () => {
  it("선 가까운 하트 부스를 하나 고른다(출발, 도착 제외)", () => {
    const pts = routePath(fp, "A1", "A3")!;
    const hit = heartedOnTheWay(fp, pts, [B("b1", "A1"), B("b2", "A2"), B("b3", "A3")], new Set(["b1", "b3"]));
    expect(hit?.id).toBe("b2");
  });
  it("멀면 없다", () => {
    const pts = routePath(fp, "A1", "A2")!;
    expect(heartedOnTheWay(fp, pts, [B("b6", "B1")], new Set())).toBeUndefined();
  });
});

describe("nextStop", () => {
  it("같은 홀에서 가장 가까운 곳", () => {
    expect(nextStop(fp, B("b1", "A1"), [B("b3", "A3"), B("b4", "A4"), B("b6", "B1")])?.id).toBe("b4");
  });
  it("같은 홀에 없으면 다른 홀", () => {
    expect(nextStop(fp, B("b1", "A1"), [B("b6", "B1")])?.id).toBe("b6");
  });
  it("남은 곳이 없으면 없다", () => {
    expect(nextStop(fp, B("b1", "A1"), [B("b1", "A1")])).toBeUndefined();
  });
});

describe("heartedByHall", () => {
  it("배치도 홀 순서, 이름 순, 홀 모르는 곳은 맨 뒤", () => {
    const g = heartedByHall(fp, [B("x", "B1", "나"), B("y", "A3", "다"), B("z", "A1", "가"), B("w", "", "라")]);
    expect(g.map((x) => x.hall)).toEqual(["A홀", "B홀", null]);
    expect(g[0].booths.map((b) => b.name)).toEqual(["가", "다"]);
  });
});

describe("routePath 끝", () => {
  it("선은 도착 칸 안으로 들어가지 않는다", () => {
    const pts = routePath(fp, undefined, "A4")!;
    const last = pts[pts.length - 1];
    expect(Math.abs(last.x - 100) < 40 && Math.abs(last.y - 300) < 30).toBe(false);
  });
});
