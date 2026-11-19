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
// 그 테스트 밖이라 여기서 따로 막는다. 합니다체 검사는 요약 캐시, enrichment의
// Roam 칸, mock 시드의 행사 소개와 안내(description, tips)에 건다. 반말 문장 끝
// 검사는 enrichment의 문장 칸(`BANMAL_FIELDS`)과 행사 소개, 안내에 건다.
//
// 브랜드나 주최가 쓴 원문은 고치지 않는다(§1, 2026-11-09). 그래서 검사 대상은
// Roam이 쓴 칸만이다.
// - 하우스 아카이브 enrichment.summary: 주최 측 브랜드 디렉터리 소개 원문
//   (`scripts/gen-house-archive-enrichment.mjs`)이라 뺀다.
// - 마곡리빙마켓 enrichment.summary: 126건 중 67건이 주최 디렉터리의 브랜드 소개를
//   그대로 옮긴 글이다. `data/verified`의 directory 원문과 겹치는 summary만 빼고,
//   Roam이 쓴 나머지 59건은 검사한다(`isDirectoryOriginal`).
// - 인입 파일의 description, longDescription, category, 브랜드 intro, verified의
//   directory와 instagram: 브랜드나 주최 원문이라 뺀다.
// - 부스 이름은 고유명사라 시드 문구에서 이름을 지우고 본다.

const DOT = "·";

/** 합니다체 문장 끝. `들어섭니다`, `만듭니다`처럼 받침 ㅂ이 붙는 꼴까지 `니다`로 본다. */
const HAMNIDA = /[가-힣]니다(?=[.!?,\s]|$)/;

/**
 * 반말 문장 끝(해체 `~야`, `~있어`, `~해`, `~봐`와 한다체 `~다`). 해요체 규칙(§5) 위반.
 * 문장마다 마지막 낱말만 본다. 명사로 끝나는 메모("인파 몰림", "굿즈 챙기기")는 반말이 아니다.
 */
const BANMAL_END =
  /(?:[가-힣]야|거든|잖아|구나|있어|없어|좋아|많아|않아|같아|알아|남아|싫어|넓어|물어|워|[해돼봐와줘져여려혀싸나지네]|[가-힣]다)$/;

/** 반말 끝처럼 보이지만 명사나 제목인 낱말("영화에 관하여"). 실제 데이터에서 걸린 것만 적는다. */
const NOUN_ENDINGS = /(까지|관하여|챌린지|무가지|하나|올해|분야|이미지|패키지)$/;

/** 따옴표 안은 책 제목이나 브랜드 문구 인용이라 말투를 보지 않는다. */
const QUOTED = /'[^']*'|"[^"]*"|“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|〈[^〉]*〉|《[^》]*》/g;

/** 문자열의 반말 문장 끝 낱말들. */
function banmalEndings(text: string): string[] {
  return text
    .replace(QUOTED, "")
    .split(/[.!?…]+/)
    .map((s) => s.replace(/[\s"'“”‘’)\]」』>〉》]+$/u, "").trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).pop() ?? "")
    .filter((w) => /[가-힣]$/.test(w) && BANMAL_END.test(w) && !NOUN_ENDINGS.test(w));
}

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

/** 반말 문장 끝을 본다. */
const withBanmal = (pairs: [string, string][]) =>
  pairs
    .filter(([, s]) => banmalEndings(s).length > 0)
    .map(([p, s]) => `${p}: ${banmalEndings(s).join("/")} ← ${s}`);

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

/**
 * 반말 문장 끝까지 보는 enrichment 칸. 문장으로 쓰는 칸만 넣는다. memoryHooks,
 * goodsKeywords는 이름과 품목이라 뺀다(합니다체와 가운뎃점은 위에서 본다).
 *
 * roamInterpretation은 아직 뺀다. 운영 DB는 2026-11-03에 해요체로 옮겼지만
 * (`docs/decisions/2026-11-03_로미-한-줄-해요체-일괄-변환.md`) 레포 시드 파일은
 * 그때 바꾸지 않아 반말이 남아 있다. 운영 값과 맞춰 시드를 고칠 때 여기에 넣는다.
 */
const BANMAL_FIELDS = [
  "recommendationReasons",
  "thingsToDo",
  "timing",
  "conversationPrompts",
  "tips",
  "summary",
];

/** summary가 브랜드나 주최 원문인 전시. */
const BRAND_SOURCED_SUMMARY = new Set(["house-archive-2026"]);

const squash = (t: string) => t.replace(/[\s.,·"'’“”()\-—]/g, "");

interface DirectoryFact {
  summary?: string;
  directory?: { intro?: string; pr?: string };
}

/**
 * summary가 주최 디렉터리의 브랜드 소개 원문을 옮긴 것인가. "이름 — " 뒤 본문을
 * 20자씩 잘라 절반 넘게 원문 안에 있으면 원문으로 본다.
 */
function isDirectoryOriginal(summary: string, fact?: DirectoryFact): boolean {
  const d = fact?.directory;
  if (!d) return false;
  const source = squash(`${d.intro ?? ""}${d.pr ?? ""}`);
  const body = squash(summary.includes(" — ") ? summary.split(" — ").slice(1).join(" — ") : summary);
  const chunks: string[] = [];
  for (let i = 0; i < Math.max(1, body.length - 20); i += 20) chunks.push(body.slice(i, i + 20));
  return chunks.filter((c) => source.includes(c)).length / chunks.length > 0.5;
}

function loadVerifiedBooths(slug: string): Record<string, DirectoryFact> {
  try {
    const raw = JSON.parse(readFileSync(join(process.cwd(), "data/verified", `${slug}.json`), "utf8"));
    return raw.booths ?? {};
  } catch {
    return {};
  }
}

/** Roam 칸만 모은다. summary는 브랜드 원문이 아닐 때만 넣는다. */
function roamFieldsOf(e: Record<string, unknown>, slug: string, fact?: DirectoryFact) {
  const summary = typeof e.summary === "string" ? e.summary : "";
  const withSummary =
    !BRAND_SOURCED_SUMMARY.has(slug) && !!summary && !isDirectoryOriginal(summary, fact);
  return roamFields(e, withSummary);
}

function roamFields(e: Record<string, unknown>, withSummary: boolean) {
  const keys = withSummary ? [...ROAM_FIELDS, "summary"] : ROAM_FIELDS;
  return Object.fromEntries(keys.filter((k) => k in e).map((k) => [k, e[k]]));
}

/** Roam 칸 중 반말 검사를 거는 칸만. */
function banmalFields(roam: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(roam).filter(([k]) => BANMAL_FIELDS.includes(k)));
}

/** 가운뎃점, 합니다체, 반말을 한 번에 본다. */
function voiceIssues(roam: Record<string, unknown>, path: string) {
  return [...withDot(strings(roam, path)), ...withBanmal(strings(banmalFields(roam), path))];
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
    const issues = Object.entries(sibfEnrichment as Record<string, Record<string, unknown>>).flatMap(
      ([code, e]) => voiceIssues(roamFields(e, true), code),
    );
    expect(issues).toEqual([]);
  });

  it("SIF enrichment", () => {
    const issues = Object.entries(sifEnrichment as Record<string, Record<string, unknown>>).flatMap(
      ([code, e]) => voiceIssues(roamFields(e, true), code),
    );
    expect(issues).toEqual([]);
  });

  it("하우스 아카이브 enrichment(summary는 주최 원문이라 제외)", () => {
    const issues = Object.entries(haEnrichment as Record<string, Record<string, unknown>>).flatMap(
      ([code, e]) => voiceIssues(roamFields(e, false), code),
    );
    expect(issues).toEqual([]);
  });

  describe("data/intake 인입 파일의 enrichment", () => {
    const dir = join(process.cwd(), "data/intake");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && !f.startsWith("_"));
    for (const f of files) {
      it(f, () => {
        const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
        if (!Array.isArray(raw.booths)) return;
        const verified = loadVerifiedBooths(raw.exhibitionSlug);
        const issues = (raw.booths as { code: string; enrichment?: Record<string, unknown> }[])
          .filter((b) => b.enrichment)
          .flatMap((b) =>
            voiceIssues(roamFieldsOf(b.enrichment!, raw.exhibitionSlug, verified[b.code]), b.code),
          );
        expect(issues).toEqual([]);
      });
    }
  });

  it("마곡 summary 중 Roam이 쓴 59건을 검사 대상으로 잡는다", () => {
    const booths = loadVerifiedBooths("magok-livingmarket-2026");
    const roam = Object.values(booths).filter(
      (b) => b.summary && !isDirectoryOriginal(b.summary, b),
    );
    expect(roam.length).toBe(59);
  });

  describe("data/verified 확인 사실의 Roam 칸", () => {
    const dir = join(process.cwd(), "data/verified");
    const files = readdirSync(dir).filter((f) => f.endsWith(".json"));
    for (const f of files) {
      it(f, () => {
        const raw = JSON.parse(readFileSync(join(dir, f), "utf8"));
        const slug: string = raw.exhibitionSlug ?? f.replace(/\.json$/, "");
        const issues = Object.entries((raw.booths ?? {}) as Record<string, Record<string, unknown>>).flatMap(
          ([code, v]) => voiceIssues(roamFieldsOf(v, slug, v as DirectoryFact), code),
        );
        expect(issues).toEqual([]);
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

  it("mock 시드의 행사 소개와 안내는 해요체(합니다체, 반말 없음)", () => {
    const pairs = [
      ["sibf", exhibition],
      ["sif", sifExhibition],
      ["magok", mlmExhibition],
      ["house-archive", haExhibition],
    ].flatMap(([slug, e]) => {
      const x = e as typeof exhibition;
      return strings({ description: x.description, tips: x.tips }, slug as string);
    });
    expect([...withDot(pairs), ...withBanmal(pairs)]).toEqual([]);
  });

  it("반말 검사가 실제 반말과 한다체를 잡고 명사 메모는 넘긴다", () => {
    expect(banmalEndings("저자를 가까이서 볼 수 있어.")).toEqual(["있어"]);
    expect(banmalEndings("소장각 굿즈가 쏠쏠해.")).toEqual(["쏠쏠해"]);
    expect(banmalEndings("화제인 부스야.")).toEqual(["부스야"]);
    expect(banmalEndings("셀러존은 물량이 적어 초반이 낫다")).toEqual(["낫다"]);
    expect(banmalEndings("6/24 오후 등장 전후 인파 최대")).toEqual([]);
    expect(banmalEndings("화제신간 '믿지만, 거기까지'.")).toEqual([]);
    expect(banmalEndings("저자를 가까이서 볼 수 있어요.")).toEqual([]);
  });

  it("mock 시드가 합성한 부스 설명(부스 이름은 빼고 본다)", () => {
    const pairs = [...booths, ...sifBooths, ...mlmBooths].map(
      (b): [string, string] => [b.code ?? b.id, (b.description ?? "").split(b.name).join("")],
    );
    expect(withDot(pairs, true)).toEqual([]);
  });
});
