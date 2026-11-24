// 부스 하트가 브랜드 하트를 따라 맞춘다(UI 23, 2026-11-24 Ted 결정, docs/decisions/2026-11-24_부스-하트가-브랜드도.md).
//
// 부스 상세의 하트는 하나다. 부스에 하트를 남기면 그 부스를 낸 브랜드(대표 배정, booth_participant role=primary)에도
// 하트를 남긴 것으로 본다. 다음 박람회 참가 알림(브랜드 알림)은 이 브랜드 하트에서 나온다.
//
// - 남기기: 브랜드 하트가 없으면 source='booth'로 만든다. 이미 있으면(직접이든 다른 부스든) 그대로 둔다.
// - 빼기: 그 브랜드의 다른 부스 하트가 남아 있으면 둔다. 없으면 source='booth' 줄만 지운다.
//   사용자가 브랜드에 직접 남긴 하트(source='direct')는 부스 하트를 빼도 지우지 않는다.
// - 웹과 iOS 모두 PUT /api/me/notes/[boothId] 한 곳에서 부른다. 클라이언트가 브랜드 하트 API를 따로 부를 필요가 없다.
import type { Repository } from "@/lib/repositories/types";
import { heartOf } from "@/lib/notes/apply";

export type BrandFollowResult =
  | { kind: "none" } // 대표 브랜드가 없는 부스
  | { kind: "added"; exhibitorId: string }
  | { kind: "kept"; exhibitorId: string; reason: "other_booth_hearted" }
  | { kind: "removed"; exhibitorId: string; removed: boolean };

export async function followBrandForBoothHeart(
  repo: Repository,
  userId: string,
  boothId: string,
  hearted: boolean,
): Promise<BrandFollowResult> {
  const links = await repo.listPrimaryBrandLinks([boothId]);
  const exhibitorId = links[boothId]?.exhibitorId;
  if (!exhibitorId) return { kind: "none" };

  if (hearted) {
    await repo.addBrandHeart(userId, exhibitorId, "booth");
    return { kind: "added", exhibitorId };
  }

  // 같은 브랜드의 다른 부스(다른 박람회 포함)에 하트가 남아 있으면 브랜드 하트도 남긴다.
  const others = (await repo.listNotes(userId))
    .filter((n) => n.boothId !== boothId && heartOf(n))
    .map((n) => n.boothId);
  if (others.length > 0) {
    const otherLinks = await repo.listPrimaryBrandLinks(others);
    if (others.some((id) => otherLinks[id]?.exhibitorId === exhibitorId)) {
      return { kind: "kept", exhibitorId, reason: "other_booth_hearted" };
    }
  }
  const removed = await repo.removeBrandHeart(userId, exhibitorId, { onlySource: "booth" });
  return { kind: "removed", exhibitorId, removed };
}

/**
 * 이미 남은 부스 하트로 브랜드 하트 채우기 계획(순수, scripts/brand-heart-backfill.ts).
 * UI 23 전에 남긴 부스 하트는 브랜드 하트를 만들지 않았다. 하트인 부스의 대표 브랜드마다
 * (사용자, 브랜드) 줄이 없으면 source='booth'로 넣는다. 이미 있는 줄(직접이든 아니든)은 건드리지 않는다.
 */
export function planBrandHeartBackfill(input: {
  /** 하트인 부스 노트(user, booth). 하트 판정은 호출부가 heartOf로 한다. */
  heartedNotes: { userId: string; boothId: string }[];
  links: Record<string, { exhibitorId: string }>;
  existing: { userId: string; exhibitorId: string }[];
}): { userId: string; exhibitorId: string; boothIds: string[] }[] {
  const have = new Set(input.existing.map((h) => `${h.userId}\u0000${h.exhibitorId}`));
  const out = new Map<string, { userId: string; exhibitorId: string; boothIds: string[] }>();
  for (const n of input.heartedNotes) {
    const exhibitorId = input.links[n.boothId]?.exhibitorId;
    if (!exhibitorId) continue;
    const key = `${n.userId}\u0000${exhibitorId}`;
    if (have.has(key)) continue;
    const row = out.get(key) ?? { userId: n.userId, exhibitorId, boothIds: [] };
    row.boothIds.push(n.boothId);
    out.set(key, row);
  }
  return [...out.values()];
}

/**
 * 브랜드 하트를 빼면 그 브랜드의 부스 하트도 같이 뺀다(2026-11-24 Ted, 마이 브랜드 목록 14-10).
 * "마이 브랜드 목록에서 하트를 빼면 부스 하트도 같이"(docs/decisions/2026-11-24_부스-상세-하트-하나.md 덧붙임 2).
 *
 * - 기준은 부스 하트 → 브랜드 하트와 같다: 부스의 대표 브랜드(booth_participant role=primary). 공동 입점은 아니다.
 * - 다른 박람회 부스도 끈다. 하트만 끈다 — 메모, 다녀왔어요, 평가, 사진은 그대로 둔다.
 * - 하트를 끈 쓰기는 브랜드 따라가기(followBrandForBoothHeart)를 부르지 않는다. 브랜드 하트는 호출부가 바로 지운다.
 * 돌려주는 값: 끈 부스 id(하트였던 것만). 없으면 빈 배열.
 */
export async function unheartBoothsOfBrand(
  repo: Repository,
  userId: string,
  exhibitorId: string,
): Promise<string[]> {
  const hearted = (await repo.listNotes(userId)).filter((n) => heartOf(n)).map((n) => n.boothId);
  if (hearted.length === 0) return [];
  const links = await repo.listPrimaryBrandLinks(hearted);
  const mine = hearted.filter((id) => links[id]?.exhibitorId === exhibitorId);
  for (const boothId of mine) {
    // 하트를 끄면 판정 등급도 지운다(PUT /api/me/notes의 하트 해제와 같은 규칙).
    await repo.upsertNote(userId, boothId, { heart: false }, null);
  }
  return mine;
}
