import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * 문장용 타입 유틸 가드 — 문서가 아니라 테스트가 규칙을 지킨다.
 *
 * 한글 본문 행간은 문자 크기의 160% 이상이어야 한다(W3C klreq).
 * WCAG 1.4.12는 사용자가 1.5배를 강제해도 깨지지 않을 것을 요구하므로,
 * 저작값이 1.5 미만이면 사용자가 실제로 쓰는 간격을 한 번도 안 본 것이다.
 * 원시 스케일(--text-*)은 SEED 공유값이라 여기서 검사하지 않는다.
 */
const css = readFileSync(
  resolve(import.meta.dirname, "../../app/globals.css"),
  "utf-8",
);

/** `.type-body { font-size: 1rem; line-height: 1.625rem; }` 같은 블록에서 둘을 뽑는다. */
function ratioOf(utility: string): number {
  const block = new RegExp(`\\.${utility}\\s*\\{([^}]*)\\}`).exec(css);
  expect(block, `${utility} 유틸리티가 globals.css에 없다`).not.toBeNull();
  const body = block![1];
  const size = /font-size:\s*([0-9.]+)rem/.exec(body);
  const line = /line-height:\s*([0-9.]+)rem/.exec(body);
  expect(size, `${utility}에 font-size(rem)가 없다`).not.toBeNull();
  expect(line, `${utility}에 line-height(rem)가 없다`).not.toBeNull();
  return Number(line![1]) / Number(size![1]);
}

describe("문장용 타입 유틸리티", () => {
  it(".type-body 행간은 한글 본문 기준 1.6 이상이다", () => {
    expect(ratioOf("type-body")).toBeGreaterThanOrEqual(1.6);
  });

  it(".type-body-lg 행간은 1.55 이상이다 (17px 본문은 비율이 조금 낮아도 절대 간격이 확보된다)", () => {
    expect(ratioOf("type-body-lg")).toBeGreaterThanOrEqual(1.55);
  });

  it(".type-body-lg 글자 크기는 Apple HIG 본문 권장값 17px 이상이다", () => {
    const block = /\.type-body-lg\s*\{([^}]*)\}/.exec(css)!;
    const size = Number(/font-size:\s*([0-9.]+)rem/.exec(block[1])![1]);
    expect(size * 16).toBeGreaterThanOrEqual(17);
  });
});
