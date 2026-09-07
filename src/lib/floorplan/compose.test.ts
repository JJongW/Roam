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

  it("venue의 미터 좌표를 도면 단위로 환산한다", () => {
    // 홀 원점이 도면 (200,100)이고 축척 20u/m이면, 홀 기준 3m 지점은 260이다.
    const registered = { ...bare, entrance: { x: 3, y: 5 } };
    const fp = composeFloorplan(
      layout({ venue: "coex-hall-c", unitsPerMeter: 20, hallOrigin: { x: 200, y: 100 } }),
      registered,
    );
    expect(fp.entrance).toEqual({ x: 200 + 60, y: 100 + 100 });
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

describe("코엑스 장소 제원", () => {
  // business.coex.co.kr 실측 제원(2026-07-29). 새 도면을 받았을 때 축척을 잡는
  // 기준값이라 오타 하나가 도면 전체를 틀어지게 만든다 — 리터럴로 고정한다.
  const EXPECTED: Record<string, { w: number; h: number; booth: [number, number] }> = {
    "coex-hall-a": { w: 144, h: 72, booth: [3, 3] },
    "coex-hall-b1": { w: 45, h: 81, booth: [3, 3] },
    "coex-hall-b2": { w: 45, h: 81, booth: [3, 3] },
    "coex-hall-c": { w: 144, h: 72, booth: [3, 3] },
    "coex-hall-d": { w: 81, h: 81, booth: [3, 3] },
    "coex-platz": { w: 63, h: 35.3, booth: [3, 2] },
    "coex-magok-1f": { w: 108, h: 69, booth: [3, 3] },
  };

  it.each(Object.keys(EXPECTED))("%s 제원이 맞는다", async (id) => {
    const v = (await import(`@/lib/venues/${id}.json`)) as unknown as Venue;
    const e = EXPECTED[id];
    expect(v.meters).toEqual({ w: e.w, h: e.h });
    expect(v.standardBoothMeters).toEqual({ w: e.booth[0], h: e.booth[1] });
    expect(v.unitsPerMeter).toBeGreaterThan(0);
  });

  it("위치를 모르는 장소는 입출구를 비워둔다 — 지어내면 다음 전시가 물려받는다", async () => {
    // 공식 평면도를 아직 안 읽은 홀들. 읽으면 여기서 빼고 아래 검사로 옮긴다.
    for (const id of ["coex-hall-a", "coex-hall-b1", "coex-hall-b2", "coex-hall-d"]) {
      const v = (await import(`@/lib/venues/${id}.json`)) as unknown as Venue;
      expect(v.entrance, `${id}`).toBeUndefined();
      expect(v.gates ?? [], `${id}`).toEqual([]);
    }
  });

  it("마곡 전시홀 치수는 공식 면적과 맞아떨어진다", async () => {
    // 도면에 치수선이 없어 면적÷종횡비로 역산했다 — 108×69가 7,452㎡로 정확히
    // 떨어지는 게 그 역산의 근거다. 치수를 고치려면 이 곱도 같이 맞아야 한다.
    const v = (await import("@/lib/venues/coex-magok-1f.json")) as unknown as Venue;
    expect(v.meters.w * v.meters.h).toBe(7452);
    expect(v.wc).toHaveLength(4);
    expect(v.gates).toHaveLength(4);
  });

  it("C홀은 공식 평면도에서 읽은 주출입구를 갖는다 — 서브홀 경계 36m·108m", async () => {
    const v = (await import("@/lib/venues/coex-hall-c.json")) as unknown as Venue;
    // C4|C3 경계 36m, C2|C1 경계 108m, 둘 다 남측 벽(y=72m).
    expect(v.entrance).toEqual({ x: 36, y: 72 });
    expect(v.exit).toEqual({ x: 108, y: 72 });
    expect(v.wc).toHaveLength(4);
    for (const p of v.wc!) {
      expect(p.x).toBeGreaterThan(0);
      expect(p.x).toBeLessThan(144); // 홀 폭 안
      expect(p.y).toBe(72);
    }
  });
});
