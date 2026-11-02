/**
 * 지도 부스 칸 안에 이름을 어떻게 앉힐지 — 줄과 글자 크기.
 *
 * 예전 `wrapLabel`은 한 줄 글자 수(perLine)를 넘는 단어를 **글자 단위로** 끊었다
 * ("엘리루카클/리너"). 2026-10-16 결정: **어절 단위로 줄을 바꾼다.** 띄어쓰기와 여는
 * 괄호 앞에서만 끊고, 어절 하나가 한 줄에 안 들어갈 때만 글자를 줄이되 절반까지만.
 * 그래도 안 들어갈 때만 어절 안에서 끊고 넘치는 줄은 "…" — 이름 전체는 부스를
 * 누르면 카드에 나온다.
 *
 * iOS `RoamKit/Features/Map/BoothLabel.swift`와 같은 규칙이다.
 */

export const NAME_LINE_HEIGHT = 1.16;
export const CODE_LINE_HEIGHT = 1.3;
export const CODE_RATIO = 0.8;
/** 글자를 이보다 작게는 줄이지 않는다(부스 기준 크기의 배수). */
export const MIN_SCALE = 0.5;

export interface BoothLabelLayout {
  lines: string[];
  fontSize: number;
}

/** 줄을 바꿀 수 있는 자리로 나눈다 — 띄어쓰기, 그리고 여는 괄호 앞.
 *  부스 이름은 "브랜드(회사)" 꼴이 많고 괄호 앞에 띄어쓰기가 없다. */
export function labelWords(name: string): string[] {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((chunk) => chunk.split(/(?=\()/).filter(Boolean));
}

/** 글자 폭 어림치(em) — 한글·한자 한 칸, ASCII 0.55칸. */
export function emWidth(text: string): number {
  let w = 0;
  for (const ch of text) w += ch.charCodeAt(0) < 128 ? 0.55 : 1;
  return w;
}

function pack(tokens: string[], perLine: number): string[] | null {
  const lines: string[] = [];
  let cur = "";
  for (const t of tokens) {
    if (emWidth(t) > perLine) return null;
    // 괄호로 시작하는 조각은 앞 조각에 띄어쓰기 없이 붙어 있던 것이다.
    const joined = cur ? cur + (t.startsWith("(") ? "" : " ") + t : t;
    if (emWidth(joined) <= perLine) cur = joined;
    else {
      lines.push(cur);
      cur = t;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}

function hardBreak(token: string, perLine: number): string[] {
  const parts: string[] = [];
  let cur = "";
  for (const ch of token) {
    if (cur && emWidth(cur + ch) > perLine) {
      parts.push(cur);
      cur = "";
    }
    cur += ch;
  }
  if (cur) parts.push(cur);
  return parts;
}

function lineBudget(size: number, height: number, hasCode: boolean): number {
  const code = hasCode ? size * CODE_RATIO * CODE_LINE_HEIGHT : 0;
  return Math.max(1, Math.floor((height - code) / (size * NAME_LINE_HEIGHT)));
}

/** `width`·`height`는 글자가 쓸 수 있는 칸 안쪽(도면 단위). */
export function layoutBoothLabel(
  name: string,
  base: number,
  width: number,
  height: number,
  hasCode: boolean,
): BoothLabelLayout {
  const tokens = labelWords(name);
  if (tokens.length === 0) return { lines: [], fontSize: base };

  // 큰 글자부터 내려가며 "어절이 안 잘리고, 줄이 칸 높이에 들어가는" 첫 크기.
  const floor = base * MIN_SCALE;
  let size = base;
  for (;;) {
    const lines = pack(tokens, width / size);
    if (lines && lines.length <= lineBudget(size, height, hasCode))
      return { lines, fontSize: size };
    if (size <= floor) break;
    size = Math.max(size * 0.94, floor);
  }

  const maxLines = lineBudget(floor, height, hasCode);
  const perLine = width / floor;
  const broken = tokens.flatMap((t) => hardBreak(t, perLine));
  let lines = pack(broken, perLine) ?? broken;
  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    let last = lines[maxLines - 1];
    while (last && emWidth(last + "…") > perLine) last = [...last].slice(0, -1).join("");
    lines[maxLines - 1] = last + "…";
  }
  return { lines, fontSize: floor };
}
