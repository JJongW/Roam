import type { AnalyticsEvent } from "@/lib/types";

export interface FlowEdge {
  from: string;
  to: string;
  count: number;
}

/** 한 번의 관람 흐름으로 볼 최대 이벤트 간격. 세션 쿠키는 30일, 계정은 그보다도
 *  오래 가므로 같은 사람이라도 며칠 뒤 재방문이 섞인다 — 시간으로 한 번 더 자른다. */
const MAX_GAP_MS = 30 * 60 * 1000;

/**
 * 한 사람이 부스 상세를 연달아 본 흐름(근사). booth_arrive 발화가 없어서
 * (동선 제품 제거) 유일하게 살아있는 view를 시간순으로 이어 만든다.
 *
 * "한 사람"의 기준은 user_id가 있으면 user_id, 없으면 session_id다. 0042 이후
 * 로그인 상태의 이벤트에는 user_id가 붙는다 — 세션만 보면 같은 사람이 기기를
 * 바꾸거나 쿠키가 갈리는 순간 동선이 그냥 끊겼다. 계정 병합(0046)까지 생긴
 * 마당에 세션은 더 이상 사람의 단위가 아니다.
 *
 * ponytail: 한 사람이 두 기기를 동시에 쓰면 이벤트가 뒤섞여 없던 엣지가 생긴다.
 * 현장에서 1인 1기기가 압도적이라 그대로 둔다 — 기기까지 가르려면 이벤트에
 * device 식별자를 실어야 한다.
 */
export function computeFlowEdges(events: AnalyticsEvent[]): FlowEdge[] {
  const walker = (a: AnalyticsEvent) => a.userId ?? a.sessionId;
  const an = events
    .filter((a) => a.type === "view" && a.boothId)
    .sort(
      (a, b) =>
        walker(a).localeCompare(walker(b)) ||
        a.createdAt.localeCompare(b.createdAt),
    );

  const edges = new Map<string, number>();
  for (let i = 1; i < an.length; i++) {
    if (walker(an[i]) !== walker(an[i - 1])) continue;
    if (an[i].boothId === an[i - 1].boothId) continue;
    const gap =
      new Date(an[i].createdAt).getTime() -
      new Date(an[i - 1].createdAt).getTime();
    if (gap > MAX_GAP_MS) continue;
    const key = `${an[i - 1].boothId}→${an[i].boothId}`;
    edges.set(key, (edges.get(key) ?? 0) + 1);
  }
  return [...edges.entries()].map(([k, count]) => {
    const [from, to] = k.split("→");
    return { from, to, count };
  });
}
