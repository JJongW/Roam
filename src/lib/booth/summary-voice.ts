// 부스 한 줄 요약의 말투를 마지막에 한 번 더 확인한다. 순수·LLM 없음.
//
// 왜 필요한가: 요약은 Roam이 쓰는 문구라 해요체여야 하고 가운뎃점(·)이 없어야 한다
// (브랜드 규칙 §5). 프롬프트에 그렇게 적어 두었지만 모델은 프롬프트를 어긴다 —
// 미리 만든 `summaries.json` 511건 중 509건이 합니다체로 들어와 있었다(2026-11-18 고침).
// 그래서 모델 출력은 이 함수를 지나야만 화면에 나간다.
//
// 고칠 수 있는 것(알려진 문장 끝, 가운뎃점)은 고치고, 모르는 합니다체 끝이 남으면
// 빈 문자열을 돌려준다. 말투가 틀린 한 줄보다 한 줄이 없는 편이 낫다.

/** 합니다체 문장 끝. `만듭니다`처럼 받침 ㅂ이 붙는 꼴까지 잡도록 `니다`로 본다. */
const HAMNIDA = /(습니다|ㅂ니다|[가-힣]니다)(?=[.!?,\s]|$)/;

/** 받침이 있는 글자인가(한글 음절만). */
function hasBatchim(ch: string): boolean {
  const c = ch.charCodeAt(0) - 0xac00;
  return c >= 0 && c < 11172 && c % 28 !== 0;
}

/** 규칙으로 못 바꾸는 동사. 실제 요약에서 나온 것만 적는다. */
const IRREGULAR: [string, string][] = [
  ["만듭니다", "만들어요"],
  ["선보입니다", "선보여요"],
  ["빚습니다", "빚어요"],
  ["냅니다", "내요"],
  ["다룹니다", "다뤄요"],
  ["볶습니다", "볶아요"],
  ["엽니다", "열어요"],
  ["있습니다", "있어요"],
  ["없습니다", "없어요"],
  ["했습니다", "했어요"],
  ["았습니다", "았어요"],
  ["었습니다", "었어요"],
  ["왔습니다", "왔어요"],
];

function toHaeyoWord(word: string): string | null {
  for (const [from, to] of IRREGULAR) {
    if (word.endsWith(from)) return word.slice(0, -from.length) + to;
  }
  if (word.endsWith("합니다")) return word.slice(0, -3) + "해요";
  if (word.endsWith("됩니다")) return word.slice(0, -3) + "돼요";
  if (word.endsWith("입니다")) {
    const stem = word.slice(0, -3);
    const last = stem.at(-1);
    if (!last || !/[가-힣]/.test(last)) return null;
    return stem + (hasBatchim(last) ? "이에요" : "예요");
  }
  return null;
}

/** 합니다체 문장 끝이 남아 있는가. */
export function hasHamnida(text: string): boolean {
  return HAMNIDA.test(text);
}

/**
 * 요약 한 줄을 해요체, 가운뎃점 없음으로 맞춘다. 문장 끝 말고는 건드리지 않는다.
 * 모르는 합니다체 끝이 남으면 빈 문자열.
 */
export function normalizeSummaryVoice(text: string): string {
  let unknown = false;
  const out = text
    .replace(/[ \t]*·[ \t]*/g, ", ")
    .replace(/(\S*니다)(?=[.!?,\s]|$)/g, (word) => {
      const next = toHaeyoWord(word);
      if (next === null) {
        unknown = true;
        return word;
      }
      return next;
    });
  if (unknown || hasHamnida(out)) return "";
  return out;
}
