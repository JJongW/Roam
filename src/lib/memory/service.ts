// L4 메모리 — I/O 래퍼(Memory Agent 진입점). 순수 엔진(confidence·distill)을
// 레포와 이어붙인다. 신호 append → 전체 재증류 → 브레인 저장. LLM 없음.
import "server-only";
import { narrateVisit } from "@/lib/ai/companion";
import { MEMORY_TUNING } from "@/lib/constants";
import { getRepository } from "@/lib/repositories";
import { VALUE_TAGS, boothValueSlugs } from "@/lib/values";
import type { Booth, SignalKind, UserBrain, VisitDigest } from "@/lib/types";
import {
  addVisitDigest,
  buildVisitDigest,
  emptyBrain,
  updateBrainWithSignals,
} from "./distill";
import { classifyBooth, type JudgedClass } from "./taste";

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

export interface SetValueMutedResult {
  brain: UserBrain;
  /**
   * 뮤트를 풀었는데 되살아난 confidence가 0인가 — 호출부(브레인 시트)가 명시 긍정
   * 신호를 하나 시드해야 하는지의 답이다. 클라이언트는 이걸 스스로 판단할 수 없다:
   * 뮤트된 가치는 애초에 interests에서 빠져서 내려가므로 화면 값은 언제나 0이고,
   * "쌓인 게 있는데도 또 시드"가 매 토글마다 조용히 confidence를 올려버린다.
   */
  needsSeed: boolean;
}

/**
 * 가치 하나를 끄거나 켠다. 멱등 — 같은 요청을 반복해도 목록이 중복되지 않는다.
 *
 * 신호 원장은 건드리지 않는다. 끄는 것은 과거 행동의 부정이 아니라 현재 상태
 * 선언이므로, 풀면 그동안 쌓인 confidence가 그대로 돌아온다(distill.ts).
 */
export async function setValueMuted(
  userId: string,
  slug: string,
  muted: boolean,
): Promise<SetValueMutedResult> {
  const repo = await getRepository();
  const brain = await readBrain(userId);
  const current = new Set(brain.mutedSlugs ?? []);
  if (muted) current.add(slug);
  else current.delete(slug);

  // 뮤트가 바뀌면 interests를 다시 걸러야 하므로 재증류한다 — 목록만 갈아끼우면
  // 방금 끈 가치가 interests에 그대로 남는다.
  const signals = await repo.listUserSignals(userId);
  // labels 기본값({})을 그대로 두면 모든 interest 노드의 label이 raw slug로
  // 덮여쓰인다(distillInterests가 labels[slug] ?? slug로 채움) — 이 가치 하나만
  // 바뀌어도 무관한 노드까지 라벨이 깨진다. 관심 축은 8가치만이 아니다:
  // valueTags 없는 부스는 booth.tags(분야 slug)로 쌓이므로(boothValueSlugs)
  // 분야 키 노드도 섞여 있다. 뮤트는 크로스-전시라 exhibitionId가 없어
  // recordSignal처럼 listCategories로 분야 라벨을 새로 못 읽는다 → 브레인에 이미
  // 적혀 있는 라벨을 그대로 물려주고, 그 위에 8가치를 덮는다(방금 켠 가치는
  // interests에 없을 수 있어 VALUE_TAGS가 있어야 라벨이 산다).
  const existingLabels = Object.fromEntries(
    (brain.interests ?? []).map((n) => [n.key, n.label]),
  );
  const labels = {
    ...existingLabels,
    ...Object.fromEntries(VALUE_TAGS.map((v) => [v.slug, v.label])),
  };
  const next = updateBrainWithSignals(
    { ...brain, mutedSlugs: [...current] },
    signals,
    Date.now(),
    MEMORY_TUNING,
    labels,
  );
  await repo.saveUserBrain(next);

  // 재증류가 끝난 뒤에 봐야 진실이다 — 뮤트 해제로 실제로 무엇이 되살아났는지는
  // 필터를 다시 통과시켜 봐야 안다.
  const restored = next.interests.find((n) => n.key === slug);
  return {
    brain: next,
    needsSeed: !muted && (restored?.confidence ?? 0) === 0,
  };
}

/**
 * 명시적으로 고른 가치는 뮤트 여부와 무관하게 항상 살아있어야 한다 — 사용자가
 * 직접 다시 고른다는 건 "이건 내 취향이다"라는 재선언이다. recordSignal 호출
 * 전에 뮤트를 먼저 풀어야, 뒤이은 재증류가 방금 기록한 신호를 도로 걸러내지
 * 않는다(안 그러면 온보딩에서 굿즈를 다시 골라도 아무 일도 안 일어난다).
 *
 * recordSignal 자체에 넣지 않는 이유: 그건 부스 방문·스킵까지 태우는 범용 통로라,
 * 어쩌다 뮤트한 가치와 겹치는 부스를 하나 봤다고 뮤트가 풀리면 안 된다. 이 동작은
 * "가치를 직접 고르는" 입구에만 속한다.
 */
export async function clearMutedSlugs(
  userId: string,
  slugs: string[],
): Promise<void> {
  const repo = await getRepository();
  const brain = await readBrain(userId);
  const muted = new Set(brain.mutedSlugs ?? []);
  let changed = false;
  for (const s of slugs) if (muted.delete(s)) changed = true;
  if (!changed) return;
  await repo.saveUserBrain({ ...brain, mutedSlugs: [...muted] });
}

/** 이 부스가 지금 사용자의 확신 가치와 겹치는지 — 반응 판정 등급에 쓴다. */
export async function classifyForUser(
  booth: Booth,
  userId: string,
): Promise<JudgedClass> {
  const brain = await readBrain(userId);
  return classifyBooth(booth, brain);
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
