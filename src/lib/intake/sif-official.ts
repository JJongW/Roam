// 서울일러스트레이션페어 공식 참가자 명단 → brands.v1. 순수 함수, I/O 없음.
//
// 오크레오(ocreo.kr/fair/sif22) 참가자 목록은 부스 번호가 공개되기 전이라 분류와 이름뿐이다.
// 명단은 Roam-design 콘텐츠 엔진 폴더(runs/sif-2026-v22)에 TSV로 떠 두었고, 지난 회차(V.21, Roam `sif-2026`)와의
// 이름 대조도 거기 있다. 이 모듈은 그 TSV 세 장과 V.21 링크(src/lib/booth/links-sif-2026.json)를 읽어
// brands.v1 한 장을 만든다(브랜드 먼저, 2026-11-10 결정. 부스와 배치도는 공개되면 intake.v1로 붙인다).
//
// 지난 회차를 잇는 방법은 brands.v1의 규칙 그대로다. 이름으로 합치지 않는다:
// - "같은 이름"이면 V.21 부스의 인스타와 웹을 그대로 적는다. 운영의 V.21 브랜드는 그 부스 링크를 신원 키로
//   갖고 있어(lib/exhibitor/service.ts existingExhibitors) 미리보기에서 "기존에 이음(identity)"이 된다.
// - 이름이 짧거나 비슷해 확인이 필요한 곳은 오크레오 프로필 대조(profile-check TSV) 판정을 따른다.
//   "같은 작가"는 위와 같이, "다른 작가"는 지난 회차 정보 없이 새 참가로, 판정이 없거나 "모름"이면 **파일에서 뺀다**.
//   새 브랜드로 넣었다가 같은 작가로 밝혀지면 브랜드가 둘이 되기 때문이다. 뺀 곳은 held로 돌려준다.
// - 같은 이름인데 V.21 링크가 없는 곳은 신원 키가 없어 이름 일치로만 보인다. 운영 미리보기 보고서(--json)의
//   nameMatches에서 기존 브랜드가 하나뿐이면 그 id를 exhibitorId로 적는다(pinFromNameMatches). 링크가 있어도
//   운영 부스에 그 링크가 없어 이름 일치로만 보이는 곳도 같은 길로 잇는다.
// - V.21 부스끼리 링크 모음 서비스(link.inpock.co.kr, instabio.cc, grafolio 등) 주소가 신원 키 하나로 뭉치는 곳은
//   **빼 둔다**(v21MergedCodes). identity.ts가 그 서비스들을 계정 단위로 나누지 못해, 백필이 서로 다른 작가를
//   브랜드 하나로 묶었을 수 있다(2026-11-20 mock 재현: "러브미모어" 아래 V.21 부스 27곳). 거기에 이으면 V.22 작가도
//   남의 브랜드에 붙는다. 신원 판정을 고치고 운영 브랜드를 가른 뒤 다시 돌린다.
import { anchorKey, identityKeys } from "@/lib/exhibitor/identity";
import { BRANDS_FILE_VERSION, brandsFileSchema, type BrandsFile, type BrandsFileBrand } from "@/lib/intake/brands-schema";

/** 오크레오 참가 구분. 참가 사실 metadata.category와 participationType으로 남는다. */
export const SIF_TYPES = ["국내 작가", "국내 기업", "해외 작가", "해외 기업"] as const;

export type SifMatch = "새 참가" | "같은 이름" | "같은 이름(짧아서 확인 필요)" | "비슷한 이름(확인 필요)";
export type SifVerdict = "같은 작가" | "다른 작가" | "모름";

export interface SifParticipant {
  type: string;
  name: string;
}
export interface SifCompareRow {
  type: string;
  name: string;
  match: SifMatch;
  v21Code: string | null;
  v21Name: string | null;
}
export interface SifV21Link {
  instagram?: string;
  website?: string;
  intro?: string;
}

/** 머리줄 있는 TSV → 칸 이름으로 된 줄들. 빈 줄은 건너뛴다. */
export function parseTsv(text: string): Record<string, string>[] {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim() !== "");
  if (!lines.length) return [];
  const head = lines[0].split("\t").map((h) => h.trim());
  return lines.slice(1).map((l) => {
    const cells = l.split("\t");
    return Object.fromEntries(head.map((h, i) => [h, (cells[i] ?? "").trim()]));
  });
}

export function parseParticipants(text: string): SifParticipant[] {
  return parseTsv(text).map((r) => ({ type: r.type, name: r.name }));
}

const MATCHES: SifMatch[] = ["새 참가", "같은 이름", "같은 이름(짧아서 확인 필요)", "비슷한 이름(확인 필요)"];
export function parseCompare(text: string): SifCompareRow[] {
  return parseTsv(text).map((r) => {
    const match = r["대조"] as SifMatch;
    if (!MATCHES.includes(match)) throw new Error(`모르는 대조 값이에요: ${r["대조"]} (${r["V22이름"]})`);
    return { type: r["V22분류"], name: r["V22이름"], match, v21Code: r["V21부스"] || null, v21Name: r["V21이름"] || null };
  });
}

export interface SifProfileCheckRow {
  name: string;
  verdict: SifVerdict;
  /** 오크레오 프로필 주소(마지막 칸). 같은 이름 카드가 둘이면 이 주소로 파일 키를 가른다. */
  profileUrl?: string;
  /** 근거에 "프로필 인스타는 @계정"이 있으면 그 계정. V.21 인스타와 다르면 V.22 쪽을 쓴다(최신). */
  profileInstagram?: string;
}

/**
 * 프로필 대조 결과 → V.22 이름 → 줄들. 머리줄에 `V22이름`(또는 `이름`, `name`)과 `판정` 칸이 있어야 한다.
 * 같은 이름 카드가 둘이면(오크레오에 같은 이름 작가가 둘) 줄도 둘이다. 판정은 같은 작가, 다른 작가, 그 밖은 모름.
 */
export function parseProfileCheck(text: string): Map<string, SifProfileCheckRow[]> {
  const out = new Map<string, SifProfileCheckRow[]>();
  for (const r of parseTsv(text)) {
    const name = r["V22이름"] ?? r["이름"] ?? r["name"];
    const v = r["판정"];
    if (!name || !v) continue;
    const verdict: SifVerdict = v === "같은 작가" || v === "다른 작가" ? v : "모름";
    const profileUrl = r["오크레오 프로필 주소"] || undefined;
    const ig = /프로필 인스타는 @([A-Za-z0-9._]+)/.exec(r["근거"] ?? "")?.[1]?.replace(/\.+$/, "");
    out.set(name, [...(out.get(name) ?? []), { name, verdict, ...(profileUrl ? { profileUrl } : {}), ...(ig ? { profileInstagram: ig } : {}) }]);
  }
  return out;
}

export interface SifBuildInput {
  participants: SifParticipant[];
  compare: SifCompareRow[];
  /** 없으면 확인 필요한 곳은 전부 held. */
  profileCheck?: Map<string, SifProfileCheckRow[]>;
  /** V.21 부스 코드 → 링크와 소개(src/lib/booth/links-sif-2026.json). */
  v21Links: Record<string, SifV21Link>;
  exhibitionSlug: string;
  sourceUrl: string;
  collectedAt: string;
  /** V.21 소개 원문의 출처 표기. 끝에 `#<부스 코드>`를 붙인다. */
  v21IntroSource: string;
  note?: string;
}

export interface SifHeld {
  name: string;
  type: string;
  match: SifMatch;
  v21Code: string | null;
  v21Name: string | null;
  reason: string;
}

export interface SifBuildResult {
  file: BrandsFile;
  held: SifHeld[];
  /** 명단에 똑같이 두 번 나온 줄인데 프로필 대조로 가를 수 없던 것. 하나만 넣었다. */
  duplicateRows: SifParticipant[];
  /** 같은 작가인데 V.22 프로필 인스타가 V.21과 달라 V.22 쪽을 적은 곳. 사람이 확인한다. */
  instagramFromV22: { key: string; name: string; v21: string | null; v22: string }[];
  /** 지난 회차 링크(또는 소개)를 이어 적은 곳. */
  carried: { key: string; name: string; v21Code: string; withLinks: boolean }[];
  counts: Record<SifMatch, number>;
}

const pathOf = (u: string) => {
  try {
    const x = new URL(/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
    return `${x.hostname.replace(/^(www|m)\./, "")}${x.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return u.trim().toLowerCase();
  }
};

/**
 * V.21 부스 중 신원 키(identity.ts)로 다른 작가와 하나로 뭉쳤을 부스 코드.
 * 키를 공유하는 부스끼리 묶어서(union-find), 묶음 안에 인스타 계정이 둘 이상이거나 웹 키가 같은데 주소 경로가
 * 다르면(링크 모음 서비스의 서로 다른 계정) 그 묶음 전체를 낸다. 같은 인스타와 같은 사이트를 쓰는 진짜 한 브랜드의
 * 여러 부스는 걸리지 않는다. 자기 도메인의 .com과 .co.kr처럼 경로가 같은데 호스트만 다른 경우도 걸린다(보수적으로 뺀다).
 */
export function v21MergedCodes(v21Links: Record<string, SifV21Link>): Set<string> {
  const codes = Object.keys(v21Links);
  const parent = new Map(codes.map((c) => [c, c]));
  const find = (c: string): string => (parent.get(c) === c ? c : (parent.set(c, find(parent.get(c)!)), parent.get(c)!));
  const firstByKey = new Map<string, string>();
  for (const c of codes)
    for (const k of identityKeys({ instagramUrl: v21Links[c].instagram, websiteUrl: v21Links[c].website })) {
      const seen = firstByKey.get(k);
      if (seen === undefined) firstByKey.set(k, c);
      else parent.set(find(c), find(seen));
    }
  const groups = new Map<string, string[]>();
  for (const c of codes) groups.set(find(c), [...(groups.get(find(c)) ?? []), c]);
  const out = new Set<string>();
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const igs = new Set(g.flatMap((c) => (v21Links[c].instagram ? identityKeys({ instagramUrl: v21Links[c].instagram }) : [])));
    const webPaths = new Map<string, Set<string>>();
    for (const c of g) {
      const w = v21Links[c].website;
      const k = w ? anchorKey(w)?.match : undefined;
      if (!w || !k) continue;
      if (!webPaths.has(k)) webPaths.set(k, new Set());
      webPaths.get(k)!.add(pathOf(w));
    }
    if (igs.size > 1 || [...webPaths.values()].some((p) => p.size > 1)) for (const c of g) out.add(c);
  }
  return out;
}

const httpUrl = (u: string | undefined): string | undefined => {
  if (!u) return undefined;
  try {
    const url = new URL(/^https?:\/\//i.test(u.trim()) ? u.trim() : `https://${u.trim()}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
};

/** 다시 돌려도 같은 브랜드를 찾는 파일 키. 명단 순서가 바뀌어도 같게 이름에서 만든다. */
export function sifBrandKey(name: string, profileUrl?: string): string {
  const id = profileUrl ? profileUrl.replace(/\/+$/, "").split("/").pop() : undefined;
  return (id ? `sif22-${name.trim()}-${id}` : `sif22-${name.trim()}`).slice(0, 120);
}

const igHandle = (u: string | undefined) => (u ? /instagram\.com\/([^/?#]+)/i.exec(u)?.[1]?.toLowerCase() : undefined);

export function buildSifBrandsFile(input: SifBuildInput): SifBuildResult {
  const byName = new Map<string, SifCompareRow>();
  for (const c of input.compare) {
    const prev = byName.get(c.name);
    if (prev && (prev.v21Code !== c.v21Code || prev.match !== c.match))
      throw new Error(`대조 파일에 같은 이름이 다른 값으로 두 번 있어요: ${c.name}`);
    byName.set(c.name, c);
  }
  const held: SifHeld[] = [];
  const duplicateRows: SifParticipant[] = [];
  const instagramFromV22: SifBuildResult["instagramFromV22"] = [];
  const occurrences = new Map<string, number>();
  for (const p of input.participants) occurrences.set(p.name.trim(), (occurrences.get(p.name.trim()) ?? 0) + 1);
  const used = new Map<string, number>();
  const carried: SifBuildResult["carried"] = [];
  const counts = Object.fromEntries(MATCHES.map((m) => [m, 0])) as Record<SifMatch, number>;
  const brands: BrandsFileBrand[] = [];
  const seen = new Set<string>();
  const merged = v21MergedCodes(input.v21Links);

  for (const p of input.participants) {
    const name = p.name.trim();
    if (!name) continue;
    if (!SIF_TYPES.includes(p.type as (typeof SIF_TYPES)[number])) throw new Error(`모르는 분류예요: ${p.type} (${name})`);
    const c = byName.get(name);
    if (!c) throw new Error(`대조 파일에 없는 이름이에요: ${name}`);
    // 같은 이름 카드가 여럿이고 프로필 대조 줄도 그만큼 있으면 한 줄씩 짝지어 따로 넣는다(키는 프로필 주소로).
    // 대조 줄이 모자라면 명단을 쪽마다 넘기며 뽑다 같은 줄이 두 번 잡혔을 수 있어 하나만 넣는다.
    const rows = input.profileCheck?.get(name) ?? [];
    const n = occurrences.get(name) ?? 1;
    const nth = used.get(name) ?? 0;
    used.set(name, nth + 1);
    const split = n > 1 && rows.length === n;
    if (n > 1 && !split && nth > 0) {
      duplicateRows.push(p);
      continue;
    }
    const row: SifProfileCheckRow | undefined = split
      ? rows[nth]
      : rows.length
        ? { ...rows[0], verdict: rows.every((r) => r.verdict === rows[0].verdict) ? rows[0].verdict : "모름" }
        : undefined;
    const key = sifBrandKey(name, split ? row?.profileUrl : undefined);
    if (seen.has(key)) throw new Error(`파일 키가 겹쳐요: ${key}`);
    seen.add(key);
    counts[c.match]++;

    let carry = c.match === "같은 이름";
    if (c.match === "같은 이름(짧아서 확인 필요)" || c.match === "비슷한 이름(확인 필요)") {
      const v = row?.verdict;
      if (v === "같은 작가") carry = true;
      else if (v !== "다른 작가") {
        held.push({
          name,
          type: p.type,
          match: c.match,
          v21Code: c.v21Code,
          v21Name: c.v21Name,
          reason: v === "모름" ? "프로필 대조 판정이 모름이에요" : "프로필 대조 결과가 아직 없어요",
        });
        continue;
      }
    }

    if (carry && c.v21Code && merged.has(c.v21Code)) {
      held.push({
        name,
        type: p.type,
        match: c.match,
        v21Code: c.v21Code,
        v21Name: c.v21Name,
        reason: "V.21 링크가 링크 모음 서비스 주소라 다른 작가와 한 브랜드로 묶였을 수 있어요",
      });
      continue;
    }

    const b: BrandsFileBrand = { key, name: name.slice(0, 120), category: p.type, participationType: p.type };
    if (carry && c.v21Code) {
      const l = input.v21Links[c.v21Code] ?? {};
      let instagramUrl = httpUrl(l.instagram);
      // V.22 프로필 인스타가 다르면 그쪽이 최신이다. V.21 인스타로 덮지 않는다. V.21 브랜드에는 웹 주소나
      // 미리보기 이름 일치(--name-matches)로 잇는다.
      const v22 = row?.profileInstagram;
      if (v22 && v22.toLowerCase() !== igHandle(instagramUrl)) {
        instagramFromV22.push({ key, name, v21: instagramUrl ?? null, v22: `https://www.instagram.com/${v22}` });
        instagramUrl = `https://www.instagram.com/${v22}`;
      }
      const websiteUrl = httpUrl(l.website);
      if (instagramUrl) b.instagramUrl = instagramUrl;
      if (websiteUrl) b.websiteUrl = websiteUrl;
      // V.21 표기가 다르면(띄어쓰기, 괄호 속 본명) 다른 이름으로 남긴다. 부스가 나중에 그 표기로 와도 이어진다.
      if (c.v21Name && c.v21Name.trim() !== name) b.aliases = [c.v21Name.trim().slice(0, 120)];
      // 작가가 오크레오 프로필에 직접 쓴 소개 원문 그대로(브랜드가 쓴 글은 고치지 않는다, 2026-11-09).
      // 말투 변환은 워커가 한다. 기존 브랜드에 이미 소개가 있으면 계획이 건너뛴다(빈 칸만).
      if (l.intro?.trim()) b.intro = { text: l.intro.trim().slice(0, 4000), status: "collected", source: `${input.v21IntroSource}#${c.v21Code}` };
      carried.push({ key, name, v21Code: c.v21Code, withLinks: !!(instagramUrl || websiteUrl) });
    }
    brands.push(b);
  }

  const file = brandsFileSchema.parse({
    version: BRANDS_FILE_VERSION,
    exhibitionSlug: input.exhibitionSlug,
    source: { url: input.sourceUrl, collectedAt: input.collectedAt, ...(input.note ? { note: input.note.slice(0, 500) } : {}) },
    brands,
  });
  return { file, held, duplicateRows, instagramFromV22, carried, counts };
}

/**
 * 운영 미리보기 보고서(npm run intake:dry-run -- <파일> --json <보고서>)의 nameMatches로 exhibitorId를 적는다.
 * 대상은 지난 회차와 같다고 본 곳(carried) 중 신원 키로 못 이어 이름 일치로 남은 곳뿐이다. 기존 브랜드가 정확히
 * 하나일 때만 적고, 둘 이상이면 그대로 둔다(사람이 고른다). 적은 곳과 못 적은 곳을 돌려준다.
 */
export function pinFromNameMatches(
  file: BrandsFile,
  carried: SifBuildResult["carried"],
  nameMatches: { key: string; name: string; existing: { id: string; name: string }[] }[],
): { file: BrandsFile; pinned: { key: string; id: string; name: string }[]; ambiguous: { key: string; existing: { id: string; name: string }[] }[] } {
  const want = new Set(carried.map((c) => c.key));
  const byKey = new Map(nameMatches.map((m) => [m.key, m]));
  const pinned: { key: string; id: string; name: string }[] = [];
  const ambiguous: { key: string; existing: { id: string; name: string }[] }[] = [];
  const brands = file.brands.map((b) => {
    if (!want.has(b.key) || b.exhibitorId) return b;
    const m = byKey.get(b.key);
    if (!m) return b;
    if (m.existing.length !== 1) {
      ambiguous.push({ key: b.key, existing: m.existing });
      return b;
    }
    pinned.push({ key: b.key, id: m.existing[0].id, name: m.existing[0].name });
    return { ...b, exhibitorId: m.existing[0].id };
  });
  return { file: brandsFileSchema.parse({ ...file, brands }), pinned, ambiguous };
}
