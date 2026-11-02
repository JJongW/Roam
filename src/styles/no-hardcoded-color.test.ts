import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 화면 CSS에 색을 **직접 쓰지 않는다** — 토큰(`var(--…)`)만 쓴다.
 *
 * 왜 검사로 막나: 이 파일은 한 번 25곳을 토큰으로 바꿨다. 그런데 색을 직접 쓰는 건
 * 언제나 토큰을 찾는 것보다 빠르고, 리뷰에서 한 줄짜리 `#f2f4f6`은 눈에 안 띈다.
 * 다크 모드에서만 안 읽히는 글자가 되어 나중에 발견되는데, 그때는 어느 커밋이
 * 넣었는지 찾는 비용이 더 크다.
 *
 * `tokens.css`는 검사하지 않는다 — 거기가 색이 실제로 적히는 **유일한** 자리다
 * (그리고 그 파일은 `Roam-design`이 생성한다).
 */
const SOURCE = "src/app/globals.css";

/**
 * 토큰이 아직 없어서 직접 쓰는 값. **줄이기만 하고 늘리지 않는다.**
 *
 * 그림자: 디자인 시스템 소스에 `shadow.json`(card·float·sheet·pop)이 있는데
 * CSS 변수로는 내보내지 않는다(`tokens/formats/css.mjs`). 그래서 지금은 쓸 토큰이
 * 없다 — 여기서 토큰을 지어내면 `Roam-design`과 갈라지므로 디자인 시스템 쪽에서
 * 결정이 나야 한다.
 */
const ALLOWED = ["box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)"];

describe("globals.css", () => {
  it("색을 직접 쓰지 않는다 — 토큰만 쓴다", () => {
    const lines = readFileSync(SOURCE, "utf8").split("\n");
    const bad: string[] = [];
    let inBlockComment = false;

    lines.forEach((raw, i) => {
      let line = raw;
      // 주석은 설명이라 색 이름이 들어 있어도 된다("Primary: Indigo (#4f46e5)").
      if (inBlockComment) {
        const end = line.indexOf("*/");
        if (end === -1) return;
        line = line.slice(end + 2);
        inBlockComment = false;
      }
      const open = line.indexOf("/*");
      if (open !== -1) {
        const close = line.indexOf("*/", open + 2);
        if (close === -1) {
          inBlockComment = true;
          line = line.slice(0, open);
        } else {
          line = line.slice(0, open) + line.slice(close + 2);
        }
      }
      if (ALLOWED.some((a) => line.includes(a))) return;
      if (/#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/.test(line)) {
        bad.push(`${SOURCE}:${i + 1}  ${line.trim()}`);
      }
    });

    expect(bad, `토큰 대신 색을 직접 쓴 곳 ${bad.length}줄`).toEqual([]);
  });

  it("예외 목록이 실제로 쓰이는지 — 죽은 예외를 남기지 않는다", () => {
    const css = readFileSync(SOURCE, "utf8");
    const dead = ALLOWED.filter((a) => !css.includes(a));
    expect(dead, "고쳐졌거나 사라진 예외는 목록에서 지운다").toEqual([]);
  });
});
