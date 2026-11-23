import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  angleDelta,
  cameraKeeping,
  cameraTransform,
  fingerAngle,
  footprint,
  fromContent,
  isRotated,
  NORTH_SNAP_DEG,
  shouldSnapNorth,
  labelQuarter,
  pointInRect,
  screenToWorld,
  toContent,
  uprightAngle,
  uprightAnchor,
  uprightTransform,
  worldToScreen,
  cubicBezier,
  flingDistance,
  flingOffset,
  flingSettled,
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

describe("손 뗀 속도", () => {
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
});

describe("손으로 튕긴 뒤 감속(decay.map-fling, τ 250ms)", () => {
  const tau = parseDurationMs(token("--roam-v2-decay-map-fling-tau"))!;

  it("τ는 토큰에서 250ms", () => {
    expect(tau).toBe(250);
    expect(Number(token("--roam-v2-decay-map-fling-rate"))).toBe(0.996);
  });

  it("초속 2000pt로 튕기면 약 500pt 간다", () => {
    const v = { x: 2, y: 0 }; // 2000pt/s = 2pt/ms
    expect(flingDistance(v, tau).x).toBeCloseTo(500, 6);
    // 0.75초(3τ) 안에 95% 넘게 간다
    expect(flingOffset(v, tau, 750).x).toBeGreaterThan(475);
    expect(flingOffset(v, tau, 750).x).toBeLessThan(500);
  });

  it("출발 속도가 손 뗀 속도와 같다", () => {
    const v = { x: 1.5, y: -0.8 };
    const dt = 0.01;
    const d = flingOffset(v, tau, dt);
    expect(d.x / dt).toBeCloseTo(v.x, 3);
    expect(d.y / dt).toBeCloseTo(v.y, 3);
  });

  it("속도는 v0·e^(−t/τ)로 줄어든다(τ 뒤 1/e)", () => {
    const v = { x: 2, y: 0 };
    const t = tau;
    const dt = 0.01;
    const speed = (flingOffset(v, tau, t + dt).x - flingOffset(v, tau, t).x) / dt;
    expect(speed).toBeCloseTo(2 / Math.E, 3);
  });

  it("남은 거리가 반 px보다 작아지면 멈춘 것으로 본다", () => {
    const v = { x: 2, y: 0 };
    expect(flingSettled(v, tau, 0)).toBe(false);
    expect(flingSettled(v, tau, 3000)).toBe(true);
  });

  it("τ가 0이면(동작 줄이기) 움직이지 않는다", () => {
    expect(flingOffset({ x: 3, y: 0 }, 0, 100)).toEqual({ x: 0, y: 0 });
    expect(flingDistance({ x: 3, y: 0 }, 0)).toEqual({ x: 0, y: 0 });
    expect(flingSettled({ x: 3, y: 0 }, 0, 0)).toBe(true);
  });
});

describe("라벨 단계(부스 번호만 숨긴다, 이름은 늘 보인다)", () => {
  it("번호 글자가 기준 px 이상으로 보이는 배율부터 보인다", () => {
    const font = 8; // 번호 줄 글자 크기(도면 단위)
    const min = 11; // px
    const need = labelLevel(font, min);
    // 그 단계의 가장 작은 배율에서도 기준 이상이다
    const lowest = Math.pow(2, need / 4);
    expect(font * lowest).toBeGreaterThanOrEqual(min - 1e-9);
    // 한 단계 아래에서는 보이지 않는다
    expect(zoomLevel(lowest * 0.999)).toBeLessThan(need);
    expect(zoomLevel(lowest)).toBeGreaterThanOrEqual(need);
  });
  it("번호 줄 opacity는 map-code 투명도에 단계 변수를 곱하고 map-level 토큰으로 옮겨 간다", () => {
    const s = labelFadeStyle(3, 0.7);
    expect(String(s.opacity)).toContain("var(--map-zoom-level)");
    expect(String(s.opacity)).toContain("0.7");
    expect(String(s.transition)).toContain("--roam-v2-motion-map-level-duration");
    expect(String(s.transition)).toContain("--roam-v2-motion-map-level-easing");
  });
});

describe("부스 이름은 어떤 배율에서도 숨기지 않는다(2026-10-15 결정)", () => {
  it("map-layer는 번호 줄에만 labelFadeStyle을 건다", () => {
    const src = readFileSync("src/components/map-v2/map-layer.tsx", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    const uses = src.match(/labelFadeStyle\(/g) ?? [];
    expect(uses).toHaveLength(1);
    expect(src).toMatch(/labelFadeStyle\(\s*labelLevel\(codeSize,/);
  });
});

describe("지도 돌리기(2026-11-23) — 카메라 각도 변환", () => {
  const size = { w: 1200, h: 600 };
  const close = (a: { x: number; y: number }, b: { x: number; y: number }, d = 6) => {
    expect(a.x).toBeCloseTo(b.x, d);
    expect(a.y).toBeCloseTo(b.y, d);
  };

  it("감싸는 상자: 0도는 도면 그대로, 90도는 가로세로가 바뀌고, 45도는 커진다", () => {
    expect(footprint(size, 0)).toEqual({ fw: 1200, fh: 600 });
    expect(footprint(size, 90)).toEqual({ fw: 600, fh: 1200 });
    expect(footprint(size, -270)).toEqual({ fw: 600, fh: 1200 });
    const f = footprint(size, 45);
    expect(f.fw).toBeCloseTo(1800 / Math.SQRT2, 6);
    expect(f.fh).toBeCloseTo(1800 / Math.SQRT2, 6);
  });

  it("0도면 내용 좌표가 도면 좌표 그대로다(돌리기 전 화면이 그대로)", () => {
    expect(toContent({ x: 30, y: 40 }, size, 0)).toEqual({ x: 30, y: 40 });
  });

  it.each([17, 90, 135, -60, 400])("%s도: 도면 → 내용 → 도면이 제자리, 네 모서리가 감싸는 상자 안", (deg) => {
    const p = { x: 123, y: 456 };
    close(fromContent(toContent(p, size, deg), size, deg), p);
    const { fw, fh } = footprint(size, deg);
    for (const c of [
      { x: 0, y: 0 },
      { x: size.w, y: 0 },
      { x: 0, y: size.h },
      { x: size.w, y: size.h },
    ]) {
      const q = toContent(c, size, deg);
      expect(q.x).toBeGreaterThanOrEqual(-1e-6);
      expect(q.y).toBeGreaterThanOrEqual(-1e-6);
      expect(q.x).toBeLessThanOrEqual(fw + 1e-6);
      expect(q.y).toBeLessThanOrEqual(fh + 1e-6);
    }
  });

  it("90도는 시계 방향이다(도면 위쪽이 화면 오른쪽으로 간다)", () => {
    const top = toContent({ x: 600, y: 0 }, size, 90);
    const centre = toContent({ x: 600, y: 300 }, size, 90);
    expect(top.x).toBeGreaterThan(centre.x);
    expect(top.y).toBeCloseTo(centre.y, 6);
  });

  it("SVG에 쓰는 transform 문자열과 worldToScreen이 같은 점을 낸다", () => {
    const cam: Camera = { scale: 0.7, offset: { x: -40, y: 25 }, rotation: 33 };
    const css = cameraTransform(cam, size);
    // 문자열을 왼쪽부터 행렬로 합쳐 점에 적용한다.
    type M = [number, number, number, number, number, number];
    const mul = (a: M, b: M): M => [
      a[0] * b[0] + a[2] * b[1],
      a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3],
      a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4],
      a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    let m: M = [1, 0, 0, 1, 0, 0];
    for (const [, fn, args] of css.matchAll(/(\w+)\(([^)]*)\)/g)) {
      const n = args.split(",").map((v) => parseFloat(v));
      if (fn === "translate") m = mul(m, [1, 0, 0, 1, n[0], n[1]]);
      else if (fn === "scale") m = mul(m, [n[0], 0, 0, n[0], 0, 0]);
      else if (fn === "rotate") {
        const r = (n[0] * Math.PI) / 180;
        m = mul(m, [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r), 0, 0]);
      }
    }
    const p = { x: 222, y: 77 };
    close({ x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }, worldToScreen(p, cam, size));
  });

  it("화면 ↔ 도면이 서로 역이다", () => {
    const cam: Camera = { scale: 1.8, offset: { x: -300, y: -120 }, rotation: -47 };
    const p = { x: 210, y: 380 };
    close(worldToScreen(screenToWorld(p, cam, size), cam, size), p);
  });

  it("두 손가락 돌리기와 확대: 손가락 가운데 아래 도면 점이 손가락을 따라간다", () => {
    const start: Camera = { scale: 1, offset: { x: 0, y: 0 }, rotation: 0 };
    const mid = { x: 180, y: 320 };
    const focal = screenToWorld(mid, start, size);
    const movedMid = { x: 200, y: 300 };
    const cam = cameraKeeping(focal, movedMid, 1.6, 40, size);
    close(worldToScreen(focal, cam, size), movedMid);
    expect(cam.rotation).toBe(40);
  });

  it("각도가 다른 두 카메라 사이: 축 점이 화면에서 곧게 가고 각도는 고르게", () => {
    const from: Camera = { scale: 1, offset: { x: 10, y: 20 }, rotation: 70 };
    const pivot = { x: 500, y: 250 };
    const centre = worldToScreen(pivot, from, size);
    const to = cameraKeeping(pivot, centre, 1, 0, size);
    for (const e of [0.25, 0.5, 0.75]) {
      const c = interpolateCamera(from, to, e, { size, pivot });
      close(worldToScreen(pivot, c, size), centre);
      expect(c.rotation).toBeCloseTo(70 * (1 - e), 9);
    }
    expect(interpolateCamera(from, to, 1, { size, pivot })).toBe(to);
  });

  it("손가락 선 각도 차이는 ±180을 넘을 때 한 바퀴 튀지 않는다", () => {
    expect(angleDelta(170, -170)).toBeCloseTo(20, 9);
    expect(angleDelta(-170, 170)).toBeCloseTo(-20, 9);
    expect(fingerAngle({ x: 0, y: 0 }, { x: 0, y: 10 })).toBeCloseTo(90, 9);
  });

  it("나침반은 가장 가까운 처음 방향으로 짧게 돌아오고, 돌리지 않았으면 숨는다", () => {
    expect(uprightAngle(170)).toBe(0);
    expect(uprightAngle(190)).toBe(360);
    expect(uprightAngle(-200)).toBe(-360);
    expect(isRotated(0)).toBe(false);
    expect(isRotated(720)).toBe(false);
    expect(isRotated(3)).toBe(true);
  });

  it("손을 뗄 때 처음 방향에서 7도 안이면 0도에 붙인다(iOS, Mapbox bearingSnap)", () => {
    expect(NORTH_SNAP_DEG).toBe(7);
    expect(shouldSnapNorth(6.9)).toBe(true);
    expect(shouldSnapNorth(-7)).toBe(true);
    expect(shouldSnapNorth(355)).toBe(true);
    expect(shouldSnapNorth(7.5)).toBe(false);
    expect(shouldSnapNorth(0)).toBe(false);
    expect(shouldSnapNorth(360)).toBe(false);
  });

  it("이름표 사분면: 45도를 넘으면 가로세로를 바꿔 나눈다", () => {
    expect(labelQuarter(0)).toBe(0);
    expect(labelQuarter(44)).toBe(0);
    expect(labelQuarter(46)).toBe(1);
    expect(labelQuarter(-90)).toBe(3);
    expect(labelQuarter(181)).toBe(2);
  });

  it("글자 바로 세우기: 층은 축만 달고 엔진이 각도마다 transform을 적는다", () => {
    expect(uprightAnchor(10, 20)).toEqual({ "data-upright": "10 20 0" });
    const a = uprightAnchor(10, 20)["data-upright"];
    expect(uprightTransform(a, 0)).toBeNull();
    expect(uprightTransform(a, 360)).toBeNull();
    expect(uprightTransform(a, 30)).toBe("rotate(-30 10 20)");
    // 칸 자체 각도(12도)는 지도가 0도여도 되돌린다.
    expect(uprightTransform(uprightAnchor(0, 0, 12)["data-upright"], 0)).toBe("rotate(-12)");
    expect(uprightTransform(uprightAnchor(0, 0, 12)["data-upright"], -12)).toBeNull();
  });
});

describe("돌린 지도에서 누르기 판정", () => {
  const size = { w: 1000, h: 800 };
  const booth = { x: 400, y: 300, w: 60, h: 30 };

  it.each([0, 37, 90, -125])("%s도: 칸 가운데를 누르면 맞고, 칸 밖(긴 변 바깥)을 누르면 안 맞는다", (deg) => {
    const cam: Camera = { scale: 1.4, offset: { x: -150, y: 40 }, rotation: deg };
    const centre = worldToScreen({ x: booth.x, y: booth.y }, cam, size);
    expect(pointInRect(screenToWorld(centre, cam, size), booth)).toBe(true);
    // 칸 오른쪽 끝 바로 안과 바로 밖(도면에서 잰 뒤 화면으로 보내 누른다).
    const inside = worldToScreen({ x: booth.x + 29, y: booth.y + 14 }, cam, size);
    const outside = worldToScreen({ x: booth.x, y: booth.y + 16 }, cam, size);
    expect(pointInRect(screenToWorld(inside, cam, size), booth)).toBe(true);
    expect(pointInRect(screenToWorld(outside, cam, size), booth)).toBe(false);
  });

  it("칸 자체 각도(도면의 기운 칸)도 따진다", () => {
    const tilted = { ...booth, rotate: 90 };
    // 90도 기운 60×30 칸은 세로로 길다.
    expect(pointInRect({ x: booth.x, y: booth.y + 25 }, tilted)).toBe(true);
    expect(pointInRect({ x: booth.x + 25, y: booth.y }, tilted)).toBe(false);
  });
});
