/**
 * UI 24 Q2A-2 "로미가 고른 곳" 미리보기 시트가 열릴 때 지도를 그 칸으로 옮길지.
 *
 * 시트를 처음 열거나 다음 곳으로 넘길 때는 시트 위로 그 칸을 옮긴다(iOS focusPickAbovePreview).
 * 상세에서 뒤로 와 시트를 되살릴 때는 옮기지 않는다. 지도는 상세 가기 전에 보던 그대로다
 * (2026-11-27 Ted "상세에서 돌아오면 보던 그대로", UI 24 Q2A-2의 "1-05처럼 비춘다"보다 나중 결정).
 * `heldId`는 되살린 그 칸이다. 사용자가 다음 곳으로 넘기면 id가 바뀌어 다시 옮긴다.
 */
export function previewMovesCamera(
  previewId: string | undefined,
  sheetHeight: number | null,
  heldId: string | null,
): boolean {
  if (!previewId || !sheetHeight) return false;
  return previewId !== heldId;
}
