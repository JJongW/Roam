// 브랜드 소개 정돈 — Roam이 보여 주는 소개 문장(intro.display)의 모양을 고르는 순수 함수(2026-11-28 Ted 요청).
//
// Ted: "줄바꿈도 제대로 안 되어 있고 문단 분리나 읽기가 편하지도 않고 안에 인스타 주소가 있거나 하는 경우가 있음."
// 결정 기록: docs/decisions/2026-11-28_브랜드-소개-정돈.md.
//
// 브랜드가 쓴 원문(intro.original)에는 쓰지 않는다(브랜드 규칙 §1, §5 예외). 원문은 그대로 원천으로 남고,
// 이 함수는 Roam이 쓴 변환본에만 쓴다. 두 군데서 부른다.
//  1. 워커가 말투 변환(LLM)을 받은 직후, 게이트(tone-gate.ts)에 넣기 전(draft.ts).
//  2. 부스 화면에 내보낼 때(intro.ts) — 이미 저장된 변환본도 다시 만들기 전부터 같은 모양으로 나가게.
//
// 문단 규칙(숫자 근거는 결정 기록 "문단 규칙"):
//  - 문단 사이는 빈 줄 하나(\n\n). 문단 안에서는 줄을 바꾸지 않는다. 웹은 whitespace-pre-line,
//    iOS는 Text가 \n을 그대로 줄바꿈으로 그리므로, 문장 중간의 \n은 두 화면 다 문장 중간에서 끊긴다.
//  - 문단은 최대 3개. 문단 하나가 길면 문장 경계에서 나눈다.
//  - 인스타 아이디, 링크, 메일, 해시태그, 이모지는 뺀다. 브랜드 인스타는 링크 칸(links)과 부스 instagramUrl이 따로 맡는다.

/** 문단 수 상한. 브랜드 칸은 "짤막한 설명"(UI 24, 11-25 Ted)이고 문단 2~3개가 목표다. */
export const INTRO_MAX_PARAGRAPHS = 3;
/** 문단 하나의 글자 수 상한(공백 포함). 부스 상세 브랜드 칸 폭(375pt 기기 약 297pt, 16pt 글자)에서 한 줄 약 19자, 7줄 남짓. */
export const INTRO_MAX_PARAGRAPH_CHARS = 140;
/** 전체 글자 수 상한. 브랜드 칸이 화면 한 장(약 14줄)을 넘지 않게. */
export const INTRO_MAX_CHARS = 260;
/** 이 길이를 넘는데 문단이 하나면 한 덩어리 장문으로 본다. */
export const INTRO_SINGLE_BLOCK_CHARS = 130;
/** 프롬프트가 권하는 길이(게이트 상한보다 여유 있게). */
export const INTRO_TARGET_CHARS = 220;

const EMAIL_RE = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const URL_RE = /(?:https?:\/\/|www\.)[^\s)\]}>"'”’,]+/gi;
const DOMAIN_RE =
  /(?<![@\w.])[a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)*\.(?:com|net|org|kr|co\.kr|me|shop|store|io|link|site|xyz|ly)(?:\/[^\s)\]}>"'”’,]*)?/gi;
const HANDLE_RE = /(^|[^\w@])@[A-Za-z0-9_.]{2,30}/g;
const HASHTAG_RE = /(^|[\s(（])#[^\s#]+/g;
/** 이모지와 이모지를 잇는 글자(변형 선택자, ZWJ, 키캡), 국기 글자. */
const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{FE0E}\u{200D}\u{20E3}\u{1F1E6}-\u{1F1FF}]/gu;
/** 꾸밈 기호. 이모지 범주에 안 드는 것들. */
const DECOR_RE = /[★☆♡♥♧♤◆◇■□▪▫●○◎※✓✔︎✦✧❥➤►▶︎▷→⇒]/gu;
/** 줄 머리 목록 표시. */
const BULLET_HEAD_RE = /^[\s\-–—•·▪●○◆◇■□★☆♡♥✔✓※>*]+/u;
/** 안내 낱말만 있는 줄(연락처를 빼고 남은 것 포함) — 통째로 지운다. */
const CONTACT_ONLY_LINE_RE =
  /^(?:[\s:：\-–—|/,.()[\]（）<>『』「」"'“”‘’]|인스타그램|인스타|instagram|insta|ig|홈페이지|웹사이트|사이트|스토어|스마트스토어|온라인|링크|link|문의|dm|디엠|카카오톡|카톡|채널|트위터|twitter|유튜브|youtube|블로그|blog|이메일|메일|email|e-mail|contact|shop|web|site|및|또는|or|and|&)*$/iu;

/** 본문에 섞인 연락처와 꾸밈 — 게이트가 "남았으면 실패"로 본다. */
export function contactBits(text: string): { kind: "url" | "handle" | "email" | "hashtag" | "emoji"; value: string }[] {
  const out: { kind: "url" | "handle" | "email" | "hashtag" | "emoji"; value: string }[] = [];
  const emails = text.match(EMAIL_RE) ?? [];
  for (const v of emails) out.push({ kind: "email", value: v });
  const noEmail = text.replace(EMAIL_RE, " ");
  for (const v of noEmail.match(URL_RE) ?? []) out.push({ kind: "url", value: v });
  const noUrl = noEmail.replace(URL_RE, " ");
  for (const v of noUrl.match(DOMAIN_RE) ?? []) out.push({ kind: "url", value: v });
  for (const m of noUrl.matchAll(HANDLE_RE)) out.push({ kind: "handle", value: m[0].slice(m[1].length) });
  for (const m of noUrl.matchAll(HASHTAG_RE)) out.push({ kind: "hashtag", value: m[0].slice(m[1].length) });
  for (const v of text.match(EMOJI_RE) ?? []) if (/\p{Extended_Pictographic}/u.test(v)) out.push({ kind: "emoji", value: v });
  return out;
}

/** 연락처, 해시태그, 이모지, 꾸밈 기호를 뺀다. 줄 구조는 남긴다. */
export function stripContactBits(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => {
      const stripped = line
        .replace(EMAIL_RE, " ")
        .replace(URL_RE, " ")
        .replace(DOMAIN_RE, " ")
        .replace(HANDLE_RE, (_, pre: string) => `${pre} `)
        .replace(HASHTAG_RE, (_, pre: string) => `${pre} `)
        .replace(EMOJI_RE, " ")
        .replace(DECOR_RE, " ")
        .replace(BULLET_HEAD_RE, "")
        // 빈 괄호와 괄호 안 안내 낱말만 남은 것: "인스타그램( )" → "인스타그램"
        .replace(/[(（[]\s*[)）\]]/g, " ");
      // 안내 낱말만 남은 줄("Instagram :", "문의 DM")은 내용이 아니다. 원래 비어 있던 줄은 그대로 둔다(문단 경계).
      if (line.trim() && CONTACT_ONLY_LINE_RE.test(stripped.trim())) return null;
      return stripped;
    })
    // 지운 줄은 빈 줄로 남기지 않는다 — 빈 줄은 문단 경계라 문장 한가운데가 갈라진다.
    .filter((l): l is string => l !== null)
    .join("\n");
}

/** 문장이 끝난 자리인가(줄 끝 기준). 해요체, 합니다체, 한다체, 명사형 끝과 문장부호. */
function endsSentence(line: string): boolean {
  return /(?:[.!?。…~]|[요다죠까네음함임])["'”’)\]」』]*$/u.test(line.trim());
}

/** 문장으로 나눈다. 문장부호 뒤 공백에서만 끊는다. */
function splitSentences(p: string): string[] {
  return p
    .split(/(?<=[.!?。…])\s+/u)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** 긴 문단을 문장 경계에서 n개로 고르게 나눈다. 문장이 하나뿐이면 그대로. */
function splitParagraph(p: string, n: number): string[] {
  const ss = splitSentences(p);
  if (ss.length < 2 || n < 2) return [p];
  const target = p.length / n;
  const out: string[] = [];
  let cur = "";
  for (const s of ss) {
    if (cur && cur.length + s.length / 2 > target && out.length < n - 1) {
      out.push(cur);
      cur = s;
    } else cur = cur ? `${cur} ${s}` : s;
  }
  if (cur) out.push(cur);
  return out;
}

/** 붙은 두 문단 중 합친 길이가 가장 짧은 쌍을 합쳐 max개까지 줄인다. */
function mergeParagraphs(ps: string[], max: number): string[] {
  const out = [...ps];
  while (out.length > max) {
    let best = 0;
    for (let i = 1; i < out.length - 1; i++) if (out[i].length + out[i + 1].length < out[best].length + out[best + 1].length) best = i;
    out.splice(best, 2, `${out[best]} ${out[best + 1]}`);
  }
  return out;
}

function cleanSpaces(s: string): string {
  return s
    .replace(/[ \t 　]+/g, " ")
    .replace(/\s+([,.!?。])/g, "$1")
    .replace(/,\s*,+/g, ",")
    .replace(/^[\s,.:：\-–—]+/, "")
    .replace(/\s*[,:：\-–—]+$/, "")
    .trim();
}

/** 줄을 문단으로 묶는다. 빈 줄은 문단 경계, 문장이 끝난 줄바꿈도 문단 경계, 문장 중간 줄바꿈은 공백. */
export function toParagraphs(text: string): string[] {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n[ \t 　]*\n/);
  const paras: string[] = [];
  for (const block of blocks) {
    const lines = block
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    let cur = "";
    for (const l of lines) {
      if (cur && endsSentence(cur)) {
        paras.push(cur);
        cur = l;
      } else cur = cur ? `${cur} ${l}` : l;
    }
    if (cur) paras.push(cur);
  }
  return paras.map(cleanSpaces).filter((p) => /[가-힣A-Za-z0-9]/.test(p));
}

/**
 * Roam 변환본을 정돈한다. 뜻은 바꾸지 않는다 — 연락처와 꾸밈을 빼고, 가운뎃점을 쉼표로, 줄과 문단만 고른다.
 * 결과는 "문단\n\n문단" 꼴. 남는 게 없으면 빈 문자열.
 */
export function tidyIntroText(text: string): string {
  const paras = toParagraphs(stripContactBits(text).replace(/\s*·\s*/g, ", "));
  // 긴 문단은 문장 경계에서 나누고, 한 덩어리 장문은 두세 문단으로 나눈 뒤, 넘치면 짧은 쌍부터 합친다.
  let out = paras.flatMap((p) =>
    p.length > INTRO_MAX_PARAGRAPH_CHARS ? splitParagraph(p, Math.ceil(p.length / INTRO_MAX_PARAGRAPH_CHARS)) : [p],
  );
  if (out.length === 1 && out[0].length > INTRO_SINGLE_BLOCK_CHARS) out = splitParagraph(out[0], 2);
  return mergeParagraphs(out, INTRO_MAX_PARAGRAPHS).join("\n\n");
}

/** 문단 모양 검사 — 게이트(tone-gate.ts)가 쓴다. 문제가 없으면 빈 배열. */
export function introFormatIssues(display: string): string[] {
  const issues: string[] = [];
  const text = display.trim();
  const paras = text.split(/\n\n/);
  if (paras.some((p) => p.includes("\n"))) issues.push("문단 안에서 줄이 바뀌었어요. 문단 사이에만 빈 줄을 두세요");
  if (/\n{3,}/.test(text)) issues.push("빈 줄이 두 번 이상 이어져요");
  if (paras.length > INTRO_MAX_PARAGRAPHS) issues.push(`문단이 ${paras.length}개예요. ${INTRO_MAX_PARAGRAPHS}개 안으로 줄여 주세요`);
  for (const p of paras)
    if (p.length > INTRO_MAX_PARAGRAPH_CHARS) issues.push(`문단 하나가 너무 길어요(${p.length}자, ${INTRO_MAX_PARAGRAPH_CHARS}자 안)`);
  if (text.length > INTRO_MAX_CHARS) issues.push(`소개가 너무 길어요(${text.length}자, ${INTRO_MAX_CHARS}자 안)`);
  if (paras.length === 1 && text.length > INTRO_SINGLE_BLOCK_CHARS) issues.push("한 덩어리라 읽기 어려워요. 문단을 2~3개로 나눠 주세요");
  const labels: Record<string, string> = { url: "링크", handle: "인스타 아이디", email: "메일 주소", hashtag: "해시태그", emoji: "이모지" };
  for (const b of contactBits(text)) issues.push(`${labels[b.kind]}가 남았어요: ${b.value}`);
  return issues;
}
