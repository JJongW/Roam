import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import summaries from "@/lib/booth/summaries.json";
import sibfEnrichment from "@/lib/booth/enrichment-sibf-2026.json";
import sifEnrichment from "@/lib/booth/enrichment-sif-2026.json";
import haEnrichment from "@/lib/booth/enrichment-house-archive-2026.json";
import { categories, exhibition, booths } from "@/lib/mock/seed";
import { sifCategories, sifExhibition, sifBooths } from "@/lib/mock/seed-sif";
import { mlmExhibition, mlmBooths } from "@/lib/mock/seed-magok";
import { haExhibition } from "@/lib/mock/seed-house-archive";

// Roam이 쓰고 사용자가 보는 데이터는 해요체이고 가운뎃점(·)이 없다(브랜드 규칙 §5,
// 2026-11-18 Ted 결정). 사전 문구는 brand-voice 테스트가 보지만 데이터 파일은
// 그 테스트 밖이라 여기서 따로 막는다. 합니다체 검사는 요약 캐시와 enrichment의
// Roam 칸에만 건다. mock 시드의 행사 소개는 가운뎃점만 본다.
//
// 브랜드나 주최가 쓴 원문은 고치지 않는다(§1, 2026-11-09). 그래서 검사 대상은
// Roam이 쓴 칸만이다.
// - 하우스 아카이브 enrichment.summary: 주최 측 브랜드 디렉터리 소개 원문
//   (`scripts/gen-house-archive-enrichment.mjs`)이라 뺀다.
// - 마곡리빙마켓 enrichment.summary: 126건 중 67건이 주최 디렉터리의 브랜드 소개를
//   그대로 옮긴 글이라(`data/verified`의 directory와 같다) summary 칸째 뺀다.
// - 인입 파일의 description, longDescription, category, 브랜드 intro, verified의
//   directory와 instagram: 브랜드나 주최 원문이라 뺀다.
// - 부스 이름은 고유명사라 시드 문구에서 이름을 지우고 본다.

const DOT = "·";

/** 합니다체 문장 끝. 해요체 규칙(§5) 위반. */
const HAMNIDA = /(습니다|입니다|합니다|됩니다)(?=[.!?,\s]|$)/;

/** Roam 칸이지만 브랜드 문구를 그대로 인용한 것. 고치지 않는다(§1). */
const QUOTED_BRAND_COPY = new Set([
  "희망을 구조합니다", // 마곡 P-15 국제구조위원회 슬로건(memoryHooks)
]);

/** 객체 안 모든 문자열을 경로와 함께 모은다. */
function strings(x: unknown, path = ""): [string, string][] {
  if (typeof x === "string") return [[path, x]];
  if (Array.isArray(x)) return x.flatMap((v, i) => strings(v, `${path}[${i}]`));
  if (x && typeof x === "object")
    return Object.entries(x).flatMap(([k, v]) => strings(v, `${path}.${k}`));
  return [];
}

/** 가운뎃점과 합니다체를 본다. dotOnly면 가운뎃점만. */
const withDot = (pairs: [string, string][], dotOnly = false) =>
  pairs
    .filter(
      ([, s]) =>
        s.includes(DOT) || (!dotOnly && HAMNIDA.test(s) && !QUOTED_BRAND_COPY.has(s)),
    )
    .map(([p, s]) => `${p}: ${s}`);

/** enrichment에서 Roam이 쓰는 칸. summary는 출처가 전시마다 달라 따로 다룬다. */
const ROAM_FIELDS = [
  "roamInterpretation",
  "recommendationReasons",
  "thingsToDo",
  "timing",
  "memoryHooks",
  "conversationPrompts",
  "tips",
  "goodsKeywords",
];

/** summary가 브랜드나 주최 원문인 전시. */
const BRAND_SOURCED_SUMMARY = new Set(["house-archive-2026", "magok-livingmarket-2026"]);

function roamFields(e: Record<string, unknown>, withSummary: boolean) {
  const keys = withSummary ? [...ROAM_FIELDS, "summary"] : ROAM_FIELDS;
  return Object.fromEntries(keys.filter((k) => k in e).map((k) => [k, e[k]]));
}

describe("Roam이 쓴 데이터는 해요체이고 가운뎃점이 없다", () => {
  it("부스 요약 캐시(summaries.json)", () => {
    const table = summaries as Record<string, { summary: string; goods: string[] }>;
    const pairs = Object.entries(table).flatMap(([k, v]) =>
      strings({ summary: v.summary, goods: v.goods }, k),
    );
    expect(withDot(pairs)).toEqual([]);
  });

  it("SIBF enrichment", () => {
    const pairs = Object.entries(sibfEnrichment as Record<string, Record<string, unknown>>).flatMap(
      ([code, e]) => strings(roamFields(e, true), code),
    );
    expect(withDot(pairs)).toEqual([]);
  });

  it("SIF enrichment", () => {
    const pairs = Object.entries(sifEnrichment as Record<string, Record<string, unknown>>).flatMap(
      ([code, e]) => strings(roamFields(e, true), code),
    );
    expect(withDot(pairs)).toEqual([]);
  });

  it("하우스 아카이브 enrichment(summary는 주최 원문이라 제외)", () => {
    const pairs = Object.entries(haEnrichment as Record<string, Record<string, unknown>>).flatMap(
      ([code, e]) => strings(roamFields(e, false), code),
    );
    expect(withDot(pairs)).toEqual([]);
  });

  describe("data/intake 인입 파일의 enrichment", () => {
    const dir = join(process.cwd(), "data/intake");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    for (const f of files) {
      it(f, () => {
        const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
        if (!Array.isArray(raw.booths)) return;
        const withSummary = !BRAND_SOURCED_SUMMARY.has(raw.exhibitionSlug);
        const pairs = (raw.booths as { code: string; enrichment?: Record<string, unknown> }[])
          .filter((b) => b.enrichment)
          .flatMap((b) => strings(roamFields(b.enrichment!, withSummary), b.code));
        expect(withDot(pairs)).toEqual([]);
      });
    }
  });

  describe("data/verified 확인 사실의 Roam 칸", () => {
    const dir = join(process.cwd(), "data/verified");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      it(f, () => {
        const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
        const pairs = Object.entries((raw.booths ?? {}) as Record<string, Record<string, unknown>>).flatMap(
          ([code, v]) => strings(roamFields(v, !BRAND_SOURCED_SUMMARY.has(raw.exhibitionSlug ?? f.replace(/\.json$/, ""))), code),
        );
        expect(withDot(pairs)).toEqual([]);
      });
    }
  });

  it("mock 시드의 행사 소개와 분류 이름", () => {
    const pairs = [
      ...strings(exhibition, "sibf"),
      ...strings(sifExhibition, "sif"),
      ...strings(mlmExhibition, "magok"),
      ...strings(haExhibition, "house-archive"),
      ...strings(categories.map((c) => c.name), "sibf.categories"),
      ...strings(sifCategories.map((c) => c.name), "sif.categories"),
    ];
    expect(withDot(pairs, true)).toEqual([]);
  });

  it("mock 시드가 합성한 부스 설명(부스 이름은 빼고 본다)", () => {
    const pairs = [...booths, ...sifBooths, ...mlmBooths].map(
      (b): [string, string] => [b.code ?? b.id, (b.description ?? "").split(b.name).join("")],
    );
    expect(withDot(pairs, true)).toEqual([]);
  });
});
