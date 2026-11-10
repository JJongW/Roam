/**
 * 브랜드 먼저 인입 계획 — 순수. DB도 네트워크도 안 탄다.
 *
 * brands.v1 파일 한 장을 "새 브랜드 / 기존 브랜드에 이음 / 참가 사실 / 채울 칸"으로 나눈다.
 * 규칙은 부스 연결(lib/exhibitor/plan.ts)과 같다:
 *  - 인스타·도메인(identity.ts)이 기존 브랜드와 겹치면 그 브랜드를 쓴다.
 *  - 이름만 같으면 자동으로 합치지 않는다. 새로 만들고 "이름 같은 기존 브랜드"로 보여 준다.
 *  - 파일 안에서 인스타·도메인이 같은 항목은 하나로 묶는다.
 *  - 다시 돌려도 중복이 안 생긴다: 만든 브랜드에 파일 키(brandKeys)를 남겨 두고 다음에 그걸로 찾는다.
 * 프로필 칸은 비어 있을 때만 채운다(intake.v1 "빈 칸만 채운다"와 같은 원칙).
 */
import type { ExhibitorGraph } from "@/lib/types";
import { anchorKey, brandKeyIdentity, identityKeys, nameKey } from "@/lib/exhibitor/identity";
import type { ExhibitorPlan, ExistingExhibitor, Ref } from "@/lib/exhibitor/plan";
import { parseFieldValue } from "@/lib/brands/profile";
import type { BrandsFile, BrandsFileBrand } from "./brands-schema";

/** 이 인입이 채우는 브랜드 칸. */
export const BRANDS_INTAKE_FIELDS = ["intro", "links", "photos"] as const;
export type BrandsIntakeField = (typeof BRANDS_INTAKE_FIELDS)[number];

export interface PlannedBrand {
  /** 묶음의 대표 key(파일에서 먼저 나온 것). */
  key: string;
  /** 묶인 항목들의 key. 하나면 묶이지 않은 것. */
  keys: string[];
  name: string;
  target: Ref;
  /** 기존 브랜드에 이었으면 그 브랜드 이름. */
  existingName?: string;
  /** identity = 인스타·도메인이 겹침, brandKey = 이 파일로 전에 만든 브랜드(다시 돌림), explicit = 파일에 사람이 적은 exhibitorId. */
  matchedBy?: "identity" | "brandKey" | "explicit";
  participant: "create" | "exists" | "none";
  fills: BrandsIntakeField[];
  /** 이미 값이 있어 건너뛴 칸. */
  kept: BrandsIntakeField[];
}

export interface PlannedField {
  brandKey: string;
  target: Ref;
  field: BrandsIntakeField;
  value: unknown;
  status: "collected" | "artist_confirmed";
  sources: string[];
}

export interface NameMatch {
  key: string;
  name: string;
  existing: { id: string; name: string }[];
}

export interface BrandsPlan {
  version: "brands.v1";
  exhibitionId: string | null;
  brands: PlannedBrand[];
  /** applyExhibitorPlan에 그대로 넘긴다. 배정과 후보는 늘 비어 있다(부스가 없다). */
  exhibitorPlan: ExhibitorPlan;
  fields: PlannedField[];
  nameMatches: NameMatch[];
  errors: { key: string; message: string }[];
  warnings: string[];
  summary: {
    newBrands: number;
    linkedBrands: number;
    /** 파일 안에서 하나로 묶여 사라진 항목 수. */
    mergedInFile: number;
    participantsToCreate: number;
    participantsExisting: number;
    fieldsToFill: number;
  };
}

export interface BrandsPlanInput {
  file: BrandsFile;
  /** exhibitionSlug를 id로 푼 값. 파일이 null이면 null. */
  exhibitionId: string | null;
  graph: ExhibitorGraph;
  /** lib/exhibitor/service.ts existingExhibitors — 부스 연결과 같은 키·이름. */
  existing: ExistingExhibitor[];
  /** 기존 브랜드에 이미 있는 칸(exhibitorId → 칸 key). 상태와 무관하게 있으면 안 채운다. */
  filledFields?: Map<string, Set<string>>;
}

/** 다시 돌릴 때 같은 브랜드를 찾는 열쇠. 행사가 있으면 행사, 없으면 출처 URL 안에서 유일하다. */
export function brandScopeKey(file: Pick<BrandsFile, "exhibitionSlug" | "source">, key: string): string {
  return `brands.v1:${file.exhibitionSlug ?? file.source.url}#${key}`;
}

const refKey = (r: Ref) => ("existing" in r ? `ex:${r.existing}` : r.new);

function nameForms(name: string): string[] {
  const t = name.trim();
  const k = nameKey(t);
  return [`=${t}`, ...(k ? [`~${k}`] : [])];
}

export function planBrands(input: BrandsPlanInput): BrandsPlan {
  const { file, exhibitionId, graph } = input;
  const plan: BrandsPlan = {
    version: "brands.v1",
    exhibitionId,
    brands: [],
    exhibitorPlan: { exhibitors: [], participants: [], assignments: [], candidates: [] },
    fields: [],
    nameMatches: [],
    errors: [],
    warnings: [],
    summary: { newBrands: 0, linkedBrands: 0, mergedInFile: 0, participantsToCreate: 0, participantsExisting: 0, fieldsToFill: 0 },
  };

  // ── 파일 안에서 인스타·도메인이 같은 항목을 묶는다(union-find) ─────────────────
  const brands = file.brands;
  const parent = brands.map((_, i) => i);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const firstByKey = new Map<string, number>();
  brands.forEach((b, i) => {
    for (const k of identityKeys(b)) {
      const seen = firstByKey.get(k);
      if (seen === undefined) firstByKey.set(k, i);
      else {
        const a = find(seen), c = find(i);
        if (a !== c) parent[Math.max(a, c)] = Math.min(a, c); // 먼저 나온 항목이 대표
      }
    }
  });
  const groups = new Map<number, BrandsFileBrand[]>();
  brands.forEach((b, i) => {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(b);
  });
  plan.summary.mergedInFile = brands.length - groups.size;

  // ── 기존 브랜드 색인 ──────────────────────────────────────────────────────
  const exByKey = new Map<string, Set<string>>();
  const exByName = new Map<string, Set<string>>();
  for (const e of input.existing) {
    for (const k of e.keys) {
      if (!exByKey.has(k)) exByKey.set(k, new Set());
      exByKey.get(k)!.add(e.id);
    }
    for (const n of e.names)
      for (const f of nameForms(n)) {
        if (!exByName.has(f)) exByName.set(f, new Set());
        exByName.get(f)!.add(e.id);
      }
  }
  const nameOf = new Map(graph.exhibitors.map((e) => [e.id, e.canonicalName]));
  const participantOf = new Map(graph.participants.map((p) => [`${p.exhibitorId}|${p.exhibitionId}`, p.id]));

  const seenParticipant = new Set<string>(); // 같은 대상에 참가 사실은 하나
  const seenField = new Set<string>(); // 같은 대상의 같은 칸은 먼저 나온 것만
  const inFileName = new Map<string, string>(); // 파일 안 동명 경고용

  for (const members of groups.values()) {
    const lead = members[0];
    const keys = members.map((m) => m.key);
    const scopeKeys = keys.map((k) => brandScopeKey(file, k));
    const idKeys = [...new Set(members.flatMap((m) => identityKeys(m)))];

    // 1) 기존 브랜드 찾기 — 인스타·도메인, 그다음 파일 키(다시 돌림).
    const byIdentity = new Set(idKeys.flatMap((k) => [...(exByKey.get(k) ?? [])]));
    const byBrandKey = new Set(scopeKeys.flatMap((k) => [...(exByKey.get(brandKeyIdentity(k)) ?? [])]));
    // 사람이 확인해 적은 id가 있으면 그걸 쓴다. 인스타·도메인이 다른 브랜드를 가리키면 오류.
    const explicit = [...new Set(members.flatMap((m) => (m.exhibitorId ? [m.exhibitorId] : [])))];
    if (explicit.length > 1 || (explicit.length === 1 && !nameOf.has(explicit[0]))) {
      plan.errors.push({
        key: lead.key,
        message:
          explicit.length > 1
            ? `exhibitorId가 서로 달라요: ${explicit.join(", ")}`
            : `exhibitorId에 맞는 기존 브랜드가 없어요: ${explicit[0]}`,
      });
      continue;
    }
    if (explicit.length === 1 && byIdentity.size && !byIdentity.has(explicit[0])) {
      plan.errors.push({
        key: lead.key,
        message: `exhibitorId(${nameOf.get(explicit[0])})와 인스타나 도메인이 맞는 브랜드(${[...byIdentity]
          .map((id) => nameOf.get(id) ?? id)
          .join(", ")})가 달라요`,
      });
      continue;
    }
    const hits = explicit.length ? new Set(explicit) : byIdentity.size ? byIdentity : byBrandKey;
    if (hits.size > 1) {
      plan.errors.push({
        key: lead.key,
        message: `인스타나 도메인이 서로 다른 기존 브랜드 ${hits.size}곳에 맞아요. 어느 쪽인지 사람이 골라 주세요: ${[...hits]
          .map((id) => nameOf.get(id) ?? id)
          .join(", ")}`,
      });
      continue;
    }
    const existingId = hits.size === 1 ? [...hits][0] : null;
    const target: Ref = existingId ? { existing: existingId } : { new: `new:${lead.key}` };

    const aliases = [
      ...new Set(members.flatMap((m) => [m.name, ...(m.aliases ?? [])]).map((x) => x.trim())),
    ].filter((n) => n && n !== lead.name);
    const company = members.find((m) => m.company)?.company;
    const category = members.find((m) => m.category)?.category;
    const instagramUrl = members.find((m) => m.instagramUrl)?.instagramUrl;
    const websiteUrl = members.find((m) => m.websiteUrl)?.websiteUrl;
    const source = { url: file.source.url, collectedAt: file.source.collectedAt, ...(file.source.note ? { note: file.source.note } : {}) };

    const brand: PlannedBrand = {
      key: lead.key,
      keys,
      name: lead.name,
      target,
      participant: "none",
      fills: [],
      kept: [],
    };
    if (existingId) {
      brand.existingName = nameOf.get(existingId);
      brand.matchedBy = explicit.length ? "explicit" : byIdentity.size ? "identity" : "brandKey";
      plan.summary.linkedBrands++;
    } else {
      plan.summary.newBrands++;
      plan.exhibitorPlan.exhibitors.push({
        key: `new:${lead.key}`,
        canonicalName: lead.name,
        instagramUrl,
        websiteUrl,
        ...(company ? { legalName: company } : {}),
        ...(aliases.length ? { aliases } : {}),
        metadata: {
          brandKeys: scopeKeys,
          source,
          ...(category && !exhibitionId ? { category } : {}),
        },
      });
      // 이름만 같은 기존 브랜드 — 합치지 않고 보여만 준다(사람이 /admin/brands에서 판단).
      const same = new Set<string>();
      for (const n of [lead.name, ...aliases]) for (const f of nameForms(n)) for (const id of exByName.get(f) ?? []) same.add(id);
      if (same.size)
        plan.nameMatches.push({
          key: lead.key,
          name: lead.name,
          existing: [...same].map((id) => ({ id, name: nameOf.get(id) ?? id })),
        });
    }

    // 파일 안에서 묶이지 않은 동명 항목 — 같은 브랜드인지 파일만으로는 모른다.
    for (const f of nameForms(lead.name).filter((x) => x.startsWith("~"))) {
      const other = inFileName.get(f);
      if (other && other !== lead.key)
        plan.warnings.push(`파일 안에 이름이 같은 항목이 따로 있어요: ${other}, ${lead.key} ("${lead.name}"). 인스타나 사이트가 달라 따로 만들어요`);
      else inFileName.set(f, lead.key);
    }

    // 2) 참가 사실.
    if (exhibitionId) {
      const pk = `${refKey(target)}|${exhibitionId}`;
      const existingParticipant = existingId ? participantOf.get(`${existingId}|${exhibitionId}`) : undefined;
      if (existingParticipant || seenParticipant.has(pk)) {
        brand.participant = "exists";
        plan.summary.participantsExisting++;
      } else {
        seenParticipant.add(pk);
        brand.participant = "create";
        plan.summary.participantsToCreate++;
        plan.exhibitorPlan.participants.push({
          key: pk,
          exhibitorRef: target,
          exhibitionId,
          displayName: lead.name,
          ...(aliases.length ? { aliases } : {}),
          sourceUrls: [file.source.url],
          metadata: {
            brandKey: lead.key,
            ...(keys.length > 1 ? { brandKeys: keys } : {}),
            ...(category ? { category } : {}),
            source,
          },
        });
      }
    }

    // 3) 프로필 칸 — 빈 칸만.
    const filled = existingId ? (input.filledFields?.get(existingId) ?? new Set<string>()) : new Set<string>();
    const candidates: Omit<PlannedField, "brandKey" | "target">[] = [];
    const intro = members.find((m) => m.intro)?.intro;
    if (intro) candidates.push({ field: "intro", value: { original: intro.text }, status: intro.status, sources: [intro.source] });
    const links: { kind: "instagram" | "site"; url: string }[] = [];
    const seenLink = new Set<string>();
    for (const m of members)
      for (const [kind, url] of [
        ["instagram", m.instagramUrl],
        ["site", m.websiteUrl],
      ] as const) {
        if (!url) continue;
        const k = anchorKey(url)?.match ?? url;
        if (seenLink.has(k)) continue;
        seenLink.add(k);
        links.push({ kind, url });
      }
    if (links.length) candidates.push({ field: "links", value: links, status: "collected", sources: [file.source.url] });
    const photos: { path: string; scope: string }[] = [];
    for (const m of members) for (const p of m.photos ?? []) if (!photos.some((x) => x.path === p.path)) photos.push(p);
    if (photos.length) {
      if (photos.length > 20) plan.warnings.push(`${lead.key}: 사진이 20장을 넘어 앞의 20장만 넣어요`);
      candidates.push({ field: "photos", value: photos.slice(0, 20), status: "collected", sources: [file.source.url] });
    }

    for (const c of candidates) {
      const fk = `${refKey(target)}|${c.field}`;
      if (filled.has(c.field) || seenField.has(fk)) {
        brand.kept.push(c.field);
        continue;
      }
      const checked = parseFieldValue({ exhibitorId: "_" }, c.field, c.value);
      if (!checked.ok) {
        plan.warnings.push(`${lead.key}: ${c.field} 칸을 건너뛰어요 (${checked.message})`);
        continue;
      }
      seenField.add(fk);
      brand.fills.push(c.field);
      plan.fields.push({ ...c, value: checked.value, brandKey: lead.key, target });
    }
    plan.brands.push(brand);
  }
  plan.summary.fieldsToFill = plan.fields.length;
  return plan;
}

/** 계획에서 이미 있는 브랜드 id만 — 그 브랜드의 칸을 읽어 두 번째 계획에 넘긴다. */
export function existingTargets(plan: BrandsPlan): string[] {
  return [...new Set(plan.brands.flatMap((b) => ("existing" in b.target ? [b.target.existing] : [])))];
}
