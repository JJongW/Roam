import { checkToneConversion } from "@/lib/brands/tone-gate";
import { gradeCandidate, type QualityIssue } from "./quality-gate";

/**
 * 운영에 남은 **반말 로미 한 줄**(booth_enrichment.roam_interpretation)을 해요체로
 * 옮긴다. 2026-11-02 브랜드 규칙(§5, 모든 사용자 문구 해요체)이 정해지기 전에 쓴
 * 줄들이다.
 *
 * LLM은 **말투만** 바꾼다. 통과 여부는 결정적 검사 둘이 정한다("서비스가 판단, LLM은 말만"):
 * - `checkToneConversion`(tone-gate): 원문 대비 숫자, 고유명사, 길이, 과장, 해요체, "전시", 가운뎃점
 * - `gradeCandidate`(quality-gate)의 로미 한 줄 규칙: 해요체, 남의 목소리, 분류 되읽기, 상투어, 추측
 * 그리고 두 게이트가 안 보는 호칭, 자기지칭, 권유형, 낱말 보존(아래 `voiceExtras`, `contentDrift`).
 *
 * 이 모듈은 순수하다. LLM은 호출부가 주입한다(스크립트는 gemini 래퍼, 테스트는 목).
 */

export interface LineInput {
  boothId: string;
  before: string;
  /** 부스 이름. 원문에 있으면 그대로 남아야 하고, quality-gate의 name_only 판정에 쓴다. */
  boothName?: string;
}

export interface LineVerdict {
  pass: boolean;
  /** 사람이 읽는 실패 이유. `[출처] 내용` 꼴. */
  reasons: string[];
  /** 집계용 코드(실패 이유 상위 N개를 셀 때). reasons와 같은 순서·길이. */
  codes: string[];
  /** quality-gate 신뢰도(0..1). 검수 큐 적재 때 confidence로 쓴다. */
  confidence: number;
  /** quality-gate가 낸 원본 지적(검수 큐 issues로 그대로 싣는다). */
  qualityIssues: QualityIssue[];
}

export const HAEYO_SYSTEM = [
  "너는 박람회 부스 탐색 앱 Roam의 교정자다. 로미(앱 안내자)가 부스를 소개하는 한 줄을 받는다.",
  "그 한 줄의 **말투만** 해요체 존댓말로 바꾼다. 내용은 한 글자도 더하거나 빼지 않는다.",
  "",
  "지킬 것:",
  "- 고유명사, 브랜드명, 영문 표기, 숫자, 품목, 따옴표 안의 말은 그대로 둔다.",
  "- 뜻, 정보의 양, 문장 순서를 바꾸지 않는다. 없던 꾸밈말이나 과장('최고', '꼭', '무조건', '필수')을 붙이지 않는다.",
  "- 문장 끝은 전부 해요체('~예요', '~이에요', '~있어요', '~좋아요', '~죠')로 맺는다. 반말('~야', '~해', '~어', '~지', '~거든')과 합니다체('~입니다', '~합니다')를 쓰지 않는다.",
  "- 명사로 끝나는 문장도 해요체로 맺는다('~부스.' → '~부스예요.').",
  "- 받침 없는 말 뒤엔 '예요', 받침 있는 말 뒤엔 '이에요'를 쓴다('브랜드예요', '편집숍이에요').",
  "- 권유나 명령('~해 봐', '~가 봐', '~챙겨')은 '~하세요', '~주세요', '~보세요'로 바꾸지 않는다. 로미는 권하지 않고 알려 준다: '~해 보기 좋아요', '~할 수 있어요'.",
  "- 읽는 사람을 '너', '네', '당신'으로 부르지 않는다. 호칭이 있으면 빼고 주어를 생략한다('네 취향이면' → '취향이라면').",
  "- 로미가 자기를 가리키는 말은 '제가'로 쓴다('내가' → '제가', '나는' → '저는'). '저희'는 쓰지 않는다.",
  "- '나만의', '나에게 맞는'처럼 **읽는 사람 입장**의 '나'는 로미가 아니다. 그대로 두고 '저'로 바꾸지 않는다.",
  "- '알려줄', '보여줄'처럼 **부스가** 해 주는 일은 '알려 줘요', '보여 줄 거예요'로 쓴다. '드려요', '드릴'로 바꾸지 않는다('드리다'는 로미가 하는 일로 읽힌다).",
  "- 낱말 철자는 원문 그대로 옮긴다. 글자를 겹치거나 빠뜨리지 않는다.",
  "- '판매해', '판매 중'은 '팔아요'로, '구매 가능'은 '살 수 있어요'로, '주문 제작'은 '맞춤 제작'으로 쓴다. '안녕하세요' 같은 인사, '팔로우', 'DM'을 새로 넣지 않는다.",
  "- 가운뎃점(·)을 쓰지 않는다. 원문에 있으면 쉼표로 바꾼다.",
  "- '전시', '전시회', '전시장'을 쓰지 않는다. 원문에 있으면 '박람회', '행사', '행사장'으로 바꾼다(행사명 같은 고유명사는 그대로).",
  "- 띄어쓰기는 맞춤법대로 고쳐도 된다('골라둔' → '골라 둔', '체험해봐' → '체험해 보기').",
  "",
  "예시:",
  "- '야생화부터 난초까지 파는 식물 편집숍이야.' → '야생화부터 난초까지 파는 식물 편집숍이에요.'",
  "- '귀로 듣는 책이 궁금하면, 오디오북을 직접 체험해보고 굿즈까지 챙기는 부스야.' → '귀로 듣는 책이 궁금하다면, 오디오북을 직접 체험해 보고 굿즈까지 챙길 수 있는 부스예요.'",
  "- '손으로 빚은 찻잔이 궁금하면 한번 들러봐.' → '손으로 빚은 찻잔이 궁금하다면 한번 들러 보기 좋아요.'",
  "- '내가 골라둔 원두 중에 제일 산미가 밝아.' → '제가 골라 둔 원두 중에 제일 산미가 밝아요.'",
  "- '3년 숙성한 막걸리를 시음할 수 있어.' → '3년 숙성한 막걸리를 시음할 수 있어요.'",
  "- '물레로 빚은 찻잔을 구경해 봐.' → '물레로 빚은 찻잔을 구경해 보기 좋아요.'(X '구경해 보세요')",
  "",
  '출력은 JSON 객체 하나: {"after": "바꾼 문장"}. 설명이나 코드펜스 없이.',
].join("\n");

export function haeyoUserPrompt(before: string, priorIssues?: string[]): string {
  return [
    `원문: ${before}`,
    ...(priorIssues?.length
      ? [
          "",
          "이전에 바꾼 문장이 아래 검사에서 떨어졌다. 같은 실수를 하지 않는다(내용은 여전히 원문 그대로):",
          ...priorIssues.map((r) => `- ${r}`),
        ]
      : []),
  ].join("\n");
}

/**
 * 브랜드 규칙 §5와 "말투만"이라는 이 변환의 약속 중 두 게이트가 안 보는 것.
 * - 호칭('너', '당신')과 반말 자기지칭('나', '내가', '저희')
 * - 권유형 종결('~보세요'). voice.ts는 '하세요', '주세요'만 남의 목소리로 본다.
 * - 읽는 사람의 '나'를 로미의 '저'로 바꾼 것(뜻이 뒤집힌다)
 * - 원문 낱말이 사라지거나 철자가 바뀐 것(LLM이 '프랜차이즈'를 '프랜차이이즈'로 옮긴 실제 사례)
 */
const ADDRESS = /(^|[\s,("'“‘])(너|네가|너의|너한테|너랑|니가|당신)(?=[\s,.!?은는이가을를의도랑한]|$)/;
const ADDRESS_NE = /(^|[\s,("'“‘])네\s+(취향|관심|마음|눈|손|가방|스타일|하루|발걸음)/;
// '나는'은 동사('향이 나는', '가평에서 나는')와 안 갈리니 문장 첫머리만 본다. '나만의',
// '나에게 맞는'은 읽는 사람 입장의 관용구라 로미 자기지칭이 아니다(아래 READER_NA).
const FIRST_PERSON_INFORMAL = /(^|[\s,("'“‘])(내가|저희)|(^|[.!?]\s*)나는\s/;
/** 부스가 해 주는 일('알려줄')을 '드리다'로 높이면 로미가 하는 일로 읽힌다. */
const HUMBLE_GIVE = /드(릴|려|립|린)/;
const READER_NA = /(나에게|나한테|내게|나만의|내\s*몸)/;
const ROMI_JEO = /(저에게|제게|저한테|저만의|제\s*몸)/;

function endings(text: string): string[] {
  return text
    .split(/[.!?…]+/)
    .map((s) => s.replace(/[\s"'“”‘’)\]」』>]+$/u, "").trim())
    .filter(Boolean);
}

/** 의도한 낱말 교체(브랜드 규칙이 시킨 것). 이 말이 든 원문 낱말은 보존 검사에서 뺀다. */
const ALLOWED_SWAP = /(판매|구매|주문|전시|^나|^내|^너|^네|^당신|^니가)/;

/**
 * 원문 낱말의 줄기(끝 두세 음절을 뗀 앞부분)가 바꾼 문장에 그대로 있는가. 띄어쓰기는 고쳐도
 * 되므로 공백을 걷고 비교한다. 끝 두 음절은 어미가 바뀌는 자리라 보지 않는다. 그래서
 * 세 음절 이하 낱말은 못 본다(보수적: 놓칠 수는 있어도 잘못 떨어뜨리진 않게).
 */
export function missingStems(before: string, after: string): string[] {
  const flatAfter = after.replace(/\s+/g, "");
  const out: string[] = [];
  for (const raw of before.split(/[\s,.!?…·'"“”‘’()「」『』<>[\]]+/)) {
    const w = raw.trim();
    if (!/^[가-힣A-Za-z0-9]/.test(w) || ALLOWED_SWAP.test(w)) continue;
    // 긴 낱말은 어미가 더 길게 바뀐다('제안하는구나' → '제안해요', 하+어 → 해).
    const cut = w.length >= 6 ? 4 : w.length === 5 ? 3 : 2;
    const stem = w.slice(0, Math.max(0, w.length - cut));
    if (stem.length < 2) continue;
    if (!flatAfter.includes(stem)) out.push(w);
  }
  return out;
}

/** 원문에 없던 같은 음절 겹침('이이'). 옮기다 생긴 말더듬이다. */
export function newStutters(before: string, after: string): string[] {
  const found = [...after.matchAll(/([가-힣])\1/g)].map((m) => m[0]);
  return [...new Set(found)].filter((d) => !before.includes(d));
}

export function voiceExtras(after: string, before = ""): { code: string; message: string }[] {
  const out: { code: string; message: string }[] = [];
  if (ADDRESS.test(after) || ADDRESS_NE.test(after)) {
    out.push({ code: "address_term", message: "읽는 사람을 '너', '당신'으로 불러요. 호칭은 빼요" });
  }
  if (FIRST_PERSON_INFORMAL.test(after)) {
    out.push({ code: "first_person", message: "로미 자기지칭은 '제가'예요('나', '내가', '저희' 금지)" });
  }
  if (endings(after).some((s) => /(세요|[해어아여]\s?봐요)$/.test(s))) {
    out.push({ code: "imperative", message: "권유형('~보세요')으로 끝나요. 로미는 '~해 보기 좋아요'처럼 알려 줘요" });
  }
  if (READER_NA.test(before) && ROMI_JEO.test(after)) {
    out.push({ code: "reader_to_romi", message: "읽는 사람의 '나'를 로미의 '저'로 바꿨어요. 뜻이 뒤집혀요" });
  }
  if (HUMBLE_GIVE.test(after) && !HUMBLE_GIVE.test(before)) {
    out.push({ code: "humble_shift", message: "부스가 해 주는 일을 '드려요'로 바꿨어요. 로미가 하는 일로 읽혀요('알려 줘요')" });
  }
  return out;
}

export function contentDrift(before: string, after: string): { code: string; message: string }[] {
  const out: { code: string; message: string }[] = [];
  const gone = missingStems(before, after);
  if (gone.length) out.push({ code: "stem_missing", message: `원문 낱말이 사라지거나 바뀌었어요: ${gone.join(", ")}` });
  const st = newStutters(before, after);
  if (st.length) out.push({ code: "stutter", message: `원문에 없던 음절 겹침이 생겼어요: ${st.join(", ")}` });
  return out;
}

const PREEXISTING = " (원문에도 있음)";

/** tone-gate 문구에서 가변 부분(숫자, 인용)을 걷어 집계 키를 만든다. */
export function toneCode(issue: string): string {
  return `tone:${issue.split(/[:(]/)[0].trim()}`;
}

/**
 * 바꾼 한 줄을 결정적으로 판정한다. 세 묶음 모두 깨끗해야 pass.
 */
export function judgeLine(input: LineInput, after: string): LineVerdict {
  const reasons: string[] = [];
  const codes: string[] = [];
  const trimmed = after.trim();

  const tone = checkToneConversion({
    original: input.before,
    display: trimmed,
    protectedTerms: input.boothName ? [input.boothName] : [],
  });
  for (const i of tone.issues) {
    reasons.push(`[tone-gate] ${i}`);
    codes.push(toneCode(i));
  }

  // 로미 한 줄 규칙만 본다. 출처 검사는 이 변환과 무관하다(원문 그대로). 주최 재료로
  // 친 organizerMaterial로 끈다. summary를 요청 목록에 넣는 건 추측 검사(speculation)가
  // summary 필드로 묶여 있어서다. summary가 비어 있어 다른 summary 검사는 안 걸린다.
  const grade = gradeCandidate({
    payload: { roamInterpretation: trimmed },
    sources: [],
    booth: { name: input.boothName ?? "" },
    requested: ["roamInterpretation", "summary"],
    organizerMaterial: true,
  });
  // 원문에도 있던 지적(상투어 등)은 말투 변환이 만든 게 아니다. 표시만 해 둔다.
  const before = gradeCandidate({
    payload: { roamInterpretation: input.before },
    sources: [],
    booth: { name: input.boothName ?? "" },
    requested: ["roamInterpretation", "summary"],
    organizerMaterial: true,
  });
  const preexisting = new Set(before.issues.map((i) => i.code));
  for (const i of grade.issues) {
    reasons.push(
      `[quality-gate] ${i.code}: ${i.message}${preexisting.has(i.code) && i.code !== "not_roam_voice" ? PREEXISTING : ""}`,
    );
    codes.push(`quality:${i.code}`);
  }

  for (const v of voiceExtras(trimmed, input.before)) {
    reasons.push(`[voice] ${v.code}: ${v.message}`);
    codes.push(`voice:${v.code}`);
  }
  for (const v of contentDrift(input.before, trimmed)) {
    reasons.push(`[content] ${v.code}: ${v.message}`);
    codes.push(`content:${v.code}`);
  }

  return {
    pass: reasons.length === 0,
    reasons,
    codes,
    confidence: grade.confidence,
    qualityIssues: grade.issues,
  };
}

export type HaeyoLLM = (req: { system: string; prompt: string }) => Promise<string>;

export interface LineResult extends LineVerdict {
  boothId: string;
  before: string;
  after: string;
  /** 실제로 부른 LLM 횟수(래퍼 내부 재시도 제외). */
  calls: number;
  /** LLM 호출 자체가 실패했나(빈 응답, 예외). */
  error?: string;
}

/**
 * 한 줄을 변환하고 판정한다. 실패는 **한 번만** 다시 부른다. 예외였으면 그대로,
 * 검사에서 떨어졌으면 떨어진 이유를 넣어서. 두 번째도 떨어지면 그 결과를 그대로 낸다
 * (검수 큐 몫).
 */
export async function convertLine(input: LineInput, llm: HaeyoLLM): Promise<LineResult> {
  let calls = 0;
  let last: { after: string; verdict: LineVerdict } | null = null;
  let error: string | undefined;
  for (let attempt = 0; attempt < 2; attempt++) {
    calls += 1;
    let after: string;
    try {
      after = (await llm({ system: HAEYO_SYSTEM, prompt: haeyoUserPrompt(input.before, last?.verdict.reasons) })).trim();
      if (!after) throw new Error("빈 응답");
      error = undefined;
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
      continue;
    }
    const verdict = judgeLine(input, after);
    last = { after, verdict };
    // 원문에도 있던 지적(상투어 등)만 남았으면 다시 불러도 소용없다. 말투만 바꾸라고
    // 했으니 그 말은 남는 게 맞다. 검수 큐 몫이다.
    if (verdict.pass || verdict.reasons.every((r) => r.endsWith(PREEXISTING))) break;
  }
  if (!last) {
    return {
      boothId: input.boothId,
      before: input.before,
      after: "",
      pass: false,
      reasons: [`[llm] ${error ?? "응답 없음"}`],
      codes: ["llm:error"],
      confidence: 0,
      qualityIssues: [],
      calls,
      error,
    };
  }
  return { boothId: input.boothId, before: input.before, after: last.after, calls, ...last.verdict };
}

/**
 * 드라이런 한 줄을 어떻게 반영할지(2026-11-03 Ted 승인안).
 * - `update`: 통과. 바로 갱신한다.
 * - `update_filler`: 원문에 있던 상투어(filler)만 걸렸다. 말투 변환은 문제없으니 갱신하고,
 *   상투어는 나중에 따로 정리한다(목록을 파일로 남긴다).
 * - `redraft`: 원문이 "정보를 찾을 수 없었어"나 추측이다. 말투가 아니라 다시 써야 할 줄이라
 *   갱신하지 않고 after 없이 검수 큐로 보낸다.
 * - `review`: 그 밖의 실패. after를 담아 검수 큐로.
 * 가운뎃점만 걸린 줄은 쉼표로 고쳐 다시 판정하고, 통과하면 `update`다.
 */
export type ApplyAction = "update" | "update_filler" | "redraft" | "review";

export interface ApplyDecision {
  action: ApplyAction;
  after: string;
  /** 가운뎃점을 고쳐 다시 판정했나. */
  fixedMiddot?: boolean;
  reasons: string[];
  codes: string[];
}

const MIDDOT_CODE = toneCode("가운뎃점이 있어요. 쉼표나 와, 과로 바꿔 주세요");

export function decideApply(row: {
  before: string;
  after: string;
  pass: boolean;
  reasons: string[];
  codes: string[];
  boothName?: string;
}): ApplyDecision {
  const base = { after: row.after, reasons: row.reasons, codes: row.codes };
  if (row.pass) return { action: "update", ...base };
  if (row.codes.some((c) => c === "quality:not_found" || c === "quality:speculation")) {
    return { action: "redraft", ...base };
  }
  if (row.codes.length > 0 && row.codes.every((c) => c === "quality:filler")) {
    return { action: "update_filler", ...base };
  }
  if (row.after && row.codes.length > 0 && row.codes.every((c) => c === MIDDOT_CODE)) {
    const fixed = row.after.replace(/\s*·\s*/g, ", ");
    const v = judgeLine({ boothId: "", before: row.before, boothName: row.boothName }, fixed);
    if (v.pass) return { action: "update", after: fixed, fixedMiddot: true, reasons: [], codes: [] };
    return { action: "review", after: fixed, fixedMiddot: true, reasons: v.reasons, codes: v.codes };
  }
  return { action: row.after ? "review" : "redraft", ...base };
}

/** 동시성 제한 맵. 순서를 보존한다. */
export async function mapPool<T, R>(items: T[], limit: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** 시험 실행용 표본: 앞에서부터가 아니라 고르게 뽑는다(박람회가 섞이게). */
export function evenSample<T>(items: T[], n: number): T[] {
  if (n >= items.length) return items;
  const step = items.length / n;
  return Array.from({ length: n }, (_, i) => items[Math.floor(i * step)]);
}
