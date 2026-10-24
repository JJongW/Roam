/**
 * 지도에 들어왔을 때의 배율과 자리.
 *
 * 예전엔 "세로를 채우는 배율"로 들어왔다. 부스 글자는 부스 크기에 비례하므로
 * (짧은 변 ÷ 5.5, 7~26) 도면을 다 넣으면 이름이 깨알이 된다. 그래서 고정 배수가
 * 아니라 **"보통(가운데값) 부스의 코드가 11px로 보이는 배율"**로, **입구를 보며**
 * 들어온다(2026-10-15 결정 — 배율을 키우고, 이름은 어떤 배율에서도 숨기지 않는다).
 * "전체 보기"는 그대로 도면 전체를 보여준다.
 *
 * iOS `RoamKit/Features/Map/MapEntry.swift`와 같은 규칙이다.
 */
import type { Floorplan } from "@/lib/floorplans";
import { CODE_RATIO } from "./booth-label";

/** 코드(작은 줄)가 이보다 작으면 읽히지 않는다. */
export const READABLE_CODE_PX = 11;
/** 들어올 때 화면 아래에서 비워 둘 몫 — 하단 칩·카드가 이만큼을 덮는다. */
export const BOTTOM_RESERVE_RATIO = 0.3;

/** 부스 하나의 이름 글자 크기(도면 단위). 짧은 변의 1/5.5, 7~26. */
export function labelBase(w: number, h: number): number {
  return Math.min(Math.max(Math.min(w, h) / 5.5, 7), 26);
}

/** 가운데값 부스의 이름 글자 크기. 가장 작은 칸에 맞추면 칸 하나 때문에 도면
 *  대부분이 화면 밖으로 나가고, 평균은 큰 시설 칸에 끌려간다. */
export function medianLabelBase(sizes: { w: number; h: number }[]): number | null {
  if (sizes.length === 0) return null;
  const bases = sizes.map((s) => labelBase(s.w, s.h)).sort((a, b) => a - b);
  return bases[Math.floor(bases.length / 2)];
}

/** 보통 부스의 코드가 11px로 보이는 배율(도면 1단위 = 1px 기준). 이미 읽히는
 *  도면은 `floor`(맞춤 배율) 아래로 줄이지 않는다. */
export function readableScale(sizes: { w: number; h: number }[], floor: number): number {
  const median = medianLabelBase(sizes);
  if (median == null) return floor;
  return Math.max(READABLE_CODE_PX / (median * CODE_RATIO), floor);
}

/** 들어와서 처음 볼 자리(도면 좌표) — 입구. 이름 붙은 "in" 문 → 아무 문 →
 *  그리기용 입구 → 경로 기본 입구 → 도면 가운데. */
export function entryPoint(fp: Floorplan): { x: number; y: number } {
  const gate = fp.gates?.find((g) => g.kind === "in") ?? fp.gates?.[0];
  if (gate) return { x: gate.x, y: gate.y };
  const decor = fp.decor.find((d) => d.type === "entrance");
  if (decor && decor.type === "entrance") return { x: decor.x, y: decor.y };
  if (fp.entrance) return fp.entrance;
  return { x: fp.width / 2, y: fp.height / 2 };
}

/** 한 축의 offset 을 가둔다 — 화면이 도면 바깥을 비추지 않게. `trail`만큼은
 *  도면 끝이 화면 안으로 들어와도 된다(하단 칩·카드가 덮는 띠). 도면이 화면보다
 *  작으면 가운데에 둔다. */
export function clampAxis(
  value: number,
  view: number,
  plan: number,
  trail = 0,
): number {
  const low = view - trail - plan;
  const high = 0;
  if (low > high) return (view - plan) / 2;
  return Math.min(Math.max(value, low), high);
}
