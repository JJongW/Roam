// 실시간 판단 큐 — 부스 이벤트/타이밍에서 "사실 + 이유 + 판단 기준"을 만든다.
// 명령("가지 마") 아니라 사실만; 결정은 사용자(companion-reframe §실시간 판단 큐). 순수·LLM 없음.
import type { Booth, BoothEvent } from "@/lib/types";

/** 부스의 주목 이벤트/타이밍에서 판단 큐 한 줄. 없으면 undefined. */
export function deriveCue(
  booth: Booth,
  events: BoothEvent[],
): string | undefined {
  const notable = events
    .filter((e) => !e.standing)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))[0];
  if (notable) {
    const h = new Date(notable.startTime).getHours();
    return `${h}시 ${notable.title} — 그 시간대 붐빌 수 있어, 조용히 보려면 피해서 가도 좋아.`;
  }
  // 혼잡도 팁 → 사실+판단기준(명령 아님). 결정은 사용자.
  const tips = booth.enrichment?.tips ?? "";
  const m = tips.match(/혼잡\s*(최상위|상|중|하)/);
  if (m) {
    const lvl = m[1];
    if (lvl === "최상위" || lvl === "상")
      return "많이 붐비는 부스야 — 여유롭게 보려면 이른/늦은 시간대에.";
    if (lvl === "중") return "적당히 붐빌 수 있어 — 크게 기다리진 않을 거야.";
    return "한산한 편이라 여유롭게 둘러보기 좋아.";
  }
  return booth.enrichment?.timing?.[0] || undefined;
}
