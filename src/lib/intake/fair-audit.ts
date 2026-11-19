/**
 * 박람회 하나의 운영 데이터 점검 — 순수. 읽어 온 값만 받아 숫자와 빈 곳을 센다. 쓰지 않는다.
 *
 * 묻는 것(2026-11-19 Ted "지금 겨울 문구전 브랜드랑 저거 지도도 한 번 확인해야 할 듯"):
 * - 그 박람회 행이 있나(날짜, 장소), 참가 사실과 브랜드와 부스가 몇인가
 * - 도면(FLOORPLANS)이 등록돼 있나
 * - brands.v1 파일의 브랜드가 운영에 있나, 같은 브랜드가 둘로 갈려 있나, 그 박람회에 이어졌나
 *
 * 브랜드 찾기는 인입과 같은 열쇠만 쓴다: 파일 키(brandKeys), 인스타와 도메인(identityKeys).
 * 이름은 "이름만 같음"으로 따로 센다(같다고 같은 브랜드는 아니다, lib/exhibitor/identity.ts).
 */
import { brandKeyIdentity, identityKeys, nameKey } from "@/lib/exhibitor/identity";
import type { ExhibitorGraph, ProfileField } from "@/lib/types";
import type { BrandsFile } from "@/lib/intake/brands-schema";
import { brandScopeKey } from "@/lib/intake/brands-plan";

export interface AuditExhibition {
  id: string;
  slug: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
}

export interface AuditInput {
  exhibitions: AuditExhibition[];
  /** slug나 이름에 이 글자가 들면 후보로 본다(소문자 비교). 예: ["moongu", "문구전"] */
  match: string[];
  graph: ExhibitorGraph;
  fields: ProfileField[];
  /** 박람회 id → 부스 수(시설 포함, 읽어 온 것만). */
  boothCounts: Record<string, number>;
  /** FLOORPLANS에 등록된 slug. */
  floorplanSlugs: string[];
  brands: BrandsFile;
  /** 참가 id → 허락 상태(읽을 수 있을 때만). */
  permissions?: Record<string, { status: string; allowedUse: string[] }>;
}

export interface BrandAuditRow {
  key: string;
  name: string;
  /** 열쇠로 찾은 운영 브랜드. 둘 이상이면 중복이다. */
  exhibitorIds: string[];
  matchedBy: ("brandKey" | "identity")[];
  /** 열쇠로는 못 찾고 이름만 같은 브랜드. */
  nameOnly: string[];
  /** 후보 박람회 중 이 브랜드가 참가한 곳(slug). */
  linkedFairs: string[];
  /** 후보 밖까지 이 브랜드가 참가한 모든 행사(slug). */
  allFairs: string[];
  /** 그 참가 id(후보 박람회만). */
  participantIds: string[];
  /** 프로필 칸 상태(브랜드 단위). 없는 칸은 빠진다. */
  fields: Record<string, string>;
  /** 대표 사진 칸 장수(값이 배열일 때). */
  photoCount: number;
  permissions: Record<string, { status: string; allowedUse: string[] }>;
}

export interface FairAuditRow {
  slug: string;
  name: string;
  venue: string;
  startDate: string;
  endDate: string;
  participants: number;
  brands: number;
  booths: number;
  floorplan: boolean;
}

export interface FairAudit {
  fairs: FairAuditRow[];
  brands: BrandAuditRow[];
  summary: {
    fileBrands: number;
    found: number;
    missing: string[];
    duplicated: string[];
    nameOnly: string[];
    linkedToFair: number;
  };
}

export function auditFair(input: AuditInput): FairAudit {
  const needles = input.match.map((m) => m.toLowerCase()).filter(Boolean);
  const fairs = input.exhibitions.filter((e) =>
    needles.some((n) => e.slug.toLowerCase().includes(n) || e.name.toLowerCase().includes(n)),
  );
  const fairIds = new Set(fairs.map((f) => f.id));
  const slugOf = new Map(input.exhibitions.map((e) => [e.id, e.slug]));

  const fairRows: FairAuditRow[] = fairs.map((f) => {
    const ps = input.graph.participants.filter((p) => p.exhibitionId === f.id);
    return {
      slug: f.slug,
      name: f.name,
      venue: f.venue,
      startDate: f.startDate.slice(0, 10),
      endDate: f.endDate.slice(0, 10),
      participants: ps.length,
      brands: new Set(ps.map((p) => p.exhibitorId)).size,
      booths: input.boothCounts[f.id] ?? 0,
      floorplan: input.floorplanSlugs.includes(f.slug),
    };
  });

  // 열쇠 → 브랜드 id들
  const byKey = new Map<string, Set<string>>();
  const add = (k: string, id: string) => (byKey.get(k) ?? byKey.set(k, new Set()).get(k)!).add(id);
  const byName = new Map<string, Set<string>>();
  for (const ex of input.graph.exhibitors) {
    for (const k of identityKeys(ex)) add(k, ex.id);
    for (const bk of ex.brandKeys ?? []) add(brandKeyIdentity(bk), ex.id);
    for (const n of [ex.canonicalName, ...(ex.aliases ?? [])]) {
      const nk = nameKey(n);
      if (nk) (byName.get(nk) ?? byName.set(nk, new Set()).get(nk)!).add(ex.id);
    }
  }

  const fieldsByExhibitor = new Map<string, ProfileField[]>();
  for (const f of input.fields)
    if (f.exhibitorId) (fieldsByExhibitor.get(f.exhibitorId) ?? fieldsByExhibitor.set(f.exhibitorId, []).get(f.exhibitorId)!).push(f);

  const rows: BrandAuditRow[] = input.brands.brands.map((b) => {
    const ids = new Set<string>();
    const matchedBy = new Set<"brandKey" | "identity">();
    if (b.exhibitorId) ids.add(b.exhibitorId);
    for (const id of byKey.get(brandKeyIdentity(brandScopeKey(input.brands, b.key))) ?? []) {
      ids.add(id);
      matchedBy.add("brandKey");
    }
    for (const k of identityKeys({ instagramUrl: b.instagramUrl, websiteUrl: b.websiteUrl }))
      for (const id of byKey.get(k) ?? []) {
        ids.add(id);
        matchedBy.add("identity");
      }
    const nameOnly = new Set<string>();
    for (const n of [b.name, ...(b.aliases ?? [])]) {
      const nk = nameKey(n);
      for (const id of (nk && byName.get(nk)) || []) if (!ids.has(id)) nameOnly.add(id);
    }
    const exhibitorIds = [...ids];
    const ps = input.graph.participants.filter((p) => ids.has(p.exhibitorId) && fairIds.has(p.exhibitionId));
    const fields: Record<string, string> = {};
    let photoCount = 0;
    for (const id of exhibitorIds)
      for (const f of fieldsByExhibitor.get(id) ?? []) {
        fields[f.field] = f.status;
        if (f.field === "photos" && Array.isArray(f.value)) photoCount = f.value.length;
      }
    const permissions: BrandAuditRow["permissions"] = {};
    for (const p of ps) if (input.permissions?.[p.id]) permissions[p.id] = input.permissions[p.id];
    return {
      key: b.key,
      name: b.name,
      exhibitorIds,
      matchedBy: [...matchedBy],
      nameOnly: [...nameOnly],
      allFairs: [
        ...new Set(input.graph.participants.filter((p) => ids.has(p.exhibitorId)).map((p) => slugOf.get(p.exhibitionId) ?? p.exhibitionId)),
      ],
      linkedFairs: [...new Set(ps.map((p) => slugOf.get(p.exhibitionId) ?? p.exhibitionId))],
      participantIds: ps.map((p) => p.id),
      fields,
      photoCount,
      permissions,
    };
  });

  return {
    fairs: fairRows,
    brands: rows,
    summary: {
      fileBrands: rows.length,
      found: rows.filter((r) => r.exhibitorIds.length > 0).length,
      missing: rows.filter((r) => r.exhibitorIds.length === 0).map((r) => r.key),
      duplicated: rows.filter((r) => r.exhibitorIds.length > 1).map((r) => r.key),
      nameOnly: rows.filter((r) => r.nameOnly.length > 0).map((r) => r.key),
      linkedToFair: rows.filter((r) => r.linkedFairs.length > 0).length,
    },
  };
}
