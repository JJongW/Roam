// 오래 쉰 뒤 홈(UI 18-06B, 2026-11-19 Ted 4-B)이 읽는 "좋았던 브랜드가 다음 박람회에 나와요".
// 브랜드 규칙 §4: 다녀왔다는 사실만으로 좋아한다고 보지 않는다. 그래서 근거는 사용자가 직접 남긴
// 두 가지뿐이다 — 부스 평가 "좋았어요"(verdict good)와 브랜드 하트. 다녀왔어요, 부스 하트, 반응 없음은 쓰지 않는다.
// 참가는 브랜드 단위(exhibition_participant)로 본다. 부스 배정이 아직 없는 참가도 나온다(2026-11-17 결정).
// "쓰신 말"(회고 글)은 기기에만 있어서(2026-11-17 결정) 여기서 주지 않는다.
import type { Repository } from "@/lib/repositories/types";
import type { UpcomingParticipation } from "@/lib/types";
import { kstToday } from "./hearts";

export type ReentryReason = "verdict_good" | "brand_heart";

export interface ReentryBrand {
  exhibitorId: string;
  name: string;
  /** 왜 이 브랜드인지. 둘 다일 수 있다. 화면은 이유로 거른다(18-06B 카드는 verdict_good만). */
  reasons: ReentryReason[];
  /** 지금 브랜드 하트가 남아 있는지(카드의 하트 버튼 처음 상태). */
  hearted: boolean;
  /** 좋았어요를 남긴 박람회. 가장 최근 것 하나. verdict_good이 없으면 없다. */
  likedAt?: { slug: string; name: string; at: string };
  /** 가장 먼저 열리는 다음 참가. 좋았어요를 남긴 그 박람회는 뺀다. */
  next: UpcomingParticipation;
}

export interface ReentryView {
  today: string;
  brands: ReentryBrand[];
}

export async function reentryView(repo: Repository, userId: string, today = kstToday()): Promise<ReentryView> {
  const [notes, hearts] = await Promise.all([repo.listNotesWithContext(userId), repo.listBrandHearts(userId)]);

  const liked = new Map<string, { name: string; fairIds: Set<string>; latest?: { slug: string; name: string; at: string } }>();
  for (const n of notes) {
    if (n.verdict !== "good" || !n.brand) continue;
    const cur = liked.get(n.brand.exhibitorId) ?? { name: n.brand.name, fairIds: new Set<string>() };
    if (n.exhibition) {
      cur.fairIds.add(n.exhibition.id);
      const at = n.verdictAt ?? n.updatedAt;
      if (!cur.latest || at > cur.latest.at) cur.latest = { slug: n.exhibition.slug, name: n.exhibition.name, at };
    }
    liked.set(n.brand.exhibitorId, cur);
  }
  const hearted = new Set(hearts.map((h) => h.exhibitorId));

  const ids = [...new Set([...liked.keys(), ...hearted])];
  if (ids.length === 0) return { today, brands: [] };
  const [names, upcoming] = await Promise.all([
    repo.getExhibitorNames(ids),
    repo.listUpcomingParticipations(ids, today),
  ]);

  const brands: ReentryBrand[] = [];
  for (const id of ids) {
    const l = liked.get(id);
    const next = upcoming
      .filter((u) => u.exhibitorId === id && !l?.fairIds.has(u.exhibition.id))
      .sort((a, b) => a.exhibition.startDate.localeCompare(b.exhibition.startDate))[0];
    if (!next) continue;
    const reasons: ReentryReason[] = [];
    if (l) reasons.push("verdict_good");
    if (hearted.has(id)) reasons.push("brand_heart");
    const name = names[id] || l?.name || "";
    if (!name) continue;
    brands.push({
      exhibitorId: id,
      name,
      reasons,
      hearted: hearted.has(id),
      ...(l?.latest ? { likedAt: l.latest } : {}),
      next,
    });
  }
  brands.sort(
    (a, b) => a.next.exhibition.startDate.localeCompare(b.next.exhibition.startDate) || a.name.localeCompare(b.name, "ko"),
  );
  return { today, brands };
}
