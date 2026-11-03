import Link from "next/link";
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { loadBrandData } from "@/lib/brands/load";
import { buildBrandDirectory } from "@/lib/brands/directory";
import { countReactions } from "@/lib/brands/reactions";
import { anchorKey } from "@/lib/exhibitor/identity";
import { pickIntro } from "@/lib/brands/draft";
import { BRAND_DRAFT_JOB } from "@/lib/brands/jobs";
import { BrandProfile, type Suggestion } from "@/components/admin/brands/brand-profile";

export const metadata = { title: "브랜드 프로필" };

type Props = { params: Promise<{ id: string }> };

/** 브랜드 하나 — 기준 문서 3장 브랜드 칸, 4장 출전 칸, 그리고 연락 탭. */
export default async function BrandProfilePage({ params }: Props) {
  const { id } = await params;
  const exhibitorId = decodeURIComponent(id);
  const repo = await getRepository();
  const data = await loadBrandData(repo);
  const brand = buildBrandDirectory(data).brands.find((b) => b.exhibitorId === exhibitorId);
  if (!brand) notFound();

  const boothIds = brand.appearances.map((a) => a.boothId);
  const participantIds = brand.appearances.flatMap((a) => (a.participantId ? [a.participantId] : []));
  const [participantFields, notes, contacts, queuedJobs] = await Promise.all([
    repo.listProfileFields({ participantIds }),
    repo.listNotesByBoothIds(boothIds),
    repo.listBrandContacts(),
    repo.listJobs({ type: BRAND_DRAFT_JOB, status: "queued", limit: 1000 }),
  ]);
  const draftQueued = queuedJobs.some((j) => ((j.payload.exhibitorIds as string[] | undefined) ?? []).includes(exhibitorId));
  const brandFields = data.fields.filter((f) => f.exhibitorId === exhibitorId);

  // 부스 정보에서 가져올 수 있는 값 — 운영자가 누르면 collected로 저장된다(출처 roam:booth/<id>).
  const boothById = new Map(data.booths.map((b) => [b.id, b]));
  const suggestions: Suggestion[] = [];
  const links: { kind: string; url: string }[] = [];
  const linkSrc: string[] = [];
  const seen = new Set<string>();
  for (const a of brand.appearances) {
    const b = boothById.get(a.boothId);
    if (!b) continue;
    for (const [kind, url] of [
      ["instagram", b.instagramUrl],
      ["site", b.websiteUrl],
    ] as const) {
      // 같은 계정을 www, 끝 빗금만 다르게 쓴 것은 하나로(identity.ts의 키로 비교).
      const key = url ? (anchorKey(url)?.match ?? url) : null;
      if (!url || !key || seen.has(key)) continue;
      seen.add(key);
      links.push({ kind, url });
      linkSrc.push(`roam:booth/${b.id}`);
    }
  }
  if (links.length) suggestions.push({ field: "links", value: links, sources: [...new Set(linkSrc)] });
  // 공식 소개 원문(합성 소개 제외). 가져오면 원문만 공식 자료로 남고, 말투 변환은 워커 몫이다.
  const intro = pickIntro(
    brand.appearances.map((a) => boothById.get(a.boothId)).filter((b): b is NonNullable<typeof b> => !!b),
  );
  if (intro) suggestions.push({ field: "intro", value: { original: intro.text }, sources: [intro.source] });
  const aliasNames = [...new Set(brand.appearances.map((a) => a.name))].filter((n) => n !== brand.name);
  if (aliasNames.length)
    suggestions.push({
      field: "aliases",
      value: aliasNames,
      sources: brand.appearances.filter((a) => aliasNames.includes(a.name)).map((a) => `roam:booth/${a.boothId}`),
    });

  const boothSet = new Set(boothIds);
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        <Link href="/admin/brands" className="underline">
          브랜드 목록
        </Link>
      </p>
      <BrandProfile
        brand={brand}
        brandFields={brandFields}
        participantFields={participantFields}
        suggestions={suggestions}
        reactions={countReactions(notes)}
        draftQueued={draftQueued}
        contactStatus={Object.fromEntries(contacts.filter((c) => boothSet.has(c.boothId)).map((c) => [c.boothId, c.status]))}
      />
    </div>
  );
}
