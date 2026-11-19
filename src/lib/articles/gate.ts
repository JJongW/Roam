// 아티클 게이트 — 저장 직전에 한 번. 순수, LLM 없음. 하나라도 걸리면 그 판본은 저장하지 않는다(fail closed).
//
// 두 갈래를 본다.
// 1. 말투(Roam이 쓴 글: 제목, 미리보기, 문단, 소제목). 기준은 00_brand-rules §1, §5와 02_voice-tone §1, §4.
//    해요체 검사는 워커 초안기와 같은 `roam-voice.ts`(PR #179)를 쓴다 — 규칙이 두 곳에서 갈리면 안 된다.
// 2. 근거. 문단의 숫자와 영문 표기는 그 문단이 가리킨 출처 글에 있어야 하고, 인용은 브랜드가 쓴 원문의
//    한 글자도 다르지 않은 조각이어야 한다(메모 card-news-copy-style, generated-review-allowed).
//
// 게이트가 못 보는 것(사람 몫, 슬랙 승인): 한글 낱말로 지어낸 사실, 뜻이 미묘하게 바뀐 문장, 자연스러움.
import { banmalEndings, contentFlags, OFFICIAL_DOT_NAMES, voiceIssues } from "@/lib/booth/roam-voice";
import { hasHamnida } from "@/lib/booth/summary-voice";
import type { ArticleBlock, ArticleSource } from "@/lib/types";

export interface GateInput {
  title: string;
  excerpt: string;
  body: ArticleBlock[];
  sources: ArticleSource[];
  protectedTerms: string[];
  /** Roam이 이 글 안에서 센 수(모음에 담은 브랜드 수 등). 출처 글에는 없지만 지어낸 숫자가 아니다. */
  derivedNumbers?: number[];
}

export interface GateResult {
  ok: boolean;
  issues: string[];
}

export const TITLE_MAX = 60;
export const EXCERPT_MAX_GATE = 300;

/**
 * Roam이 쓰는 글에 나오면 안 되는 말. 근거: 02_voice-tone §1-4(과장), §4-4(동선 효율), §4-7(단정, 압박, AI 문구),
 * 00_brand-rules §5(로미는 추천자가 아니다, 취향을 아는 척 금지), 메모 card-news-roam-only-content-plan(배제하는 말).
 */
export const BANNED: { word: string; why: string }[] = [
  ...["최고", "최초", "유일", "완벽", "강추", "대박", "역대급", "압도적", "놓치면", "후회"].map((w) => ({ word: w, why: "과장" })),
  ...["무조건", "반드시", "확실히", "꼭 가", "필수"].map((w) => ({ word: w, why: "단정이나 압박" })),
  ...["최적 동선", "효율적", "빠르게 다 보"].map((w) => ({ word: w, why: "검증 안 된 효율 주장" })),
  ...["AI가 분석", "AI가 골", "알고리즘"].map((w) => ({ word: w, why: "AI 문구" })),
  ...["취향 저격", "취향에 딱", "취향에 맞", "취향을 알", "좋아하실 거", "마음에 드실", "당신 취향"].map((w) => ({
    word: w,
    why: "취향을 아는 척",
  })),
  ...["로미가 추천", "로미가 골", "추천해요", "추천드려요", "추천해 드려요"].map((w) => ({ word: w, why: "추천자 화법(로미는 동행자)" })),
  ...["다 볼 필요", "안 봐도", "건너뛰"].map((w) => ({ word: w, why: "부스를 배제하는 말" })),
];

/** 사람을 부르는 말. 주어를 뺀다(02_voice-tone §1-1). "제가"는 로미의 말이라 Roam 화자 글엔 없다(§7-1). */
const ADDRESS_OR_SELF = /당신|(^|[\s,("'“‘])(너|네가|너의|너한테|제가|저는|저희)(?=[\s,.!?은는이가을를의도에]|$)/;

const PLACEHOLDER = "이름";

/** 고유명사를 가린다(긴 것부터). 브랜드 이름이 '~다', '~나'로 끝나도 반말로 잡지 않게, 행사명의 "전시"도 예외로. */
export function maskTerms(text: string, terms: string[]): string {
  let out = text;
  for (const t of [...new Set(terms)].filter((x) => x.trim().length > 0).sort((a, b) => b.length - a.length))
    out = out.split(t).join(PLACEHOLDER);
  return out;
}

function sentences(s: string): string[] {
  return s
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

const numbersOf = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
const latinOf = (s: string) => s.match(/[A-Za-z][A-Za-z0-9&'.-]*[A-Za-z0-9]|[A-Za-z]/g) ?? [];

/** Roam이 쓴 글 하나의 말투. `kind`가 label이면(제목, 소제목) 명사로 끝나도 된다(02_voice-tone §7-1). */
export function voiceCheck(text: string, terms: string[], kind: "prose" | "label"): string[] {
  const issues: string[] = [];
  const masked = maskTerms(text, terms);
  const where = `"${text.slice(0, 30)}${text.length > 30 ? "…" : ""}"`;
  if (masked.includes("전시")) issues.push(`"전시"가 있어요(박람회, 페어, 행사로): ${where}`);
  // 가운뎃점은 고유명사로 가리지 않는다 — 이름에 붙어 온 가운뎃점도 Roam 글에선 걷는다(displayBrandName).
  // 공식 표기에 가운뎃점이 든 이름만 예외(roam-voice와 같은 목록).
  if (OFFICIAL_DOT_NAMES.reduce((t, n) => t.split(n).join(""), text).includes("·")) issues.push(`가운뎃점이 있어요: ${where}`);
  if (/[—–]/.test(masked)) issues.push(`대시가 있어요: ${where}`);
  for (const b of BANNED) if (masked.includes(b.word)) issues.push(`${b.why}: "${b.word}" ${where}`);
  if (ADDRESS_OR_SELF.test(masked)) issues.push(`호칭이나 1인칭이 있어요(주어를 빼요): ${where}`);
  for (const f of contentFlags(masked)) issues.push(`${f}: ${where}`);
  if (kind === "label") {
    if (hasHamnida(masked)) issues.push(`합니다체: ${where}`);
    for (const w of banmalEndings(masked)) issues.push(`반말 '${w}': ${where}`);
    if (/[.]$/.test(text.trim())) issues.push(`제목에 마침표가 있어요: ${where}`);
    return issues;
  }
  for (const v of voiceIssues(masked)) issues.push(`${v}: ${where}`);
  // 문장마다 해요체로 맺었나. 명사로 끊긴 조각도 문단에선 안 된다.
  for (const s of sentences(masked)) {
    const end = s.replace(/[\s.!?"'”’)\]]+$/u, "");
    if (/[가-힣]$/.test(end) && !/(요|죠)$/.test(end)) issues.push(`해요체로 맺지 않은 문장: "…${s.slice(-20)}"`);
  }
  return issues;
}

export function checkArticle(input: GateInput): GateResult {
  const issues: string[] = [];
  const sources = new Map(input.sources.map((s) => [s.id, s]));
  const terms = input.protectedTerms;

  // 길이
  if (!input.title.trim()) issues.push("제목이 비었어요");
  if (input.title.length > TITLE_MAX) issues.push(`제목이 ${TITLE_MAX}자를 넘어요`);
  if (!input.excerpt.trim()) issues.push("미리보기 글이 비었어요");
  if (input.excerpt.length > EXCERPT_MAX_GATE) issues.push(`미리보기 글이 ${EXCERPT_MAX_GATE}자를 넘어요`);
  if (!input.body.some((b) => b.type === "paragraph")) issues.push("Roam이 쓴 문단이 없어요");
  if (input.sources.length === 0) issues.push("출처가 없어요");

  // 말투
  issues.push(...voiceCheck(input.title, terms, "label"));
  issues.push(...voiceCheck(input.excerpt, terms, "prose"));
  const roamTexts: string[] = [input.title, input.excerpt];
  for (const b of input.body) {
    if (b.type === "quote") {
      // 인용 글은 브랜드 것이라 보지 않지만, 출처 표시(attribution)는 Roam이 쓴 말이다.
      issues.push(...voiceCheck(b.attribution, terms, "label"));
      continue;
    }
    roamTexts.push(b.text);
    issues.push(...voiceCheck(b.text, terms, b.type === "heading" ? "label" : "prose"));
  }
  // 느낌표는 한 편에 한 번까지(메모 card-news-copy-style, 2026-11-03). 미리보기는 문단을 되풀이하니 빼고 센다.
  const bangs = roamTexts.filter((_, i) => i !== 1).join("").split("!").length - 1;
  if (bangs > 1) issues.push(`느낌표가 ${bangs}개예요(한 편에 하나까지)`);

  // 근거
  const allSourceText = input.sources.map((s) => s.text).join("\n");
  const grounded = (text: string, basis: string, where: string) => {
    const masked = maskTerms(text, terms);
    const basisNumbers = new Set([...numbersOf(basis), ...(input.derivedNumbers ?? []).map(String)]);
    for (const n of numbersOf(masked)) if (!basisNumbers.has(n)) issues.push(`출처에 없는 숫자 ${n}: ${where}`);
    const basisLower = basis.toLowerCase();
    for (const w of latinOf(masked)) if (!basisLower.includes(w.toLowerCase())) issues.push(`출처에 없는 영문 표기 ${w}: ${where}`);
  };
  grounded(input.title, allSourceText, "제목");
  grounded(input.excerpt, allSourceText, "미리보기");
  input.body.forEach((b, i) => {
    const where = `${i + 1}번째 덩어리`;
    if (b.type === "quote") {
      const s = sources.get(b.sourceId);
      if (!s) issues.push(`인용의 출처가 목록에 없어요: ${where}`);
      else if (!s.brandWritten) issues.push(`브랜드가 쓴 글이 아닌 출처를 인용했어요: ${where}`);
      else if (!b.text.trim() || !s.text.includes(b.text)) issues.push(`인용이 원문과 달라요(한 글자도 고치지 않아요): ${where}`);
      return;
    }
    if (b.sourceIds.length === 0) issues.push(`출처 없는 문장: ${where}`);
    const missing = b.sourceIds.filter((id) => !sources.has(id));
    if (missing.length) issues.push(`목록에 없는 출처 ${missing.join(", ")}: ${where}`);
    grounded(
      b.text,
      b.sourceIds
        .map((id) => sources.get(id)?.text ?? "")
        .concat(b.sourceIds.map((id) => sources.get(id)?.label ?? ""))
        .join("\n"),
      where,
    );
  });

  const uniq = [...new Set(issues)];
  return { ok: uniq.length === 0, issues: uniq };
}
