// SEED 모션 토큰의 JS 판본. framer-motion의 transition prop은 문자열이 아니라
// 숫자(초 단위 duration, 4개 숫자 배열 ease)를 요구해 CSS 변수를 직접 못 읽는다 —
// 여기 원본 값을 그대로 복제해 둔다. globals.css의 --motion-* 값과 반드시 같이 바꿀 것.

export const MOTION_DURATION = {
  d1: 0.05,
  d2: 0.1,
  d3: 0.15,
  d4: 0.2,
  d5: 0.25,
  d6: 0.3,
} as const;

export const MOTION_EASE = {
  linear: [0, 0, 1, 1],
  functional: [0.35, 0, 0.35, 1],
  enter: [0, 0, 0.15, 1],
  exit: [0.35, 0, 1, 1],
  enterExpressive: [0.03, 0.4, 0.1, 1],
  exitExpressive: [0.35, 0, 0.95, 0.55],
} as const;
