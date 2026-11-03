// /admin/brands 목록 — 모든 박람회의 브랜드(exhibitor)를 한 화면에. 순수 함수, I/O 없음.
//
// 브랜드가 중심이다(기준 문서 brand-profile-spec 1장). 한 줄 = 참가사 그래프(0040)의
// 브랜드 하나, 그 아래 출전(대표 배정된 부스)들. 같은 브랜드인지는 여기서 새로 판단하지
// 않는다 — lib/exhibitor/identity.ts가 정하고, 애매한 짝은 연결 확인 목록으로 간다.
// 아직 어느 브랜드에도 이어지지 않은 부스는 `unlinked`로 따로 돌려준다(백필 전 상태).
import { findBoothEnrichmentGaps } from "@/lib/admin/data-issues";
import { summarizeFill, fillLevel, type FillLevel, type FillSummary } from "@/lib/brands/profile";
import type { Booth, Category, Exhibition, ExhibitorGraph, ProfileField } from "@/lib/types";

export type EnrichmentState = "full" | "partial" | "none";

export interface BrandAppearance {
  boothId: string;
  participantId?: string;
  exhibitionId: string;
  exhibitionName: string;
  startDate: string;
  code?: string;
  /** 그 회차 표기 이름(부스 이름). */
  name: string;
  company: string;
  categoryId: string;
  categoryName?: string;
  instagramUrl?: string;
  websiteUrl?: string;
  enrichment: EnrichmentState;
  enrichmentMissing: number;
}

export interface BrandSummary {
  exhibitorId: string;
  name: string;
  artistName?: string;
  aliases: string[];
  items: string[];
  textureTags: string[];
  fill: FillSummary;
  fillLevel: FillLevel;
  /** 최근 회차 먼저. */
  appearances: BrandAppearance[];
}

const REQUIRED_COUNT = 6;

function strList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

export function buildBrandDirectory(input: {
  exhibitions: Exhibition[];
  booths: Booth[];
  categories: Category[];
  graph: ExhibitorGraph;
  fields: ProfileField[];
}): { brands: BrandSummary[]; unlinked: BrandAppearance[] } {
  const exById = new Map(input.exhibitions.map((e) => [e.id, e]));
  const catById = new Map(input.categories.map((c) => [c.id, c]));
  const participantById = new Map(input.graph.participants.map((p) => [p.id, p]));

  // 부스 → (참가 사실, 브랜드). 공동 출전(co_exhibitor)은 그 부스의 브랜드가 아니다(0040).
  const ownerOfBooth = new Map<string, { participantId: string; exhibitorId: string }>();
  for (const a of input.graph.assignments) {
    if (a.role !== "primary") continue;
    const p = participantById.get(a.participantId);
    if (p) ownerOfBooth.set(a.boothId, { participantId: p.id, exhibitorId: p.exhibitorId });
  }

  const booths = input.booths.filter((b) => (b.kind ?? "exhibitor") === "exhibitor");
  const gaps = new Map(findBoothEnrichmentGaps(booths).map((g) => [g.boothId, g.missingFields.length]));

  const fieldsByExhibitor = new Map<string, ProfileField[]>();
  for (const f of input.fields) {
    if (!f.exhibitorId) continue;
    const list = fieldsByExhibitor.get(f.exhibitorId) ?? [];
    list.push(f);
    fieldsByExhibitor.set(f.exhibitorId, list);
  }

  const brands = new Map<string, BrandSummary>();
  for (const e of input.graph.exhibitors) {
    const fs = fieldsByExhibitor.get(e.id) ?? [];
    const val = (k: string) => fs.find((f) => f.field === k)?.value;
    const texture = val("texture") as { tags?: unknown } | undefined;
    const fill = summarizeFill(fs);
    const artist = val("artistName");
    brands.set(e.id, {
      exhibitorId: e.id,
      name: e.canonicalName,
      artistName: typeof artist === "string" ? artist : undefined,
      aliases: strList(val("aliases")),
      items: strList(val("items")),
      textureTags: strList(texture?.tags),
      fill,
      fillLevel: fillLevel(fill),
      appearances: [],
    });
  }

  const unlinked: BrandAppearance[] = [];
  for (const b of booths) {
    const ex = exById.get(b.exhibitionId);
    const missing = gaps.get(b.id) ?? 0;
    const owner = ownerOfBooth.get(b.id);
    const a: BrandAppearance = {
      boothId: b.id,
      participantId: owner?.participantId,
      exhibitionId: b.exhibitionId,
      exhibitionName: ex?.name ?? b.exhibitionId,
      startDate: ex?.startDate ?? "",
      code: b.code,
      name: b.name,
      company: b.company,
      categoryId: b.categoryId,
      categoryName: catById.get(b.categoryId)?.name,
      instagramUrl: b.instagramUrl || undefined,
      websiteUrl: b.websiteUrl || undefined,
      enrichment: !b.enrichment ? "none" : missing === 0 ? "full" : "partial",
      enrichmentMissing: b.enrichment ? missing : REQUIRED_COUNT,
    };
    const brand = owner && brands.get(owner.exhibitorId);
    if (brand) brand.appearances.push(a);
    else unlinked.push(a);
  }

  const out = [...brands.values()];
  for (const r of out)
    r.appearances.sort(
      (x, y) => y.startDate.localeCompare(x.startDate) || (x.code ?? "").localeCompare(y.code ?? ""),
    );
  out.sort((x, y) => x.name.localeCompare(y.name, "ko"));
  return { brands: out, unlinked };
}

export interface DirectoryFilter {
  exhibitionId?: string;
  /** 출전 횟수 이상. */
  minAppearances?: number;
  item?: string;
  texture?: string;
  fill?: FillLevel;
  /** AI 초안이나 다시 볼 칸이 있는 브랜드만. */
  needsReview?: boolean;
  q?: string;
}

/** 박람회를 고르면 그 회차에 나온 브랜드만, 출전 목록도 그 회차 것만 남긴다. */
export function filterDirectory(rows: BrandSummary[], f: DirectoryFilter): BrandSummary[] {
  const q = f.q?.trim().toLowerCase();
  const out: BrandSummary[] = [];
  for (const r of rows) {
    if (f.minAppearances && r.appearances.length < f.minAppearances) continue;
    if (f.item && !r.items.includes(f.item)) continue;
    if (f.texture && !r.textureTags.includes(f.texture)) continue;
    if (f.fill && r.fillLevel !== f.fill) continue;
    if (f.needsReview && r.fill.aiDraft + r.fill.stale === 0) continue;
    const scoped = f.exhibitionId ? r.appearances.filter((a) => a.exhibitionId === f.exhibitionId) : r.appearances;
    if (f.exhibitionId && scoped.length === 0) continue;
    if (q) {
      const names = [r.name, r.artistName ?? "", ...r.aliases, ...scoped.flatMap((a) => [a.name, a.company])];
      if (!names.some((n) => n.toLowerCase().includes(q))) continue;
    }
    out.push(f.exhibitionId ? { ...r, appearances: scoped } : r);
  }
  return out;
}

export type GroupBy = "item" | "texture" | "exhibition" | "fill";
const FILL_LABEL: Record<FillLevel, string> = { full: "다 채움", partial: "일부 채움", empty: "확인된 칸 없음" };

/** 묶어 보기. 한 브랜드가 품목이나 박람회를 여럿 가지면 각 묶음에 다 나온다. */
export function groupDirectory(rows: BrandSummary[], by: GroupBy): { key: string; label: string; rows: BrandSummary[] }[] {
  const NONE = "__none";
  const groups = new Map<string, { key: string; label: string; rows: BrandSummary[] }>();
  const add = (key: string, label: string, r: BrandSummary) => {
    const g = groups.get(key) ?? { key, label, rows: [] };
    if (!g.rows.includes(r)) g.rows.push(r);
    groups.set(key, g);
  };
  for (const r of rows) {
    if (by === "item") {
      if (r.items.length === 0) add(NONE, "품목 없음", r);
      for (const i of r.items) add(i, i, r);
    } else if (by === "texture") {
      if (r.textureTags.length === 0) add(NONE, "결 태그 없음", r);
      for (const t of r.textureTags) add(t, t, r);
    } else if (by === "exhibition") {
      if (r.appearances.length === 0) add(NONE, "출전 없음", r);
      for (const a of r.appearances) add(a.exhibitionId, a.exhibitionName, r);
    } else add(r.fillLevel, FILL_LABEL[r.fillLevel], r);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === NONE) return 1;
    if (b.key === NONE) return -1;
    return b.rows.length - a.rows.length || a.label.localeCompare(b.label, "ko");
  });
}

/** 지금 목록에 실제로 있는 값만 필터 보기로(개수 많은 순). */
export function optionCounts(rows: BrandSummary[], pick: (r: BrandSummary) => string[]): { value: string; count: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) for (const v of new Set(pick(r))) m.set(v, (m.get(v) ?? 0) + 1);
  return [...m].map(([value, count]) => ({ value, count })).sort((a, b) => b.count - a.count || a.value.localeCompare(b.value, "ko"));
}
