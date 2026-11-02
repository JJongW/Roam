import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 색은 **토큰에서만 온다** — 화면 코드에 직접 적지 않는다.
 *
 * 왜 검사로 막나: `globals.css` 25곳과 지도 12곳을 한 번 토큰으로 바꿨다. 그런데
 * 색을 직접 적는 건 언제나 토큰을 찾는 것보다 빠르고, 리뷰에서 한 줄짜리 `#f2f4f6`은
 * 눈에 안 띈다. 그렇게 들어온 색은 **다크 모드에서만 안 읽히는 글자**로 나타나고,
 * 그때는 어느 커밋이 넣었는지 찾는 비용이 더 크다.
 *
 * `tokens.css`는 검사하지 않는다 — 거기가 색이 실제로 적히는 **유일한** 자리이고,
 * 그 파일은 `Roam-design`이 생성한다.
 *
 * 새 화면을 만들면 여기 목록에 넣는다. 목록이 아니라 디렉터리 전체로 넓히는 건
 * 아직 안 한다 — 지금 토큰이 안 닿은 화면이 더 있어서, 켜는 순간 무더기로 빨개지고
 * 그러면 이 검사를 끄게 된다. **줄어드는 방향으로만** 넓힌다.
 */
interface Guarded {
  path: string;
  /**
   * 토큰이 없거나 색이 아니라서 직접 쓰는 줄. **줄이기만 하고 늘리지 않는다.**
   * 각 항목은 왜 예외인지 이유를 달고 들어온다.
   */
  allowed: string[];
}

const GUARDED: Guarded[] = [
  {
    path: "src/app/globals.css",
    allowed: [
      // 디자인 시스템 소스에 `shadow.json`(card·float·sheet·pop)이 있는데 CSS 변수로는
      // 내보내지 않는다(`tokens/formats/css.mjs`). 쓸 토큰이 없다 — 여기서 이름을
      // 지어 붙이면 `Roam-design`과 갈라지므로 디자인 시스템 쪽 결정이 필요하다.
      "box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)",
    ],
  },
  {
    path: "src/components/map/exhibition-map.tsx",
    allowed: [
      // 디자인 색이 아니라 **데이터 센티넬**이다. 도면 데이터가 "색 없음"을 이 값으로
      // 말하고, 코드는 그걸 보면 존 색 대신 테두리 색으로 떨어뜨린다. 토큰으로 올리면
      // "이건 우리가 고를 수 있는 색"이라는 거짓말이 된다.
      'const FLOORPLAN_NO_COLOR = "#d8dade"',
    ],
  },
  { path: "src/components/map/map-view.tsx", allowed: [] },
];

/** 주석을 지운다 — 설명에 색 이름이 들어 있어도 된다("Primary: Indigo (#4f46e5)"). */
function stripComments(src: string): string[] {
  const out: string[] = [];
  let inBlock = false;
  for (let line of src.split("\n")) {
    if (inBlock) {
      const end = line.indexOf("*/");
      if (end === -1) {
        out.push("");
        continue;
      }
      line = line.slice(end + 2);
      inBlock = false;
    }
    for (;;) {
      const open = line.indexOf("/*");
      if (open === -1) break;
      const close = line.indexOf("*/", open + 2);
      if (close === -1) {
        inBlock = true;
        line = line.slice(0, open);
        break;
      }
      line = line.slice(0, open) + line.slice(close + 2);
    }
    const slash = line.indexOf("//");
    out.push(slash === -1 ? line : line.slice(0, slash));
  }
  return out;
}

const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(|\bhsla?\(|\boklch\(/;

describe.each(GUARDED)("$path", ({ path, allowed }) => {
  it("색을 직접 쓰지 않는다 — 토큰만 쓴다", () => {
    const bad = stripComments(readFileSync(path, "utf8"))
      .map((line, i) => ({ line, n: i + 1 }))
      .filter(({ line }) => COLOR.test(line) && !allowed.some((a) => line.includes(a)))
      .map(({ line, n }) => `${path}:${n}  ${line.trim()}`);
    expect(bad, `토큰 대신 색을 직접 쓴 곳 ${bad.length}줄`).toEqual([]);
  });

  it("예외가 실제로 쓰이는지 — 죽은 예외를 남기지 않는다", () => {
    const src = readFileSync(path, "utf8");
    expect(
      allowed.filter((a) => !src.includes(a)),
      "고쳐졌거나 사라진 예외는 목록에서 지운다",
    ).toEqual([]);
  });
});
