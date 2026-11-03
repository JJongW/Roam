// 말투 변환 게이트 — 공식 소개 원문을 Roam 말투로 바꾼 문장이 **내용은 그대로인지**를
// 결정적으로 검사한다. 순수 함수, LLM 없음(2026-11-03 Ted 결정).
//
// 변환은 워커(LLM)가 하지만, 통과 여부는 여기 규칙이 정한다("서비스가 판단, LLM은 말만").
// 못 넘으면 그 칸은 ai_draft로 남아 사람이 본다.
//
// 기준: Roam-design docs/brand/00_brand-rules.md(해요체, "전시" 금지, 가운뎃점 금지,
// 근거 없는 단정과 과장 금지)와 02_voice-tone.md §1-4, §4-7(금칙어).
//
// 이 게이트가 못 보는 것(사람 몫): 뜻이 미묘하게 바뀌었는지, 문장이 자연스러운지.
// 그래서 보존 검사는 "빠지거나 새로 생기면 실패"로 보수적으로 잡는다.

export interface GateResult {
  ok: boolean;
  issues: string[];
}

export interface GateInput {
  original: string;
  display: string;
  /** 반드시 남아야 하는 말 — 브랜드 이름, 작가명, 품목, 굿즈 키워드 등. 원문에 있는 것만 검사한다. */
  protectedTerms?: string[];
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

export function checkToneConversion(input: GateInput): GateResult {
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
