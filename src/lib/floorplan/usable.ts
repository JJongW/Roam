/**
 * 지도를 그릴 만한 좌표가 있는지.
 *
 * 전시를 붙이는 표준 경로는 **도면 등록 + 인입** 두 단계인데(CLAUDE.md), 인입만
 * 하고 `FLOORPLANS[slug]`를 안 넣으면 부스 좌표가 비어 모든 부스가 (0,0) 한 점에
 * 겹친다. 그 상태의 지도는 "없다"가 아니라 **거짓**이다 — 사용자는 전시장 입구
 * 왼쪽에 256개 부스가 모여 있다고 읽는다.
 *
 * 서로 다른 자리가 둘 이상이면 그릴 수 있다고 본다. 한 부스만 있는 전시는
 * 지도를 그릴 이유가 없고, 전부 같은 자리면 좌표가 없는 것과 같다.
 */
export function hasUsableLayout(
  booths: readonly { x: number; y: number }[],
): boolean {
  const seen = new Set<string>();
  for (const b of booths) {
    if (b.x === 0 && b.y === 0) continue;
    seen.add(`${b.x},${b.y}`);
    if (seen.size >= 2) return true;
  }
  return false;
}
