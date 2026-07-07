// L4 메모리 — I/O 래퍼(Memory Agent 진입점). 순수 엔진(confidence·distill)을
// 레포와 이어붙인다. 신호 append → 전체 재증류 → 브레인 저장. LLM 없음.
import "server-only";
import { narrateVisit } from "@/lib/ai/companion";
import { MEMORY_TUNING } from "@/lib/constants";
import { getRepository } from "@/lib/repositories";
import { VALUE_TAGS, boothValueSlugs } from "@/lib/values";
import type {
  Booth,
  RoutePlan,
  SignalKind,
  UserBrain,
  VisitDigest,
} from "@/lib/types";
import {
  addVisitDigest,
  buildVisitDigest,
  emptyBrain,
  updateBrainWithSignals,
} from "./distill";

export interface RecordSignalInput {
  kind: SignalKind;
  /** 신호를 유발한 부스 id — tags(category slug)·exhibition·code를 해석한다. */
  boothId?: string;
  /** boothId 없을 때 직접 지정. */
  exhibitionId?: string;
  slugs?: string[];
}

/** 사용자 행동 신호 기록 + 브레인 재증류. 태그 없으면 무시(no-op). */
export async function recordSignal(
  userId: string,
  input: RecordSignalInput,
): Promise<void> {
  const repo = await getRepository();

  let slugs = input.slugs ?? [];
  let exhibitionId = input.exhibitionId;
  let boothCode: string | undefined;

  if (input.boothId) {
    const detail = await repo.getBoothDetail(input.boothId);
    if (detail) {
      boothCode = detail.booth.code;
      exhibitionId = exhibitionId ?? detail.booth.exhibitionId;
      // 관심 축 = 가치 slug(valueTags). 없으면 분야 tags 폴백.
      if (!input.slugs) slugs = boothValueSlugs(detail.booth);
    }
  }

  // 태그 없는 시설 부스 등은 관심 신호로 남길 게 없다.
  if (!exhibitionId || slugs.length === 0) return;

  await repo.appendUserSignal({
    userId,
    exhibitionId,
    kind: input.kind,
    boothCode,
    slugs,
  });

  const nowMs = Date.now();
  const brain =
    (await repo.getUserBrain(userId)) ??
    emptyBrain(userId, new Date(nowMs).toISOString());
  const all = await repo.listUserSignals(userId);

  // slug → 라벨 (InterestNode.label). 가치·분야 둘 다 병합해 어느 축이든 해석.
  const labels: Record<string, string> = {};
  for (const c of await repo.listCategories(exhibitionId))
    labels[c.slug] = c.name;
  for (const v of VALUE_TAGS) labels[v.slug] = v.label;

  const updated = updateBrainWithSignals(
    brain,
    all,
    nowMs,
    MEMORY_TUNING,
    labels,
  );
  await repo.saveUserBrain(updated);
}

/** 종단 브레인 조회. 없으면 빈 브레인. */
export async function readBrain(userId: string): Promise<UserBrain> {
  const repo = await getRepository();
  return (await repo.getUserBrain(userId)) ?? emptyBrain(userId);
}

/**
 * 관람 종료 회고 = L3 에피소드 → L4 증류쓰기(Reflection Agent). 결정론, LLM 없음.
 * 완료된 route로 VisitDigest를 만들어 브레인 visits에 접는다. visitId = routeId.
 */
export async function reflectOnVisit(
  userId: string,
  route: RoutePlan,
): Promise<void> {
  const repo = await getRepository();

  // 실제 방문 부스 우선, 없으면 계획 부스로 폴백.
  const boothIds =
    route.visitedBoothIds.length > 0 ? route.visitedBoothIds : route.boothIds;
  if (boothIds.length === 0) return;

  const booths = await repo.listBoothsByExhibitionId(route.exhibitionId);
  const byId = new Map(booths.map((b): [string, Booth] => [b.id, b]));
  const boothCodes: string[] = [];
  const boothTagLists: string[][] = [];
  for (const id of boothIds) {
    const b = byId.get(id);
    if (!b) continue;
    boothCodes.push(b.code ?? b.id);
    boothTagLists.push(boothValueSlugs(b)); // 가치 축(없으면 분야 폴백)
  }
  if (boothCodes.length === 0) return;

  const labels: Record<string, string> = {};
  for (const c of await repo.listCategories(route.exhibitionId)) {
    labels[c.slug] = c.name;
  }
  for (const v of VALUE_TAGS) labels[v.slug] = v.label;

  const nowMs = Date.now();
  const digest = buildVisitDigest({
    exhibitionId: route.exhibitionId,
    visitId: route.id,
    boothCodes,
    boothTagLists,
    nowMs,
    labels,
  });

  const brain =
    (await repo.getUserBrain(userId)) ??
    emptyBrain(userId, new Date(nowMs).toISOString());
  await repo.saveUserBrain(addVisitDigest(brain, digest, nowMs));
}

/**
 * 최근 관람의 회고 서술을 반환. 없으면 Companion(LLM)이 생성해 캐시(1회만).
 * 종료 시점이 아니라 조회 시점 생성 — 관람 종료 액션을 스냅하게 유지.
 */
export async function ensureLatestRecap(
  userId: string,
): Promise<VisitDigest | null> {
  const repo = await getRepository();
  const brain = await repo.getUserBrain(userId);
  if (!brain || brain.visits.length === 0) return null;

  const latest = brain.visits[brain.visits.length - 1];
  if (latest.narrative) return latest; // 캐시 히트

  const narrated: VisitDigest = {
    ...latest,
    narrative: await narrateVisit(latest),
  };
  await repo.saveUserBrain(addVisitDigest(brain, narrated, Date.now()));
  return narrated;
}
