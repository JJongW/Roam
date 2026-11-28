/**
 * 부스 하나로 가는 카메라(찾기에서 고르기, 상세의 "지도에서 보기").
 *
 * 2026-11-28 Ted: 지도 카메라는 사용자가 그 부스로 가라고 할 때만 움직이고, 그때는 그 부스가 화면 가운데
 * 오고 읽을 수 있는 배율로 가까이 간다. 예전 웹은 부스가 있는 홀 하나를 맞췄는데, 홀이 하나뿐인 도면
 * (새해 준비상점, 서울디자인페스티벌 등)에선 그게 지도 전체라 고른 부스가 몇 px짜리 점이 됐다.
 *
 * 규칙은 iOS `FairMapViewModel.focusOnResult`, `showOnMap`과 같다: 부스 칸을 좌우로 칸 폭 2배씩,
 * 위아래로 칸 높이 3배씩 넓힌 상자(이웃 몇 칸이 같이 보인다)를 가려지지 않는 띠 가운데에 맞추고,
 * 이미 더 가까이 보고 있으면 배율은 두고 가운데만 옮긴다. 웹은 하나를 더 지킨다: 그 상자로는 부스 번호가
 * 11px(`READABLE_CODE_PX`)보다 작으면, 부스 칸이 띠에 다 들어가는 한 번호가 11px이 되도록 더 다가간다.
 */
import { cameraKeeping, footprint, type Camera, type MapSize } from "./map-camera";
import { readableScale } from "./map-entry";

/** 도면 위 부스 칸. x, y는 가운데(FloorplanBooth와 같다). `rotate`는 가운데 기준이라 가운데는 그대로다. */
export interface BoothCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 부스 칸 둘레로 이웃까지 담는 상자(왼쪽 위 기준). iOS `cell.insetBy(dx: -w * 2, dy: -h * 3)`. */
export function boothFocusBox(b: BoothCell): { x: number; y: number; w: number; h: number } {
  return { x: b.x - b.w / 2 - b.w * 2, y: b.y - b.h / 2 - b.h * 3, w: b.w * 5, h: b.h * 7 };
}

/** 맞춘 상자가 띠에서 차지하는 몫(엔진 `focusTo`와 같은 0.92). */
const FIT_RATIO = 0.92;

export interface BoothFocusInput {
  /** 상자 왼쪽 위 기준. `boothFocusBox`가 만든다. */
  box: { x: number; y: number; w: number; h: number };
  /** 부스 칸 자체의 크기(읽히는 배율을 재는 데 쓴다). */
  cell: { w: number; h: number };
  /** 상자의 가운데 = 부스 가운데(도면 좌표). */
  center: { x: number; y: number };
  /** 도면 크기. */
  size: MapSize;
  /** 지금 지도 각도(도). 각도는 바꾸지 않는다. */
  rotation: number;
  /** 지도 영역의 너비, 가려지지 않는 세로 띠(위 끝과 높이). */
  view: { w: number; bandTop: number; bandH: number };
  /** 지금 보이는 배율. 이보다 가까이 보고 있으면 배율은 둔다. */
  currentScale?: number;
  minScale: number;
  maxScale: number;
}

/** 부스가 띠 가운데 오는 카메라. 엔진은 이 값에 이동 한계(clampOffset)만 씌운다. */
export function boothFocusCamera(i: BoothFocusInput): Camera {
  const fitIn = (w: number, h: number) => {
    const f = footprint({ w, h }, i.rotation);
    return Math.min(i.view.w / f.fw, i.view.bandH / f.fh) * FIT_RATIO;
  };
  let s = fitIn(i.box.w, i.box.h);
  // 상자로는 번호가 깨알이면(작은 칸) 칸이 띠에 다 들어가는 데까지 번호가 읽히게 다가간다.
  s = Math.max(s, Math.min(readableScale([i.cell], 0), fitIn(i.cell.w, i.cell.h)));
  if (i.currentScale != null && i.currentScale > s) s = i.currentScale;
  s = Math.min(Math.max(s, i.minScale), i.maxScale);
  return cameraKeeping(
    i.center,
    { x: i.view.w / 2, y: i.view.bandTop + i.view.bandH / 2 },
    s,
    i.rotation,
    i.size,
  );
}
