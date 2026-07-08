// L4 메모리 — I/O 래퍼(Memory Agent 진입점). 순수 엔진(confidence·distill)을
// 레포와 이어붙인다. 신호 append → 전체 재증류 → 브레인 저장. LLM 없음.
import "server-only";
import { narrateVisit } from "@/lib/ai/companion";
import { MEMORY_TUNING } from "@/lib/constants";
import { getRepository } from "@/lib/repositories";
import { VALUE_TAGS, boothValueSlugs } from "@/lib/values";
import type { SignalKind, UserBrain, VisitDigest } from "@/lib/types";
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

/** 회고 재료가 되는 신호 — 실제로 보거나 끌린 것만(스킵/단순클릭 제외). */
const REFLECT_KINDS: ReadonlySet<SignalKind> = new Set<SignalKind>([
  "booth_visited",
  "reaction_interested",
  "reaction_later",
  "booth_bookmarked",
]);

/**
 * 신호 기반 회고(동선 비의존). 동선 제거로 route가 없어져 reflectOnVisit을 대체 —
 * 최근 이 전시의 방문/반응 신호를 모아 부스별로 접고 VisitDigest를 만들어 브레인에
 * 접는다(Reflection Agent, 결정론·LLM 무). 회고 재료 없으면 no-op → RecapSheet는
 * 기존 최신 회고를 보여준다. companion-reframe Phase A 회고 정책.
 */
export async function reflectFromSignals(
  userId: string,
  exhibitionId: string,
): Promise<VisitDigest | null> {
  const repo = await getRepository();
  const signals = await repo.listUserSignals(userId, { exhibitionId });

  // 부스(코드)별로 접기 — 같은 부스 여러 신호는 한 번만. slug는 합집합.
  const byBooth = new Map<string, Set<string>>();
  for (const s of signals) {
    if (!REFLECT_KINDS.has(s.kind) || !s.boothCode) continue;
    const set = byBooth.get(s.boothCode) ?? new Set<string>();
    for (const slug of s.slugs) set.add(slug);
    byBooth.set(s.boothCode, set);
  }
  if (byBooth.size === 0) return null;

  const boothCodes = [...byBooth.keys()];
  const boothTagLists = boothCodes.map((c) => [...(byBooth.get(c) ?? [])]);

  const labels: Record<string, string> = {};
  for (const c of await repo.listCategories(exhibitionId))
    labels[c.slug] = c.name;
  for (const v of VALUE_TAGS) labels[v.slug] = v.label;

  const nowMs = Date.now();
  // visitId = 전시+시각 — 신호 기반 세션 1건.
  const digest = buildVisitDigest({
    exhibitionId,
    visitId: `sig-${exhibitionId}-${nowMs}`,
    boothCodes,
    boothTagLists,
    nowMs,
    labels,
  });

  const brain =
    (await repo.getUserBrain(userId)) ??
    emptyBrain(userId, new Date(nowMs).toISOString());
  await repo.saveUserBrain(addVisitDigest(brain, digest, nowMs));
  return digest;
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
