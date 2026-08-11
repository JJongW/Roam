import { describe, expect, it } from "vitest";
import { RADAR_AXES, radarPoints, ringPolygon } from "@/lib/values/radar";

const R = 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

describe("RADAR_AXES", () => {
  // 축을 고정해야 방문을 거듭해도 모양을 비교할 수 있다. 순서가 바뀌면 과거
  // 스크린샷·기억과 어긋난다.
  it("8가치를 정의 순서 그대로 쓴다", () => {
    expect(RADAR_AXES.map((a) => a.slug)).toEqual([
      "discovery",
      "experience",
      "goods",
      "social",
      "learning",
      "trend",
      "inspiration",
      "rest",
    ]);
  });
});

describe("radarPoints", () => {
  it("값이 없는 축도 0으로 남는다 — 안 채운 쪽이 보여야 치우침이 읽힌다", () => {
    const pts = radarPoints({ discovery: 1 }, R);
    expect(pts).toHaveLength(8);
    expect(pts.find((p) => p.slug === "goods")!.frac).toBe(0);
  });

  it("첫 축은 12시 방향", () => {
    const p = radarPoints({ discovery: 1 }, R)[0];
    expect(near(p.x, 0)).toBe(true);
    expect(near(p.y, -R)).toBe(true);
  });

  it("세 번째 축(굿즈)은 3시 방향 — 시계 방향으로 45도씩", () => {
    const p = radarPoints({ goods: 1 }, R).find((q) => q.slug === "goods")!;
    expect(near(p.x, R)).toBe(true);
    expect(near(p.y, 0)).toBe(true);
  });

  it("frac 0이면 중심에 붙는다", () => {
    const p = radarPoints({}, R)[0];
    expect(near(p.x, 0)).toBe(true);
    expect(near(p.y, 0)).toBe(true);
  });

  it("1을 넘는 값은 1로 자른다 — 폴리곤이 그리드를 뚫으면 안 된다", () => {
    expect(radarPoints({ discovery: 5 }, R)[0].frac).toBe(1);
  });

  it("음수는 0으로 자른다", () => {
    expect(radarPoints({ discovery: -3 }, R)[0].frac).toBe(0);
  });

  it("라벨 앵커 — 위아래는 middle, 오른쪽은 start, 왼쪽은 end", () => {
    const pts = radarPoints({}, R);
    expect(pts.find((p) => p.slug === "discovery")!.anchor).toBe("middle"); // 12시
    expect(pts.find((p) => p.slug === "goods")!.anchor).toBe("start"); // 3시
    expect(pts.find((p) => p.slug === "learning")!.anchor).toBe("middle"); // 6시
    expect(pts.find((p) => p.slug === "inspiration")!.anchor).toBe("end"); // 9시
  });

  it("8가치 밖 slug는 무시한다", () => {
    const pts = radarPoints({ ai: 1, discovery: 0.5 }, R);
    expect(pts).toHaveLength(8);
    expect(pts.find((p) => p.slug === "discovery")!.frac).toBe(0.5);
  });
});

describe("ringPolygon", () => {
  it("8개 좌표쌍을 낸다", () => {
    expect(ringPolygon(1, R).split(" ")).toHaveLength(8);
  });

  it("frac에 비례해 줄어든다", () => {
    const full = ringPolygon(1, R).split(" ")[0].split(",").map(Number);
    const half = ringPolygon(0.5, R).split(" ")[0].split(",").map(Number);
    expect(near(half[1], full[1] / 2)).toBe(true);
  });
});
