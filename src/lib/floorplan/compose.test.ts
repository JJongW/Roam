import { describe, expect, it } from "vitest";
import { composeFloorplan, type Layout, type Venue } from "./compose";

const platz: Venue = {
  id: "coex-platz",
  name: "코엑스 더 플라츠",
  meters: { w: 63, h: 35.3 },
  unitsPerMeter: 32,
  standardBoothMeters: { w: 3, h: 2 },
  entrance: { x: 133, y: 1076 },
  exit: { x: 1600, y: 1076 },
  decor: [{ type: "header", x: 1712, y: 5, w: 180, h: 55, text: "라운지" }],
};

const bare: Venue = {
  id: "coex-hall-c",
  name: "코엑스 C홀",
  meters: { w: 144, h: 72 },
  unitsPerMeter: 20,
  standardBoothMeters: { w: 3, h: 3 },
};

function layout(over: Partial<Layout> = {}): Layout {
  return {
    venue: "coex-platz",
    width: 2000,
    height: 1200,
    booths: [{ code: "A01", x: 100, y: 200, w: 96, h: 64 }],
    ...over,
  };
}

describe("composeFloorplan", () => {
  it("같은 장소를 쓰는 전시는 벽·입출구·장식을 그대로 물려받는다", () => {
    // 두 전시가 부스 배치만 다르고 장소는 같다 — 이게 이 구조의 요점이다.
    const a = composeFloorplan(layout(), platz);
    const b = composeFloorplan(
      layout({ booths: [{ code: "Z99", x: 500, y: 500, w: 96, h: 64 }] }),
      platz,
    );
    expect(a.entrance).toEqual(b.entrance);
    expect(a.exit).toEqual(b.exit);
    expect(a.decor).toEqual(b.decor);
    expect(a.booths[0].code).not.toBe(b.booths[0].code);
  });

  it("좌상단 좌표를 중심 좌표로 바꾼다", () => {
    const fp = composeFloorplan(layout(), platz);
    expect(fp.booths[0]).toMatchObject({ x: 100 + 48, y: 200 + 32, w: 96, h: 64 });
  });

  it("시설 부스는 일반 부스와 다른 색을 받는다", () => {
    const fp = composeFloorplan(
      layout({
        booths: [
          { code: "A01", x: 0, y: 0, w: 96, h: 64 },
          { code: "CTR", x: 200, y: 0, w: 96, h: 64, kind: "facility" },
        ],
      }),
      platz,
    );
    expect(fp.booths[0].color).not.toBe(fp.booths[1].color);
  });

  it("입출구를 아직 모르는 장소는 하단 중앙을 임시 기점으로 쓴다", () => {
    // 없는 위치를 venue 파일에 지어 넣으면 그 홀의 다음 전시까지 물려받는다.
    const fp = composeFloorplan(layout({ venue: "coex-hall-c" }), bare);
    expect(fp.entrance).toEqual({ x: 1000, y: 1140 });
    expect(fp.exit).toEqual(fp.entrance);
    expect(fp.gates).toBeUndefined();
    expect(fp.decor).toEqual([]);
  });

  it("interior가 없는 장소는 부스 bbox를 걷는 영역으로 쓴다", () => {
    const fp = composeFloorplan(layout(), platz);
    expect(fp.interior).toHaveLength(1);
    expect(fp.interior![0].w).toBeGreaterThan(96);
  });

  it("장소가 interior를 갖고 있으면 그걸 쓴다", () => {
    const walled: Venue = { ...bare, interior: [{ x: 1, y: 2, w: 3, h: 4 }] };
    const fp = composeFloorplan(layout({ venue: "coex-hall-c" }), walled);
    expect(fp.interior).toEqual([{ x: 1, y: 2, w: 3, h: 4 }]);
  });
});

describe("장소 제원", () => {
  it("코엑스 실측 제원과 표준부스가 맞는다", async () => {
    // 새 도면을 받았을 때 스케일 검증의 기준값이다 — 표준부스가 깨끗하게
    // 떨어지지 않으면 그 도면은 개략도다(SIBF가 그 경우).
    const c = (await import("@/lib/venues/coex-hall-c.json")) as unknown as Venue;
    const p = (await import("@/lib/venues/coex-platz.json")) as unknown as Venue;
    expect(c.meters).toEqual({ w: 144, h: 72 });
    expect(c.standardBoothMeters).toEqual({ w: 3, h: 3 });
    expect(p.meters).toEqual({ w: 63, h: 35.3 });
    expect(p.standardBoothMeters).toEqual({ w: 3, h: 2 });
  });
});
