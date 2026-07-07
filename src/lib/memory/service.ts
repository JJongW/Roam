// L4 메모리 — I/O 래퍼(Memory Agent 진입점). 순수 엔진(confidence·distill)을
// 레포와 이어붙인다. 신호 append → 전체 재증류 → 브레인 저장. LLM 없음.
import "server-only";
import { MEMORY_TUNING } from "@/lib/constants";
import { getRepository } from "@/lib/repositories";
import type { Booth, RoutePlan, SignalKind, UserBrain } from "@/lib/types";
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
      if (!input.slugs) slugs = detail.booth.tags;
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

  // slug → 카테고리명 라벨 (InterestNode.label). 없으면 slug 폴백.
  const labels: Record<string, string> = {};
  for (const c of await repo.listCategories(exhibitionId))
    labels[c.slug] = c.name;

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
    boothTagLists.push(b.tags);
  }
  if (boothCodes.length === 0) return;

  const labels: Record<string, string> = {};
  for (const c of await repo.listCategories(route.exhibitionId)) {
    labels[c.slug] = c.name;
  }

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
