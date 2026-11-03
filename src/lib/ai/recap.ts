// 회고 서술의 순수 부분(fallback 문구 + 프롬프트). server-only 없음 → 테스트 가능.
import type { VisitDigest } from "@/lib/types";

/** LLM 없거나 실패 시 결정론 폴백 서술. summary는 테마 라벨(한글)을 담아 slug 노출 안 함. */
export function fallbackNarrative(digest: VisitDigest): string {
  return `${digest.summary}. 오늘도 충분히 즐기신 하루였길 바라요. 다음엔 취향을 더 잘 챙겨 볼게요.`;
}

/** Companion 회고 프롬프트. 성취·숫자 자랑 금지 → "충분히 즐겼다" 감각(peak-end). */
export function buildRecapPrompt(
  digest: VisitDigest,
  exhibitionName?: string,
): string {
  const themes = digest.themesEngaged.slice(0, 4).join(", ");
  return [
    "너는 박람회 관람을 함께한 따뜻한 안내자야. 사용자의 오늘 관람을 2~3문장으로 돌아봐줘.",
    "규칙: 성취와 숫자 자랑 금지. '충분히 즐겼다'는 감각을 남기고 다음을 기약해. 해요체 존댓말로(합니다체와 섞지 말 것), 사용자를 '너'나 '당신'으로 부르지 말고 주어를 빼서, 담백하게. '전시'라는 말과 가운뎃점(·)은 쓰지 마. 방문만으로 좋아했다고 쓰지 말 것(좋았다는 건 사용자가 직접 남긴 평가가 있을 때만).",
    exhibitionName ? `행사: ${exhibitionName}` : "",
    `방문 부스 수: ${digest.boothsVisited.length}`,
    themes ? `주로 본 테마: ${themes}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}
