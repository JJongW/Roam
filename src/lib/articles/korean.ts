// 이름 뒤 조사 고르기. 순수.
//
// 브랜드와 박람회 이름은 한글, 영문, 숫자가 섞인다. 받침을 알 수 있으면 맞는 조사를,
// 모르면(영문으로 끝나는 이름) 둘을 같이 적지 않고 문장을 바꿔 쓰도록 null을 준다.

/** 마지막 글자의 받침. true/false, 모르면 null. */
export function endsWithBatchim(word: string): boolean | null {
  const t = word.trim().replace(/[)\]」』"'”’]+$/u, "");
  const ch = t.at(-1);
  if (!ch) return null;
  const c = ch.charCodeAt(0) - 0xac00;
  if (c >= 0 && c < 11172) return c % 28 !== 0;
  // 숫자는 읽는 소리로: 0(영), 1(일), 3(삼), 6(육), 7(칠), 8(팔)은 받침이 있다.
  if (/[0-9]/.test(ch)) return "013678".includes(ch);
  return null;
}

type Pair = readonly [withBatchim: string, without: string];
const PAIRS = {
  topic: ["은", "는"],
  subject: ["이", "가"],
  object: ["을", "를"],
  and: ["과", "와"],
  copula: ["이에요", "예요"],
} as const satisfies Record<string, Pair>;

/**
 * 이름 + 조사. 받침을 모르면 괄호 병기 대신 받침 없는 쪽을 쓰지 않고 null을 준다 —
 * 호출부가 이름 뒤에 조사가 필요 없는 문장으로 바꾼다.
 */
export function josa(word: string, kind: keyof typeof PAIRS): string | null {
  const b = endsWithBatchim(word);
  if (b === null) return null;
  const [w, wo] = PAIRS[kind];
  return word + (b ? w : wo);
}

/** "12월 4일" 꼴. 같은 해 안이면 연도를 앞에 한 번만. */
export function koreanDate(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${m}월 ${d}일`;
}

export function koreanDateRange(start: string, end: string): string {
  const y1 = start.slice(0, 4);
  const y2 = end.slice(0, 4);
  if (start.slice(0, 10) === end.slice(0, 10)) return `${y1}년 ${koreanDate(start)}`;
  if (y1 === y2) return `${y1}년 ${koreanDate(start)}부터 ${koreanDate(end)}까지`;
  return `${y1}년 ${koreanDate(start)}부터 ${y2}년 ${koreanDate(end)}까지`;
}
