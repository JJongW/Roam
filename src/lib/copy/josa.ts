// 받침에 따라 갈리는 조사. 한글 음절은 종성으로, 끝이 숫자나 영문이면 읽는 소리로 가린다.
// "A홀이에요", "C홀이에요", "2층이에요", "B1이에요", "Hall A예요".

const DIGIT_HAS_FINAL: Record<string, boolean> = {
  "0": true, // 영
  "1": true, // 일
  "2": false, // 이
  "3": true, // 삼
  "4": false, // 사
  "5": false, // 오
  "6": true, // 육
  "7": true, // 칠
  "8": true, // 팔
  "9": false, // 구
};

/** 영문 이름 글자로 읽을 때 받침이 남는 것(엘, 엠, 엔, 알). */
const LETTER_HAS_FINAL = /[lmnr]$/i;

/** 마지막 소리에 받침이 있는가. 판단할 수 없으면 false. */
export function hasFinalConsonant(word: string): boolean {
  const s = word.trim().replace(/[\s)\]}"'’”.]+$/u, "");
  const last = s.at(-1);
  if (!last) return false;
  const code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (last in DIGIT_HAS_FINAL) return DIGIT_HAS_FINAL[last];
  return LETTER_HAS_FINAL.test(last);
}

/** "A홀" → "A홀이에요", "Hall A" → "Hall A예요" */
export function iyeyo(word: string): string {
  return `${word}${hasFinalConsonant(word) ? "이에요" : "예요"}`;
}
