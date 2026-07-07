// L4 메모리 — 원장 신호 → 증류(브레인 갱신). 순수·결정론, LLM 없음.
// 증류본(UserBrain) ≠ 원장(UserSignal[]). 관심은 category slug 단위로 집계.
import { MEMORY_TUNING } from "@/lib/constants";
import type {
  InterestNode,
  UserBrain,
  UserSignal,
  VisitDigest,
} from "@/lib/types";
import { computeConfidence, trendOf } from "./confidence";

export interface DistillTuning {
  halfLifeDays: number;
  K: number;
  thetaHi: number;
  thetaLo: number;
  topN: number;
}

export function emptyBrain(
  userId: string,
  nowIso = new Date().toISOString(),
): UserBrain {
  return {
    userId,
    version: 0,
    updatedAt: nowIso,
    literacy: { overall: 0, byTheme: {}, visitsCount: 0, boothsSeenCount: 0 },
    interests: [],
    preferences: {},
    goals: [],
    visits: [],
    health: {
      lastDistilledAt: nowIso,
      decayHalfLifeDays: MEMORY_TUNING.halfLifeDays,
    },
  };
}

/** 신호를 slug별로 묶어 InterestNode[]로 증류. confidence>0만, 상위 topN 유지. */
export function distillInterests(
  signals: UserSignal[],
  nowMs: number,
  tuning: DistillTuning,
  labels: Record<string, string> = {},
): InterestNode[] {
  const bySlug = new Map<string, UserSignal[]>();
  for (const sig of signals) {
    for (const slug of sig.slugs) {
      const arr = bySlug.get(slug);
      if (arr) arr.push(sig);
      else bySlug.set(slug, [sig]);
    }
  }

  const nodes: InterestNode[] = [];
  for (const [slug, slugSignals] of bySlug) {
    const { confidence, signals: counts } = computeConfidence(
      slugSignals,
      nowMs,
      tuning,
    );
    if (confidence <= 0) continue; // skip-only slug 등 가지치기
    const times = slugSignals.map((s) => Date.parse(s.createdAt));
    nodes.push({
      key: slug,
      label: labels[slug] ?? slug,
      confidence,
      signals: counts,
      firstSeenAt: new Date(Math.min(...times)).toISOString(),
      lastSeenAt: new Date(Math.max(...times)).toISOString(),
      trend: trendOf(slugSignals, nowMs, tuning.halfLifeDays),
    });
  }

  nodes.sort((a, b) => b.confidence - a.confidence);
  return nodes.slice(0, tuning.topN);
}

/**
 * 전체 신호 로그로 브레인 재증류. per-user 로그는 작아 매번 전체 재계산해도 싸다
 * (증분 최적화는 이후). literacy는 승격(θhi 이상) 관심에서 파생.
 */
export function updateBrainWithSignals(
  brain: UserBrain,
  allSignals: UserSignal[],
  nowMs: number,
  tuning: DistillTuning = MEMORY_TUNING,
  labels: Record<string, string> = {},
): UserBrain {
  const interests = distillInterests(allSignals, nowMs, tuning, labels);

  const byTheme: Record<string, number> = {};
  for (const node of interests) {
    if (node.confidence >= tuning.thetaHi) byTheme[node.key] = node.confidence; // 승격
  }
  const themeVals = Object.values(byTheme);
  const overall = themeVals.length
    ? themeVals.reduce((a, b) => a + b, 0) / themeVals.length
    : 0;

  const seenBooths = new Set<string>();
  for (const s of allSignals) {
    if (s.boothCode && s.kind !== "booth_skipped") seenBooths.add(s.boothCode);
  }

  const nowIso = new Date(nowMs).toISOString();
  return {
    ...brain,
    version: brain.version + 1,
    updatedAt: nowIso,
    interests,
    literacy: {
      overall,
      byTheme,
      // 완료 관람 수는 Reflection이 소유(brain.visits). 신호 증류는 안 건드림.
      visitsCount: brain.visits.length,
      boothsSeenCount: seenBooths.size,
    },
    health: { lastDistilledAt: nowIso, decayHalfLifeDays: tuning.halfLifeDays },
  };
}

/** 관람 종료 회고 = L3 에피소드 → VisitDigest 증류. 순수. */
export function buildVisitDigest(input: {
  exhibitionId: string;
  visitId: string;
  boothCodes: string[];
  boothTagLists: string[][];
  nowMs: number;
  labels?: Record<string, string>;
}): VisitDigest {
  const labels = input.labels ?? {};
  const count = new Map<string, number>();
  for (const tags of input.boothTagLists) {
    for (const t of tags) count.set(t, (count.get(t) ?? 0) + 1);
  }
  const themesEngaged = [...count.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug);

  const top = themesEngaged[0];
  const topLabel = top ? (labels[top] ?? top) : null;
  const n = input.boothCodes.length;
  const summary = topLabel
    ? `${n}개 부스 관람 · 주로 ${topLabel}`
    : `${n}개 부스 관람`;

  return {
    exhibitionId: input.exhibitionId,
    visitId: input.visitId,
    date: new Date(input.nowMs).toISOString(),
    boothsVisited: input.boothCodes,
    themesEngaged,
    highlights: [], // 자발 메모·사진 + 자동 순간 합성은 이후 슬라이스
    summary,
  };
}

/** VisitDigest를 브레인에 접기(visitId 기준 upsert). visitsCount = 완료 관람 수. */
export function addVisitDigest(
  brain: UserBrain,
  digest: VisitDigest,
  nowMs: number,
): UserBrain {
  const visits = [
    ...brain.visits.filter((v) => v.visitId !== digest.visitId),
    digest,
  ];
  return {
    ...brain,
    version: brain.version + 1,
    updatedAt: new Date(nowMs).toISOString(),
    visits,
    literacy: { ...brain.literacy, visitsCount: visits.length },
  };
}
