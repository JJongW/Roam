// 소개 변환 게이트 — 공식 소개 원문을 Roam 말투로 다시 쓴 소개(display)가 **원문에 없는 말을 더하지 않았는지**,
// Roam 말투와 문단 모양을 지켰는지 결정적으로 검사한다. 순수 함수, LLM 없음(2026-11-03 Ted 결정).
//
// 변환은 워커(LLM)가 하지만, 통과 여부는 여기 규칙이 정한다("서비스가 판단, LLM은 말만").
// 못 넘으면 그 칸은 ai_draft로 남아 사람이 본다.
//
// 기준: Roam-design docs/brand/00_brand-rules.md(해요체, "전시" 금지, 가운뎃점 금지,
// 근거 없는 단정과 과장 금지)와 02_voice-tone.md §1-4, §4-7(금칙어).
//
// 2026-11-28 바뀐 것(docs/decisions/2026-11-28_브랜드-소개-정돈.md):
//  - 변환본은 원문을 줄인 짧은 소개(문단 2~3개)다. 그래서 "원문의 숫자, 영문, 품목이 빠지면 실패"를 뺐다.
//    대신 원문에 없는 숫자, 영문, 과장이 **생기면** 실패는 그대로 둔다(사실만, 원문보다 크게 말하지 않기).
//  - 인스타 아이디, 링크, 메일, 해시태그, 이모지가 남으면 실패. 옛 게이트는 원문의 @계정과 URL을
//    "지켜야 할 표기"로 봐서 거꾸로 남기게 했다.
//  - 브랜드의 1인칭(저, 제, 저희)과 방문객을 부르는 말(여러분, 당신)이 남으면 실패. 이 글의 화자는 Roam이다.
//  - 문단 모양(intro-tidy.ts introFormatIssues): 문단 안 줄바꿈, 문단 수, 길이.
//
// 이 게이트가 못 보는 것(사람 몫): 뜻이 미묘하게 바뀌었는지, 원문에 없는 한국어 주장이 끼었는지, 문장이 자연스러운지.
import { introFormatIssues, stripContactBits } from "@/lib/brands/intro-tidy";

export interface GateResult {
  ok: boolean;
  issues: string[];
}

export interface GateInput {
  original: string;
  display: string;
  /** 브랜드 이름, 작가명, 품목 등 고유한 말. 이 안에 든 "전시"는 고유명사로 보고 허용한다(2026-11-28부터 빠져도 실패가 아니다). */
  protectedTerms?: string[];
  /** 이 브랜드가 나온 행사 이름. 소개는 다른 박람회 부스에도 나가므로 행사 이름이 들어가면 실패. */
  fairNames?: string[];
}

/** 원문에 없던 말이 새로 생기면 과장이나 단정이다(02_voice-tone §1-4, §4-7). */
const HYPE = [
  "최고",
  "최초",
  "유일",
  "완벽",
  "무조건",
  "반드시",
  "확실히",
  "강추",
  "놓치면 후회",
  "필수",
  "꼭 가",
  "대박",
  "역대급",
  "압도적",
];

/** 해요체가 아닌 종결(합니다체, 평서 반말). 문장 끝만 본다. */
const NON_HAEYO_END = /(습니다|입니다|합니다|됩니다|니다|한다|있다|없다|이다|된다|었다|았다|했다|함|음|임)$/;

function sentences(s: string): string[] {
  return s
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?。])\s+|\n+/)
    .map((x) => x.trim())
    .filter(Boolean);
}

function stripEnd(s: string): string {
  return s.replace(/[\s.!?。~)"'”’]+$/u, "");
}

/** 숫자는 쉼표를 걷고 비교한다(3,000 = 3000). */
function numbers(s: string): string[] {
  return (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ""));
}

/** 라틴 문자 단어(브랜드명, 영문 표기), @계정, URL — 고유명사로 보고 그대로 남아야 한다. */
function latinTokens(s: string): string[] {
  const urls = s.match(/https?:\/\/\S+/g) ?? [];
  const rest = urls.reduce((t, u) => t.replace(u, " "), s);
  const handles = rest.match(/@[\w.]+/g) ?? [];
  const words = (rest.replace(/@[\w.]+/g, " ").match(/[A-Za-z][A-Za-z0-9&'.-]*[A-Za-z0-9]|[A-Za-z]{2,}/g) ?? []).filter(
    (w) => w.length >= 2,
  );
  return [...urls, ...handles, ...words];
}

/** 따옴표나 괄호 안의 말 — 작품명, 캐릭터 이름처럼 이름으로 쓰인 말. */
function quoted(s: string): string[] {
  const out: string[] = [];
  for (const re of [/[‘'“"「『<《]([^‘'“"「『<《’'”"」』>》]{1,40})[’'”"」』>》]/g]) {
    for (const m of s.matchAll(re)) out.push(m[1].trim());
  }
  return out.filter(Boolean);
}

/** 한글 음절에 받침이 있나. */
export function hasBatchim(ch: string): boolean {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c <= 11171 && c % 28 !== 0;
}

function multiset(xs: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return m;
}

/** 행사 이름과 그 알맹이("새해 준비상점 N.27" → "새해 준비상점", "제25회 서울카페쇼 2026" → "서울카페쇼"). */
export function fairNameForms(name: string): string[] {
  const full = name.trim();
  let core = full.split(/[:：]/)[0].trim();
  for (let i = 0; i < 3; i++)
    core = core
      .replace(/^(?:제\s*\d+\s*회|\d{4})\s*/u, "")
      .replace(/\s*(?:\d{4}|N\.\s*\d+|vol\.?\s*\d+)$/iu, "")
      .trim();
  return [...new Set([full, core])];
}

/** 브랜드 1인칭과 방문객 호칭. 화자가 Roam인 글에 남으면 안 된다. 읽는 사람 시점의 "나만의", "나에게 맞는"은 허용(2026-11-03 Ted). */
const FIRST_PERSON = /(?:^|[\s(“"'‘])(저는|저도|제가|저희|저의|제)(?=[\s,.]|$)/u;
const ADDRESS = /여러분|당신/u;
/** 팔로우나 연락을 권하는 말 — 연락처를 뺀 뒤에도 안내 문장만 남는 자리. */
const CONTACT_CTA = /팔로우|디엠|\bDM\b|문의\s*(?:주|하|는|사항)|놀러\s*오세요/iu;

/**
 * 두 가지 글을 본다.
 *  - mode "tone"(기본): 말투만 바꾼 글. 로미 한 줄 변환(enrichment/haeyo-convert.ts)이 쓴다. 내용 보존이 엄격하다.
 *  - mode "intro": 브랜드 소개를 Roam 소개로 다시 쓴 글(2026-11-28). 줄여도 되고, 연락처와 1인칭과 문단 모양을 본다.
 */
export function checkToneConversion(input: GateInput & { mode?: "tone" | "intro" }): GateResult {
  return input.mode === "intro" ? checkIntroRewrite(input) : checkToneOnly(input);
}

/** 말투만 바꾼 글(로미 한 줄 등, haeyo-convert.ts): 원문의 숫자, 영문, 이름, 품목이 그대로 남아야 한다. 2026-11-03 규칙 그대로. */
function checkToneOnly(input: GateInput): GateResult {
  const issues: string[] = [];
  const original = input.original.trim();
  const display = input.display.trim();
  if (!display) return { ok: false, issues: ["바꾼 문장이 비어 있어요"] };

  // 1. 숫자: 빠지거나 새로 생기면 안 된다(가격, 연도, 개수).
  const on = multiset(numbers(original));
  const dn = multiset(numbers(display));
  for (const [n, c] of on) if ((dn.get(n) ?? 0) < c) issues.push(`숫자가 빠졌어요: ${n}`);
  for (const [n] of dn) if (!on.has(n)) issues.push(`원문에 없는 숫자가 생겼어요: ${n}`);

  // 2. 고유명사: 영문 표기, @계정, URL, 따옴표 안의 이름.
  const dl = display.toLowerCase();
  for (const t of new Set([...latinTokens(original), ...quoted(original)]))
    if (!dl.includes(t.toLowerCase())) issues.push(`이름이나 표기가 빠졌어요: ${t}`);
  for (const t of new Set(latinTokens(display)))
    if (!original.toLowerCase().includes(t.toLowerCase())) issues.push(`원문에 없는 영문 표기가 생겼어요: ${t}`);

  // 3. 지켜야 할 말(브랜드명, 작가명, 품목): 원문에 있으면 바꾼 문장에도 있어야 한다.
  for (const t of new Set((input.protectedTerms ?? []).map((x) => x.trim()).filter((x) => x.length >= 2)))
    if (original.includes(t) && !display.includes(t)) issues.push(`지켜야 할 말이 빠졌어요: ${t}`);

  // 4. 말투: 해요체. 문장마다 끝을 본다.
  for (const s of sentences(display)) {
    const end = stripEnd(s);
    if (!end) continue;
    if (NON_HAEYO_END.test(end)) issues.push(`해요체가 아닌 문장이 있어요: ${s.slice(-20)}`);
    else if (!/요$/.test(end) && /[가-힣]$/.test(end)) issues.push(`문장 끝을 해요체로 맺어 주세요: ${s.slice(-20)}`);
  }

  // 4-1. 받침 없는 말 뒤 "이에요"(브랜드이에요)는 "예요"가 맞다. 기계 변환이 자주 틀리는 자리.
  for (const m of display.matchAll(/([가-힣])이에요/g))
    if (!hasBatchim(m[1]) && !original.includes(m[0])) issues.push(`"${m[1]}이에요"는 "${m[1]}예요"로 써 주세요`);

  // 5. 브랜드 규칙 표기: "전시" 금지(원문 고유명사에 들어 있으면 그 고유명사로만), 가운뎃점 금지.
  const protectedWithJeonsi = [...latinTokens(original), ...quoted(original), ...(input.protectedTerms ?? [])].filter((t) =>
    t.includes("전시"),
  );
  let jeonsiScan = display;
  for (const t of protectedWithJeonsi) jeonsiScan = jeonsiScan.split(t).join(" ");
  if (jeonsiScan.includes("전시")) issues.push(`"전시"라는 말이 있어요. 박람회, 페어, 행사로 바꿔 주세요`);
  if (display.includes("·")) issues.push("가운뎃점이 있어요. 쉼표나 와, 과로 바꿔 주세요");

  // 6. 과장과 단정: 원문에 없던 말이 생기면 실패.
  for (const w of HYPE) if (display.includes(w) && !original.includes(w)) issues.push(`원문에 없는 과장이나 단정이 생겼어요: ${w}`);
  const bangs = (display.match(/!/g) ?? []).length;
  if (bangs > 1 && bangs > (original.match(/!/g) ?? []).length) issues.push("느낌표가 늘었어요");

  // 7. 길이: 말투만 바꾸면 길이가 크게 달라지지 않는다. 많이 줄면 내용이 빠진 것, 많이 늘면 덧붙인 것.
  const ratio = display.length / Math.max(1, original.length);
  if (ratio < 0.6) issues.push(`원문보다 너무 짧아요(${Math.round(ratio * 100)}%)`);
  if (ratio > 1.6) issues.push(`원문보다 너무 길어요(${Math.round(ratio * 100)}%)`);

  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}

function checkIntroRewrite(input: GateInput): GateResult {
  const issues: string[] = [];
  const original = input.original.trim();
  const display = input.display.trim();
  if (!display) return { ok: false, issues: ["바꾼 문장이 비어 있어요"] };
  // 비교의 기준은 연락처와 꾸밈을 뺀 원문이다 — 원문의 @계정과 URL은 변환본에 남으면 안 되는 것이지 지킬 말이 아니다.
  const base = stripContactBits(original);
  // 숫자와 영문 비교에는 브랜드 이름 같은 지킬 말도 넣는다("스튜디오604는", "Studio Siso는"을 주어로 쓰는 건 지어낸 게 아니다).
  const known = [base, ...(input.protectedTerms ?? [])].join("\n");

  // 1. 숫자: 원문에 없는 숫자가 생기면 안 된다(가격, 연도, 개수를 지어내지 않기). 줄이며 빠지는 건 괜찮다.
  const on = multiset(numbers(known));
  for (const [n] of multiset(numbers(display))) if (!on.has(n)) issues.push(`원문에 없는 숫자가 생겼어요: ${n}`);

  // 2. 영문 표기: 원문에 없던 영문이 생기면 실패.
  const bl = known.toLowerCase();
  for (const t of new Set(latinTokens(display)))
    if (!bl.includes(t.toLowerCase())) issues.push(`원문에 없는 영문 표기가 생겼어요: ${t}`);

  // 3. 말투: 해요체. 문장마다 끝을 본다.
  for (const s of sentences(display)) {
    const end = stripEnd(s);
    if (!end) continue;
    if (NON_HAEYO_END.test(end)) issues.push(`해요체가 아닌 문장이 있어요: ${s.slice(-20)}`);
    else if (!/요$/.test(end) && /[가-힣]$/.test(end)) issues.push(`문장 끝을 해요체로 맺어 주세요: ${s.slice(-20)}`);
    // 권유와 명령(~해 보세요, ~오세요)은 결정을 방문객에게서 가져간다(02_voice-tone §1-5).
    if (/(?:세요|십시오)$/.test(end)) issues.push(`방문객에게 권하는 문장이 있어요: ${s.slice(-20)}`);
    // 주어 없는 바람("~기를 바라요", "~길 바라요")은 Roam이 바라는 말로 읽힌다(사실만, 확신 키우지 않기).
    // 브랜드의 바람은 "~를 바라는 마음으로 만들어요"처럼 브랜드가 주어인 사실로 쓴다.
    if (/(?:기를|길|기)\s*바라요$/u.test(end)) issues.push(`누가 바라는지 모르는 문장이 있어요: ${s.slice(-20)}`);
  }

  // 3-1. 이에요와 예요: 받침(유니코드 (code - 0xAC00) % 28) 있는 말 뒤 "이에요", 없는 말 뒤 "예요".
  // 영문이나 숫자로 끝나는 말 뒤는 읽는 소리를 몰라 건너뛴다(정규식이 한글 음절만 잡는다).
  for (const m of display.matchAll(/([가-힣])이에요/g))
    if (!hasBatchim(m[1]) && !original.includes(m[0])) issues.push(`"${m[1]}이에요"는 "${m[1]}예요"로 써 주세요`);
  for (const m of display.matchAll(/([가-힣])예요/g))
    if (hasBatchim(m[1]) && !original.includes(m[0])) issues.push(`"${m[1]}예요"는 "${m[1]}이에요"로 써 주세요`);
  // "고양이에요"는 받침 계산으로 못 가른다("고양 + 이에요"로도 읽힌다). 원문이 "고양이예요", "고양이입니다"처럼
  // "이"로 끝나는 말로 썼으면 "고양이예요"가 맞다(2026-11-28 드라이런에서 원문 "고양이예요"를 "고양이에요"로 바꿨다).
  for (const m of display.matchAll(/([가-힣]+)이에요/g)) {
    const w = `${m[1].slice(-4)}이`;
    if (new RegExp(`${w}(?:예요|입니다|이다|이에요)`, "u").test(original) && !original.includes(`${w}에요`))
      issues.push(`"${w}에요"는 "${w}예요"로 써 주세요`);
  }

  // 3-2. 화자: Roam이 브랜드를 소개하는 글이다. 브랜드 1인칭과 방문객 호칭을 쓰지 않는다(브랜드 규칙 §5).
  const fp = display.match(FIRST_PERSON);
  if (fp) issues.push(`브랜드가 자기를 가리키는 말이 남았어요: ${fp[1]}`);
  const ad = display.match(ADDRESS);
  if (ad) issues.push(`방문객을 부르는 말이 남았어요: ${ad[0]}`);
  if (CONTACT_CTA.test(display)) issues.push("팔로우나 연락 안내가 남았어요");
  // "드려요"는 Roam이 해 주는 일로 읽힌다(haeyo-convert.ts 지침과 같은 판단). 원문에 "드리"가 없으면 실패.
  if (/드려요|드릴게요|드립니다/u.test(display) && !/드리|드려/u.test(original)) issues.push("드려요는 Roam이 하는 일로 읽혀요. 브랜드가 하는 일로 써 주세요");
  // 소개는 브랜드에 하나라 다른 박람회 부스 화면에도 나간다(intro.ts). 회차를 가리키는 말이 있으면 다음 회차에 틀린 말이 된다.
  const ep = display.match(/이번\s*(?:행사|박람회|페어|마켓|회차)/u);
  if (ep) issues.push(`한 회차에만 맞는 말이 있어요: ${ep[0]}`);
  const squash = (x: string) => x.replace(/\s+/g, "");
  for (const n of new Set((input.fairNames ?? []).flatMap(fairNameForms).filter((x) => x.length >= 3)))
    if (squash(display).includes(squash(n))) issues.push(`행사 이름이 들어 있어요: ${n}`);
  // 원문의 "여러분"을 "방문객"으로 옮기는 일이 표본에서 나왔다("방문객의 일상에"). 방문객을 3인칭으로 부르지도 않는다.
  if (display.includes("방문객") && !original.includes("방문객")) issues.push("방문객을 부르는 말이 남았어요: 방문객");

  // 4. 브랜드 규칙 표기: "전시" 금지(원문 고유명사에 들어 있으면 그 고유명사로만), 가운뎃점 금지.
  const protectedWithJeonsi = [...latinTokens(original), ...quoted(original), ...(input.protectedTerms ?? [])].filter((t) =>
    t.includes("전시"),
  );
  // "에이전시", "발전시켜요", "충전시"처럼 낱말 안에 "전시"가 우연히 든 말은 뺀다(2026-11-28 드라이런에서 "에이전시"가 걸렸다).
  let jeonsiScan = display.replace(/에이전시|발전시|충전시|전시간/gu, " ");
  for (const t of protectedWithJeonsi) jeonsiScan = jeonsiScan.split(t).join(" ");
  if (jeonsiScan.includes("전시")) issues.push(`"전시"라는 말이 있어요. 박람회, 페어, 행사로 바꿔 주세요`);
  if (display.includes("·")) issues.push("가운뎃점이 있어요. 쉼표나 와, 과로 바꿔 주세요");

  // 5. 과장과 단정: 원문에 없던 말이 생기면 실패.
  for (const w of HYPE) if (display.includes(w) && !original.includes(w)) issues.push(`원문에 없는 과장이나 단정이 생겼어요: ${w}`);
  const bangs = (display.match(/!/g) ?? []).length;
  if (bangs > 1 && bangs > (original.match(/!/g) ?? []).length) issues.push("느낌표가 늘었어요");

  // 6. 길이: 줄인 소개라도 원문 대부분을 버리면 내용이 빠진 것, 원문보다 많이 길면 덧붙인 것.
  const baseLen = base.replace(/\s+/g, " ").trim().length;
  const min = Math.min(Math.round(baseLen * 0.3), 80);
  const max = Math.max(Math.round(baseLen * 1.3), baseLen + 30);
  if (display.length < min) issues.push(`원문보다 너무 짧아요(${Math.round((display.length / Math.max(1, baseLen)) * 100)}%)`);
  if (display.length > max) issues.push(`원문보다 너무 길어요(${Math.round((display.length / Math.max(1, baseLen)) * 100)}%)`);

  // 7. 문단 모양과 연락처(intro-tidy.ts).
  issues.push(...introFormatIssues(display));

  return { ok: issues.length === 0, issues: [...new Set(issues)] };
}
