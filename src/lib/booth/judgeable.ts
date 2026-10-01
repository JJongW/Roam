import type { Booth } from "@/lib/types";

/**
 * 이 부스에 취향 판단(JudgmentBar)을 물어봐도 되는가.
 *
 * 편의시설(라운지·카페테리아·센터·화장실 같은 `kind: "facility"`)은 관람 취향과
 * 무관하다 — 피드와 추천은 이미 그렇게 다룬다:
 *   - `feed/exhibition-match.ts` "편의시설(facility)은 관람 취향과 무관하니 뺀다"
 *   - `feed/curate.ts`           `b.kind !== "facility"`
 *   - `engine/service.ts`        "Recommend exhibitors only"
 * 그런데 지도 팝업과 부스 상세는 시설에도 판단 버튼을 띄우고 있었다. 거기서 누른
 * 반응은 브레인에 들어가 취향을 오염시킨다 — 카페에 '끌림'을 눌렀다고 그 사람이
 * 카페 취향인 건 아니다.
 *
 * 지도와 상세가 **같은 술어**를 쓰는 게 이 함수의 존재 이유다. 조건을 두 곳에
 * 복사하면 한쪽만 고쳐져 "지도·상세가 어긋나면 사용자가 두 개의 다른 앱으로
 * 느낀다"(booth-personal-panel 주석, judgment-vocabulary §3-4)가 그대로 재현된다.
 */
export function acceptsJudgment(booth: Pick<Booth, "kind">): boolean {
  return booth.kind !== "facility";
}
