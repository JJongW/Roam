import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cubicBezier,
  glideDistance,
  initialSlope,
  interpolateCamera,
  labelFadeStyle,
  labelLevel,
  parseCubicBezier,
  parseDurationMs,
  releaseVelocity,
  zoomLevel,
  type Camera,
} from "./map-camera";

/** tokens.css(Roam-design 사본)에서 변수 값을 var()를 풀어 읽는다 — 브라우저 계산값과 같은 꼴. */
const css = readFileSync("src/styles/v2/tokens.css", "utf8");
function token(name: string): string {
  const m = css.match(new RegExp(`${name}:\\s*([^;]+);`));
  if (!m) throw new Error(`${name} 없음`);
  const v = m[1].trim();
  const ref = v.match(/^var\((--[a-z0-9-]+)\)$/);
  return ref ? token(ref[1]) : v;
}

const screen = (c: Camera, w: { x: number; y: number }) => ({
  x: c.offset.x + c.scale * w.x,
  y: c.offset.y + c.scale * w.y,
});

describe("지도 모션 토큰을 읽는다", () => {
  it("map-move는 300ms(d6)다 — Ted 결정 상한", () => {
    expect(parseDurationMs(token("--roam-v2-motion-map-move-duration"))).toBe(300);
  });
  it("map-move 곡선과 정착 대체 곡선(enter)을 읽는다", () => {
    expect(parseCubicBezier(token("--roam-v2-motion-map-move-easing"))).toEqual([0.35, 0, 0.35, 1]);
    expect(parseCubicBezier(token("--roam-v2-easing-enter"))).toEqual([0, 0, 0.15, 1]);
  });
  it("map-level 길이를 읽는다", () => {
    expect(parseDurationMs(token("--roam-v2-motion-map-level-duration"))).toBe(200);
  });
  it("못 읽는 값은 null", () => {
    expect(parseDurationMs("")).toBeNull();
    expect(parseDurationMs("fast")).toBeNull();
    expect(parseDurationMs("0.3s")).toBe(300);
    expect(parseCubicBezier("ease-out")).toBeNull();
  });
});

describe("cubicBezier", () => {
  it("양 끝은 0과 1", () => {
    const f = cubicBezier([0.35, 0, 0.35, 1]);
    expect(f(0)).toBe(0);
    expect(f(1)).toBe(1);
  });
  it("곡선 위 점과 맞는다(매개변수 u=0.5에서 x, y)", () => {
    // cubic-bezier(0.35,0,0.35,1)의 u=0.5: x = 0.75·0.35 + 0.125 = 0.3875, y = 0.375 + 0.125 = 0.5
    expect(cubicBezier([0.35, 0, 0.35, 1])(0.3875)).toBeCloseTo(0.5, 4);
  });
  it("linear는 그대로", () => {
    const f = cubicBezier([0, 0, 1, 1]);
    for (const t of [0.1, 0.33, 0.8]) expect(f(t)).toBeCloseTo(t, 4);
  });
  it("단조 증가", () => {
    const f = cubicBezier([0, 0, 0.15, 1]);
    let prev = 0;
    for (let i = 1; i <= 100; i++) {
      const v = f(i / 100);
      expect(v).toBeGreaterThanOrEqual(prev - 1e-9);
      prev = v;
    }
  });
});

describe("interpolateCamera — 확대와 이동을 같은 진행도로", () => {
  const from: Camera = { scale: 0.5, offset: { x: 10, y: 20 }, rotation: 0 };
  const to: Camera = { scale: 2, offset: { x: -300, y: -150 }, rotation: 0 };

  it("양 끝은 시작과 끝 그대로", () => {
    expect(interpolateCamera(from, to, 0)).toEqual(from);
    expect(interpolateCamera(from, to, 1)).toEqual(to);
  });

  it("도면 위 어떤 점이든 화면에서 곧은 선을 따라간다(초점이 휘지 않는다)", () => {
    for (const w of [
      { x: 0, y: 0 },
      { x: 400, y: 120 },
      { x: 250, y: 900 },
    ]) {
      const a = screen(from, w);
      const b = screen(to, w);
      for (const e of [0.1, 0.25, 0.5, 0.75, 0.9]) {
        const p = screen(interpolateCamera(from, to, e), w);
        // 시작-끝 선분에서 벗어난 거리(외적 / 길이)
        const cross = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
        expect(Math.abs(cross) / Math.hypot(b.x - a.x, b.y - a.y)).toBeLessThan(1e-6);
      }
    }
  });

  it("커서 지점 확대(고정점)는 그 지점이 화면에서 움직이지 않는다", () => {
    const focal = { x: 180, y: 300 }; // 화면 px
    const s0 = 1;
    const s1 = 3;
    const o0 = { x: -50, y: -80 };
    const world = { x: (focal.x - o0.x) / s0, y: (focal.y - o0.y) / s0 };
    const a: Camera = { scale: s0, offset: o0, rotation: 0 };
    const b: Camera = {
      scale: s1,
      offset: { x: focal.x - world.x * s1, y: focal.y - world.y * s1 },
      rotation: 0,
    };
    for (const e of [0.2, 0.5, 0.8]) {
      const p = screen(interpolateCamera(a, b, e), world);
      expect(p.x).toBeCloseTo(focal.x, 6);
      expect(p.y).toBeCloseTo(focal.y, 6);
    }
  });

  it("배율은 곱셈으로 고르게 바뀐다(가운데 진행도에서 기하평균)", () => {
    expect(interpolateCamera(from, to, 0.5).scale).toBeCloseTo(1, 9);
  });

  it("배율이 같으면 위치만 곧게", () => {
    const a: Camera = { scale: 1, offset: { x: 0, y: 0 }, rotation: 0 };
    const b: Camera = { scale: 1, offset: { x: 100, y: -40 }, rotation: 90 };
    const m = interpolateCamera(a, b, 0.25);
    expect(m.offset).toEqual({ x: 25, y: -10 });
    expect(m.rotation).toBe(22.5);
  });
});

describe("손 뗀 뒤 관성", () => {
  it("마지막 창 안의 표본으로 속도를 잰다", () => {
    const v = releaseVelocity(
      [
        { t: 0, x: 0, y: 0 },
        { t: 200, x: 50, y: 0 },
        { t: 216, x: 70, y: 10 },
        { t: 232, x: 90, y: 20 },
      ],
      240,
      100,
    );
    // 200~232 표본만: 40px / 32ms
    expect(v.x).toBeCloseTo(40 / 32, 6);
    expect(v.y).toBeCloseTo(20 / 32, 6);
  });
  it("멈췄다가 놓으면 속도 0", () => {
    const v = releaseVelocity(
      [
        { t: 0, x: 0, y: 0 },
        { t: 16, x: 30, y: 0 },
      ],
      500,
      100,
    );
    expect(v).toEqual({ x: 0, y: 0 });
  });
  it("미끄러지는 첫 속도가 손 뗀 속도와 같다", () => {
    const curve: [number, number, number, number] = [0, 0, 0.15, 1];
    const v = { x: 2, y: -1 }; // px/ms
    const T = 300;
    const d = glideDistance(v, T, curve);
    const f = cubicBezier(curve);
    // 곡선 시작이 접선으로만 정해지는 꼴이라 아주 짧은 구간에서 잰다(5% 안).
    const dt = 0.02; // ms
    const startV = (d.x * f(dt / T)) / dt;
    expect(Math.abs(startV - v.x) / v.x).toBeLessThan(0.05);
    expect(initialSlope(curve)).toBeCloseTo(1 / 0.15, 9);
  });
  it("천천히 출발하는 곡선이나 길이 0이면 미끄러지지 않는다", () => {
    expect(glideDistance({ x: 3, y: 0 }, 300, [0.35, 0, 0.35, 1])).toEqual({ x: 0, y: 0 });
    expect(glideDistance({ x: 3, y: 0 }, 0, [0, 0, 0.15, 1])).toEqual({ x: 0, y: 0 });
  });
});

describe("라벨 단계", () => {
  it("글자가 기준 px 이상으로 보이는 배율부터 보인다", () => {
    const font = 8; // 도면 단위
    const min = 11; // px
    const need = labelLevel(font, min);
    // 그 단계의 가장 작은 배율에서도 기준 이상이다
    const lowest = Math.pow(2, need / 4);
    expect(font * lowest).toBeGreaterThanOrEqual(min - 1e-9);
    // 한 단계 아래에서는 보이지 않는다
    expect(zoomLevel(lowest * 0.999)).toBeLessThan(need);
    expect(zoomLevel(lowest)).toBeGreaterThanOrEqual(need);
  });
  it("opacity는 단계 변수로 잇고 map-level 토큰으로 옮겨 간다", () => {
    const s = labelFadeStyle(3, 0.7);
    expect(String(s.opacity)).toContain("var(--map-zoom-level)");
    expect(String(s.opacity)).toContain("0.7");
    expect(String(s.transition)).toContain("--roam-v2-motion-map-level-duration");
    expect(String(s.transition)).toContain("--roam-v2-motion-map-level-easing");
  });
});
