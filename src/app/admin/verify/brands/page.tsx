import Link from "next/link";
import { getRepository } from "@/lib/repositories";
import { BrandLinkQueue, type BrandLinkRow, type BrandSide } from "@/components/admin/brand-link-queue";
import type { Booth } from "@/lib/types";

/**
 * 같은 브랜드인가요? — 이름만 같아서 자동으로 합치지 않은 참가사 쌍을 사람이 고른다.
 *
 * 인스타 계정·웹 도메인이 겹치면 이미 자동으로 묶였다. 여기 오는 건 이름만 같은 것뿐이다.
 * 이름이 같아도 다른 법인일 수 있어서(0040 원칙) 두 회차의 부스를 나란히 놓고 판단한다.
 * 초안 검수와 섞지 않는다(사용자 결정 2026-10-02).
 */
export default async function BrandLinkPage() {
  const repo = await getRepository();
  const [pending, graph, exhibitions] = await Promise.all([
    repo.listExhibitorLinkCandidates("pending"),
    repo.loadExhibitorGraph(),
    repo.listExhibitions({ limit: 200 }),
  ]);
  const exName = new Map(exhibitions.data.map((e) => [e.id, e.name]));
  const booths = new Map<string, Booth>();
  for (const e of exhibitions.data) for (const b of await repo.listBoothsFull(e.id)) booths.set(b.id, b);
  const displayOf = new Map(graph.participants.map((p) => [p.id, p]));

  const side = (b: Booth | undefined, displayName?: string): BrandSide | null =>
    b
      ? {
          exhibition: exName.get(b.exhibitionId) ?? b.exhibitionId,
          name: displayName ?? b.name,
          code: b.code ?? "",
          instagramUrl: b.instagramUrl,
          websiteUrl: b.websiteUrl,
          summary: b.enrichment?.summary || b.description || "",
          image: b.images?.[0] ?? b.logoUrl,
        }
      : null;

  const rows: BrandLinkRow[] = pending.map((c) => {
    // 대상 참가사에 배정된 모든 부스(다른 회차들).
    const targetBooths = graph.assignments
      .filter((a) => displayOf.get(a.participantId)?.exhibitorId === c.exhibitorId)
      .map((a) => side(booths.get(a.boothId), displayOf.get(a.participantId)?.displayName))
      .filter((s): s is BrandSide => s !== null);
    return { id: c.id, reason: c.reason, booth: side(booths.get(c.boothId)), targets: targetBooths };
  });

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <p className="text-sm text-muted-foreground">
          <Link href="/admin/verify" className="underline">대조 검수</Link> · 브랜드 연결
        </p>
        <h1 className="text-2xl font-extrabold">같은 브랜드인가요?</h1>
        <p className="text-sm text-muted-foreground">
          인스타·웹사이트가 같은 곳은 이미 자동으로 이어졌습니다. 여기는 이름만 같은
          쌍입니다 — 이름이 같아도 다른 회사일 수 있어 나란히 놓고 고릅니다.
        </p>
      </header>
      <BrandLinkQueue rows={rows} />
    </div>
  );
}
