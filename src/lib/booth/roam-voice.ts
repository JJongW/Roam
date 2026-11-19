// Roam이 쓴 문장 칸(로미 한 줄, 추천 이유, 시점 메모, 할 일, 안내)의 말투를 해요체로 맞춘다.
// 순수, LLM 없음.
//
// 왜 필요한가: 브랜드 규칙 §5(2026-11-02, 11-18 Ted 결정)는 Roam이 쓰는 사용자 문구를
// 전부 해요체로 정했다. 그런데 워커 초안기가 그 전에 만든 추천 이유는 반말("~할 수 있어.")과
// 한다체("~할 수 있다.")로 운영 DB에 976칸 남아 있었다(2026-11-19 셈). 프롬프트로
// 막았어도 모델은 프롬프트를 어긴다. 그래서
// - 초안기 출력은 저장 전에 이 모듈을 지난다(`enforceDraftVoice`).
// - 운영에 이미 들어간 값은 같은 규칙으로 고친다(`scripts/roam-voice-db-backfill.ts`).
//
// 원칙: **확실한 문장 끝만 바꾼다.** 문장 끝 낱말 하나만 보고, 아는 꼴이면 해요체로 바꾸고,
// 모르는 꼴(불규칙 동사, 명령형 '~봐', '~줘', 명사인지 동사인지 애매한 끝)은 `unsure`로
// 돌려준다. 고친 뒤에도 반말이나 합니다체가 남으면 역시 `unsure`다. 호출부는 unsure를
// 버리거나(초안기) 사람 검토로 돌린다(백필). 말투가 틀린 문장보다 없는 문장이 낫다.
import { toHaeyoWord } from "./summary-voice";
import { NOT_FOUND_TELLS } from "@/lib/enrichment/quality-gate";

// ── 한글 음절 ────────────────────────────────────────────────────────────────
const BASE = 0xac00;
function syl(ch: string | undefined): { medial: number; final: number } | null {
  if (!ch) return null;
  const c = ch.charCodeAt(0) - BASE;
  if (c < 0 || c >= 11172) return null;
  return { medial: Math.floor((c % 588) / 28), final: c % 28 };
}
const FINAL = { none: 0, n: 4, d: 7, l: 8, b: 17, bs: 18, s: 19, ss: 20, ng: 21, h: 27 } as const;
/** ㅏ(0), ㅗ(8)면 '아요', 나머지는 '어요'. */
const brightVowel = (m: number) => m === 0 || m === 8;
const hasBatchim = (ch: string | undefined) => (syl(ch)?.final ?? 0) !== 0;

// ── 검사(고친 뒤에도 남았나) ───────────────────────────────────────────────────
/** 합니다체 문장 끝. */
const HAMNIDA = /[가-힣]니다(?=[.!?,\s]|$)/;
/**
 * 반말 문장 끝(해체 '~야', '~있어', '~해', '~봐'와 한다체 '~다'). `roam-data-voice.test.ts`,
 * `scripts/roam-voice-db.mjs`의 검사와 같은 식이다.
 */
const BANMAL_END =
  /(?:[가-힣]야|거든|잖아|구나|있어|없어|좋아|많아|않아|같아|알아|남아|싫어|넓어|물어|워|[해돼봐와줘져여려혀싸나지네]|[가-힣]다)$/;
/** 반말 끝처럼 보이지만 명사인 낱말. 실제 데이터에서 걸린 것만 적는다. */
const NOUN_ENDINGS = /(까지|관하여|챌린지|무가지|하나|올해|분야|이미지|패키지|참여|기여|이해|피해|새해|오해|손해)$/;
/** 따옴표 안은 브랜드 문구나 제목 인용이라 말투를 보지 않는다. */
const QUOTED = /'[^']*'|"[^"]*"|“[^”]*”|‘[^’]*’|「[^」]*」|『[^』]*』|〈[^〉]*〉|《[^》]*》/g;
const CLOSE_QUOTE = /["'”’」』〉》]/;

function lastWords(text: string): string[] {
  return text
    .replace(QUOTED, "")
    .split(/[.!?…]+/)
    .map((s) => s.replace(/[\s"'“”‘’)\]」』>〉》]+$/u, "").trim())
    .filter(Boolean)
    .map((s) => s.split(/\s+/).pop() ?? "");
}

/**
 * 받침 뒤 '아', '어'로 끝나는 해체('먹어', '찾아', '없었어'). BANMAL_END는 정해 둔 몇 낱말만
 * 봐서 '~었어'를 놓쳤다(카페쇼 "찾을 수 없었어."). 받침 ㄴ, ㅇ 뒤는 명사가 흔해('영어',
 * '단어', '연어') 반말로 세되 바꾸지는 않는다(`haeyoEnding`이 unsure로 돌린다).
 */
function batchimAEo(word: string): boolean {
  if (!/[아어]$/.test(word) || word.length < 2) return false;
  return (syl(word.at(-2))?.final ?? 0) !== FINAL.none;
}
/** ㅕ로 줄어든 해체('붐벼', '켜', '펼쳐'). 바꾸지는 않고 반말로만 센다. */
const YEO_CONTRACTED = /[가-힣][벼펴켜텨쳐겨며]$/;
/** 반말 물음('있니?', '했니?'). 바꾸지는 않고 반말로만 센다. 대화 질문(conversation_prompts)에 나온다. */
const NI_QUESTION = /(있|었|았|했|겠|없|하)니$/;
/** '~ㄹ까'(할까, 볼까). 받침 ㄹ 뒤 까만 본다. */
const lKka = (w: string) => w.endsWith("까") && syl(w.at(-2))?.final === FINAL.l;
const isBanmalWord = (w: string) =>
  /[가-힣]$/.test(w) &&
  !/(요|죠|니다)$/.test(w) &&
  (BANMAL_END.test(w) ||
    batchimAEo(w) ||
    YEO_CONTRACTED.test(w) ||
    NI_QUESTION.test(w) ||
    lKka(w) ||
    Object.keys(HAE_DICT).some((k) => w.endsWith(k))) &&
  !NOUN_ENDINGS.test(w);

/** 문장 끝에 남은 반말 낱말들. */
export function banmalEndings(text: string): string[] {
  return lastWords(text).filter(isBanmalWord);
}

/** 말투 문제(합니다체, 반말). 비어 있으면 해요체이거나 명사로 끝난 메모다. */
export function voiceIssues(text: string): string[] {
  return [...(HAMNIDA.test(text) ? ["합니다체"] : []), ...banmalEndings(text).map((w) => `반말 '${w}'`)];
}

/**
 * 말투는 맞아도 사람이 봐야 하는 내용. 백필은 이것이 걸린 칸을 바꾸지 않고 검토로 돌린다.
 * - 초안기가 못 찾았다고 적은 문장(quality-gate의 NOT_FOUND_TELLS)
 * - 검색 인용 찌꺼기('[cite: …]')
 * - 읽는 사람을 '너', '당신'으로 부른 문장
 */
const ADDRESS = /(^|[\s,("'“‘])(너|네가|너의|너한테|너랑|니가|당신)(?=[\s,.!?은는이가을를의도랑한]|$)/;
export function contentFlags(text: string): string[] {
  const out: string[] = [];
  const tells = NOT_FOUND_TELLS.filter((t) => text.includes(t));
  if (tells.length) out.push(`못 찾았다는 문장(${tells.join(", ")})`);
  if (/\[cite/i.test(text)) out.push("검색 인용 찌꺼기 [cite]");
  if (ADDRESS.test(text)) out.push("'너', '당신' 호칭");
  return out;
}

// ── 문장 끝 낱말 하나 ──────────────────────────────────────────────────────────
export type EndingStatus = "same" | "changed" | "unsure";
export interface EndingResult {
  word: string;
  status: EndingStatus;
}

/** 한다체 '~다'에서 규칙으로 못 가르는 것. 실제 데이터에서 나온 것과 흔한 것만. */
const DA_DICT: Record<string, string> = {
  같다: "같아요",
  좋다: "좋아요",
  많다: "많아요",
  않다: "않아요",
  찮다: "찮아요",
  싶다: "싶어요",
  넓다: "넓어요",
  높다: "높아요",
  낮다: "낮아요",
  작다: "작아요",
  깊다: "깊어요",
  맞다: "맞아요",
  짧다: "짧아요",
  얇다: "얇아요",
  굵다: "굵어요",
  늦다: "늦어요",
  낫다: "나아요",
  크다: "커요",
  다르다: "달라요",
  빠르다: "빨라요",
  어렵다: "어려워요",
  쉽다: "쉬워요",
  가볍다: "가벼워요",
  무겁다: "무거워요",
  즐겁다: "즐거워요",
  귀엽다: "귀여워요",
  반갑다: "반가워요",
  가깝다: "가까워요",
  그렇다: "그래요",
  이렇다: "이래요",
  // ㄹ 줄기 동사(한다체에서 ㄹ이 빠져 규칙으로 못 되살린다)
  만든다: "만들어요",
  연다: "열어요",
  판다: "팔아요",
  논다: "놀아요",
  단다: "달아요",
  // 불규칙 '~는다'
  돕는다: "도와요",
  굽는다: "구워요",
  듣는다: "들어요",
  걷는다: "걸어요",
  싣는다: "실어요",
  짓는다: "지어요",
  잇는다: "이어요",
  붓는다: "부어요",
  입는다: "입어요",
  잡는다: "잡아요",
  씹는다: "씹어요",
  받는다: "받아요",
  믿는다: "믿어요",
  얻는다: "얻어요",
  닫는다: "닫아요",
  묻는다: "묻어요",
  웃는다: "웃어요",
  씻는다: "씻어요",
  벗는다: "벗어요",
  빼앗는다: "빼앗아요",
  // 모음 줄기 '~ㄴ다'
  간다: "가요",
  온다: "와요",
  본다: "봐요",
  낸다: "내요",
  선다: "서요",
  쓴다: "써요",
  켠다: "켜요",
  탄다: "타요",
};
/** 해체 끝 중 규칙 밖의 것. */
const HAE_DICT: Record<string, string> = {
  몰라: "몰라요",
  달라: "달라요",
  골라: "골라요",
  빨라: "빨라요",
};

/** '~ㄴ다' 앞 음절이 이것으로 끝나면 이렇게 바꾼다(키운다 → 키워요). */
const N_DA: [RegExp, string][] = [
  [/한다$/, "해요"],
  [/된다$/, "돼요"],
  [/준다$/, "줘요"],
  [/둔다$/, "둬요"],
  [/춘다$/, "춰요"],
  [/꾼다$/, "꿔요"],
  [/룬다$/, "뤄요"],
  [/운다$/, "워요"],
  [/인다$/, "여요"],
  [/긴다$/, "겨요"],
  [/린다$/, "려요"],
  [/킨다$/, "켜요"],
  [/친다$/, "쳐요"],
  [/진다$/, "져요"],
  [/핀다$/, "펴요"],
  [/민다$/, "며요"],
  [/난다$/, "나요"],
];

/** 앞 낱말이 이것으로 끝나면 뒤 낱말은 명사다('있는 기회다' → '기회예요'). */
const MODIFIER_END = /(는|은|던|한|된|인|할|일|의|운|적|진|난|른|큰|좋은|많은)$/;

function convertDa(word: string, prev: string | undefined): string | null {
  const stem = word.slice(0, -1);
  const last = stem.at(-1);
  for (const [k, v] of Object.entries(DA_DICT)) if (word.endsWith(k)) return word.slice(0, -k.length) + v;
  const s = syl(last);
  if (!s) return null;
  // 있다, 했다, 었다, 겠다 → ~어요
  if (s.final === FINAL.ss) return stem + "어요";
  if (word.endsWith("없다")) return word.slice(0, -2) + "없어요";
  if (word.endsWith("하다")) return word.slice(0, -2) + "해요";
  if (/(롭|럽|답)다$/.test(word)) {
    const map: Record<string, string> = { 롭: "로워요", 럽: "러워요", 답: "다워요" };
    return word.slice(0, -2) + map[word.at(-2)!];
  }
  // 보조용언 '-어 주다'는 띄어 쓴다('보여준다' → '보여 줘요'). 윤문 검토(humanize-monolith)에서 나온 끝 손질.
  if (/[여어아]준다$/.test(word)) return word.slice(0, -2) + " 줘요";
  for (const [re, to] of N_DA) {
    // '운다'만 있으면 울다(우는 것)일 수 있어 '키운다'처럼 앞이 붙은 것만 본다.
    if (re.test(word) && (word.length >= 3 || !word.endsWith("운다"))) return word.replace(re, to);
  }
  if (word.endsWith("는다") && word.length >= 3) {
    const v = syl(word.at(-3));
    if (!v || v.final === FINAL.none) return null;
    // ㅂ, ㄷ, ㅅ, ㅎ 받침은 불규칙일 수 있어 사전에만 맡긴다.
    if ([FINAL.b, FINAL.d, FINAL.s, FINAL.h].includes(v.final as 17 | 7 | 19 | 27)) return null;
    return word.slice(0, -2) + (brightVowel(v.medial) ? "아요" : "어요");
  }
  // 이다 → 이에요 / 예요 (받침 따라)
  if (word.endsWith("이다") && word.length >= 3) {
    const n = word.at(-3);
    if (!syl(n)) return null;
    return word.slice(0, -2) + (hasBatchim(n) ? "이에요" : "예요");
  }
  // 받침 없는 명사 + 다('기회다'). 형용사('크다')와 안 갈리니 앞이 꾸밈말일 때만.
  if (s.final === FINAL.none && prev && MODIFIER_END.test(prev)) return stem + "예요";
  return null;
}

function convertHae(word: string): string | null {
  for (const [k, v] of Object.entries(HAE_DICT)) if (word.endsWith(k)) return word.slice(0, -k.length) + v;
  if (word.endsWith("거든") || word.endsWith("잖아") || lKka(word)) return word + "요";
  // '~야'(이다의 해체)
  if (word.endsWith("이야") && word.length >= 3) return word.slice(0, -2) + "이에요";
  if (word.endsWith("거야")) return word.slice(0, -2) + "거예요";
  if (word.endsWith("야") && word.length >= 2) {
    const n = word.at(-2);
    if (!syl(n) || hasBatchim(n) || n === "해") return null; // '해야', '좋아야'는 이다가 아니다
    return word.slice(0, -1) + "예요";
  }
  if (word === "해" || word === "돼") return word + "요";
  if (NOUN_ENDINGS.test(word) || word.length < 2) return null;
  const last = word.at(-1)!;
  const prev = word.at(-2);
  const ps = syl(prev);
  // 있어, 했어, 없어 / 같아, 좋아, 담아(받침 뒤 아, 어). ㄴ, ㅇ 받침 뒤는 명사일 수 있다('영어').
  if ((last === "어" || last === "아") && ps && ps.final !== FINAL.none) {
    return ps.final === FINAL.n || ps.final === FINAL.ng ? null : word + "요";
  }
  if (last === "해" || last === "돼" || last === "져") return word + "요";
  if (word.endsWith("보여")) return word + "요";
  if (last === "와" && (prev === "어" || prev === "아" || prev === "나" || prev === "져")) return word + "요";
  if (last === "나" && (prev === "어" || prev === "아")) return word + "요";
  // 흥미로워, 배워, 키워. 샤워, 타워, 파워 같은 명사는 뺀다.
  if (last === "워" && prev && !/[샤타파아]/.test(prev)) return word + "요";
  return null;
}

/**
 * 문장 끝 낱말 하나를 해요체로. `prev`는 바로 앞 낱말(명사 + '다' 판정에 쓴다).
 * 이미 해요체이거나 명사로 끝났으면 same, 바꿨으면 changed, 모르면 unsure.
 */
export function haeyoEnding(word: string, prev?: string): EndingResult {
  if (!/[가-힣]$/.test(word)) return { word, status: "same" };
  if (/(요|죠)$/.test(word)) return { word, status: "same" };
  if (/니다$/.test(word)) {
    const next = toHaeyoWord(word);
    return next === null ? { word, status: "unsure" } : { word: next, status: "changed" };
  }
  if (!isBanmalWord(word)) return { word, status: "same" };
  // 명령이나 권유로 읽힐 수 있는 끝은 사람이 본다(로미는 권하지 않는다, §5).
  if (/(봐|줘|지|네|구나|려|혀|싸)$/.test(word)) return { word, status: "unsure" };
  const next = word.endsWith("다") ? convertDa(word, prev) : convertHae(word);
  return next === null ? { word, status: "unsure" } : { word: next, status: "changed" };
}

// ── 문자열, 값 ────────────────────────────────────────────────────────────────
/** 공식 표기에 가운뎃점이 든 이름. 브랜드 표기라 그대로 둔다(§1). */
const OFFICIAL_DOT_NAMES = ["동아시아·허블", "Strawberry Club·草莓烟"];

/** 가운뎃점을 쉼표로(§5). 공식 이름은 그대로. */
export function undot(text: string): string {
  if (!text.includes("·")) return text;
  const keep = OFFICIAL_DOT_NAMES.filter((n) => text.includes(n));
  let t = text;
  keep.forEach((n, i) => (t = t.split(n).join(`\u0000${i}\u0000`)));
  t = t.replace(/[ \t]*·[ \t]*/g, ", ");
  keep.forEach((n, i) => (t = t.split(`\u0000${i}\u0000`).join(n)));
  return t;
}

export interface TextVoice {
  text: string;
  changed: boolean;
  /** 못 바꾼 문장 끝, 고친 뒤에도 남은 말투 문제. 비어야 쓸 수 있다. */
  unsure: string[];
  /** 말투와 별개로 사람이 봐야 하는 내용(`contentFlags`). */
  flags: string[];
}

/** 문장 끝 낱말 + 뒤따르는 닫는 기호. 뒤가 문장부호이거나 글 끝이어야 한다. */
const SENTENCE_END = /([가-힣A-Za-z0-9]+)([\s"'“”‘’)\]」』>〉》]*)(?=[.!?…]|$)/g;

/** 한 문자열의 문장 끝을 전부 해요체로. 문장 끝 말고는 가운뎃점만 건드린다. */
export function toHaeyoText(input: string): TextVoice {
  const unsure: string[] = [];
  const text = undot(input).replace(SENTENCE_END, (m, word: string, tail: string, offset: number, all: string) => {
    if (!word || CLOSE_QUOTE.test(tail)) return m; // 따옴표 안 인용은 그대로
    const prev = all.slice(0, offset).trimEnd().split(/\s+/).pop();
    const r = haeyoEnding(word, prev);
    if (r.status === "unsure") unsure.push(`'${word}'`);
    return r.word + tail;
  });
  for (const v of voiceIssues(text)) if (!unsure.some((u) => v.includes(u.slice(1, -1)))) unsure.push(v);
  return { text, changed: text !== input, unsure, flags: contentFlags(text) };
}

export interface ValueVoice {
  value: unknown;
  changed: boolean;
  unsure: string[];
  flags: string[];
}

/** 문자열, 배열, 객체(jsonb) 안 문자열을 모두 해요체로. 키와 순서는 그대로. */
export function toHaeyoValue(v: unknown): ValueVoice {
  const unsure: string[] = [];
  const flags: string[] = [];
  const walk = (x: unknown): unknown => {
    if (typeof x === "string") {
      const r = toHaeyoText(x);
      unsure.push(...r.unsure);
      flags.push(...r.flags);
      return r.text;
    }
    if (Array.isArray(x)) return x.map(walk);
    if (x && typeof x === "object") return Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)]));
    return x;
  };
  const value = walk(v);
  return { value, changed: JSON.stringify(value) !== JSON.stringify(v), unsure, flags };
}
