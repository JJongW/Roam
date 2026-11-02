/**
 * SEED Feedback / Scale — 누름 축소는 **배율이 아니라 거리**다.
 *
 * 고정 배율(0.98)을 쓰면 요소마다 실제로 움직이는 양이 달라진다. 같은 손가락으로
 * 눌렀는데 칩은 0.64px, 카드는 3px 움직이면 반응의 세기가 다르게 읽힌다.
 * 그래서 "얼마나 줄일까"가 아니라 "얼마나 움직일까(2px)"를 고정하고, 거기서
 * 배율을 역산한다.
 *
 *   basis = max(높이, 폭 ÷ 4, 24)
 *   배율  = (basis − 2) ÷ basis
 *
 * - 폭 ÷ 4 — 가로로 긴 요소 보정. 전체폭 CTA(370×44)는 높이만 보면 과하게 줄어든다.
 * - 최소 24 — 작은 요소가 8.3%를 넘게 줄지 않도록.
 * - 축소량 2 · 폭 보정 4 · 최소 24는 **서비스 단위로 바꾸지 않는 고정값**이다.
 */
export function pressScale(width: number, height: number): number {
  const basis = Math.max(height, width / 4, 24);
  return (basis - 2) / basis;
}
