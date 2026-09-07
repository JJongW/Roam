import { boothValueSlugs, valueDef } from "@/lib/values";
import type {
  AnalyticsEvent,
    BoothListItem,
  UserBrain,
} from "@/lib/types";

/**
 * 취향 × 행동 교차 — "어느 취향의 사람이 실제로 어디를 눌렀나".
 *
 * 취향축(user_brain)과 행동축(analytics_event)은 각각 user_id·session_id로 따로
 * 쌓여 왔고, 0042가 analytics_event에 user_id를 넣으면서 비로소 이을 수 있게 됐다.
 * 이 모듈은 그 조인을 앱에서 수행한다(순수 — I/O 없음).
 *
 * 취향의 출처는 브레인이다. 신호에서 여기서 다시 취향을 뽑으면 사용자 자신이
 * 보는 취향(brain-sheet)과 운영자가 보는 취향이 갈라진다 — admin/accounts/[id]가
 * 같은 이유로 brain.interests를 쓴다.
 *
 * 읽는 법: `unmatched`가 붙은 부스는 그 가치 태그가 없는데도 그 취향 사람들이
 * 많이 본 곳이다. 태깅이 빠졌거나(enrichment 갭), 태그가 실제 끌림을 설명하지
 * 못한다는 신호 — 추천 근거를 고칠 지점이다.
 */

/** 브레인 관심 노드를 "이 사람의 취향"으로 셀 최소 confidence. 0에 가까운 잡음
 *  노드까지 세면 거의 모든 사용자가 거의 모든 가치를 가진 것으로 나온다. */
export const TASTE_MIN_CONFIDENCE = 0.2;

export interface TasteBoothRow {
  boothId: string;
  /** 이 취향 사용자들이 이 부스에서 만든 이벤트 수. */
  events: number;
  /** 이 취향 사용자 중 이 부스를 본 사람 수 — events는 한 사람이 부풀릴 수 있다. */
  users: number;
  /** 부스가 이 가치 태그를 실제로 달고 있는가. false면 태깅 갭 후보. */
  tagged: boolean;
}

export interface TasteBehaviorRow {
  slug: string;
  /** 이 취향을 가진 사용자 수(행동 기록 유무와 무관). */
  tasteUsers: number;
  /** 그중 실제 행동 기록이 남은 사용자 수 — 0이면 아래 booths도 비어 있다. */
  activeUsers: number;
  booths: TasteBoothRow[];
}

export interface TasteBehaviorResult {
  rows: TasteBehaviorRow[];
  /** user_id가 없어 어느 취향에도 못 붙인 이벤트 수. 0042 이전에 쌓였거나
   *  비로그인 세션이다 — 크면 아래 수치의 대표성이 그만큼 낮다. */
  unattributed: number;
}

/**
 * @param brains  전체 브레인(크로스-전시 L4). 취향의 출처.
 * @param analytics 이 전시의 분석 이벤트.
 * @param booths  이 전시의 부스 — 가치 태그 대조용.
 */
export function crossTasteBehavior(
  brains: UserBrain[],
  analytics: AnalyticsEvent[],
  booths: BoothListItem[],
  opts?: { minConfidence?: number; topBooths?: number },
): TasteBehaviorResult {
  const minConfidence = opts?.minConfidence ?? TASTE_MIN_CONFIDENCE;
  const topBooths = opts?.topBooths ?? 5;

  // 사용자 → 취향 가치 slug. 8가치 축만 — 브레인 관심에는 분야 slug 노드도 섞여
  // 있는데(valueTags 없는 부스는 booth.tags로 쌓인다) 그건 취향 축이 아니다.
  const tasteByUser = new Map<string, string[]>();
  const tasteUsers = new Map<string, number>();
  for (const brain of brains) {
    const slugs = brain.interests
      .filter((n) => valueDef(n.key) && n.confidence >= minConfidence)
      .map((n) => n.key);
    if (slugs.length === 0) continue;
    tasteByUser.set(brain.userId, slugs);
    for (const slug of slugs)
      tasteUsers.set(slug, (tasteUsers.get(slug) ?? 0) + 1);
  }

  const boothTags = new Map(
    booths.map((b) => [b.id, new Set(boothValueSlugs(b))]),
  );

  // slug → boothId → {events, 본 사람들}
  const bySlug = new Map<string, Map<string, { events: number; users: Set<string> }>>();
  const activeUsers = new Map<string, Set<string>>();
  let unattributed = 0;

  for (const a of analytics) {
    if (!a.userId) {
      unattributed += 1;
      continue;
    }
    const slugs = tasteByUser.get(a.userId);
    if (!slugs) continue;
    for (const slug of slugs) {
      const active = activeUsers.get(slug) ?? new Set<string>();
      active.add(a.userId);
      activeUsers.set(slug, active);

      if (!a.boothId) continue;
      const booths = bySlug.get(slug) ?? new Map();
      const cell = booths.get(a.boothId) ?? { events: 0, users: new Set() };
      cell.events += 1;
      cell.users.add(a.userId);
      booths.set(a.boothId, cell);
      bySlug.set(slug, booths);
    }
  }

  const rows: TasteBehaviorRow[] = [...tasteUsers.entries()]
    .map(([slug, count]) => ({
      slug,
      tasteUsers: count,
      activeUsers: activeUsers.get(slug)?.size ?? 0,
      booths: [...(bySlug.get(slug) ?? new Map()).entries()]
        .map(([boothId, cell]) => ({
          boothId,
          events: cell.events,
          users: cell.users.size,
          tagged: boothTags.get(boothId)?.has(slug) ?? false,
        }))
        .sort((a, b) => b.events - a.events || a.boothId.localeCompare(b.boothId))
        .slice(0, topBooths),
    }))
    .sort((a, b) => b.tasteUsers - a.tasteUsers || a.slug.localeCompare(b.slug));

  return { rows, unattributed };
}
