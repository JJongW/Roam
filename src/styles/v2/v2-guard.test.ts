import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lengthsModule, readPinned, sha256 } from "../../../scripts/tokens-sync.mjs";

/**
 * 디자인 시스템 v2 검사 두 가지(2026-11-18 Ted: "웹은 디자인 값을 Roam-design에서만 받는다").
 *
 * 1. 사본 검사 — src/styles/v2/*.css가 source.json에 고정한 Roam-design 커밋의 생성본과
 *    바이트까지 같은가. 손으로 고치면(또는 커밋만 바꾸고 sync를 잊으면) 여기서 막힌다.
 *    Roam-design을 읽을 수 있으면(옆 체크아웃이나 gh) 원본과 직접 맞대고, 못 읽는 곳(CI 등)은
 *    sync가 적어 둔 sha256과 맞댄다. 원본 비교는 `npm run tokens:check`로도 돌린다.
 *
 * 2. 지역 값 검사 — v2로 옮긴 파일(V2_FILES)에 색 hex, rgb(), Tailwind 임의값(`[13px]`,
 *    `[#fff]`), v1 토큰(`var(--primary)`, `bg-card`), Tailwind 기본 눈금(`p-4`, `text-sm`,
 *    `rounded-lg`)이 새로 들어오지 않게 한다. 값이 없으면 Roam-design `tokens/v2/*.json`에
 *    먼저 더하고 PR을 낸 뒤 sync한다. 여기에 예외를 늘려 지나가지 않는다.
 *    허용: `-v2-` 유틸리티, `var(--roam-v2-*)`, 그 변수만 담은 임의값(`size-[var(--roam-v2-icon-size-md)]`).
 */

const source = JSON.parse(readFileSync("src/styles/v2/source.json", "utf8")) as {
  repo: string;
  commit: string;
  files: { from: string; to: string; sha256: string }[];
};

describe("v2 토큰 사본은 Roam-design 고정 커밋 그대로다", () => {
  it("커밋은 40자리 해시다(브랜치 이름이 아니다)", () => {
    expect(source.commit).toMatch(/^[0-9a-f]{40}$/);
  });

  it.each(source.files)("$to — 머리 주석과 sha256이 그대로다", (f) => {
    const buf = readFileSync(f.to);
    expect(buf.toString("utf8").split("\n")[0]).toContain("DO NOT EDIT");
    expect(sha256(buf), `${f.to}을 손으로 고쳤거나 sync를 안 돌렸어요. npm run tokens:sync`).toBe(f.sha256);
  });

  const upstreamReadable = readPinned(source.repo, source.commit, source.files[0].from) !== null;
  it.skipIf(!upstreamReadable).each(source.files)("$to — Roam-design 원본과 바이트까지 같다", (f) => {
    const upstream = readPinned(source.repo, source.commit, f.from) as Buffer;
    expect(Buffer.compare(readFileSync(f.to), upstream)).toBe(0);
  });

  it("lengths.generated.ts는 tokens.css에서 기계로 뽑은 그대로다", () => {
    const css = readFileSync("src/styles/v2/tokens.css", "utf8");
    expect(readFileSync("src/styles/v2/lengths.generated.ts", "utf8")).toBe(lengthsModule(css));
  });
});

/** v2로 옮긴 파일. 새 v2 화면을 만들면 여기에 넣는다. 줄이지 않는다. */
export const V2_FILES = [
  "src/components/v2/romi-avatar.tsx",
  "src/components/v2/heart-button.tsx",
  "src/components/v2/visited-pill.tsx",
  "src/components/v2/category-chip.tsx",
  "src/components/v2/snackbar.tsx",
  "src/components/v2/back-button.tsx",
  "src/components/map-v2/fair-map-screen.tsx",
  "src/components/map-v2/map-layer.tsx",
  "src/components/map-v2/heart-label.tsx",
  "src/components/map-v2/heart-cell.ts",
  "src/components/map-v2/map-skeleton.tsx",
  "src/components/map-v2/booth-card.tsx",
  "src/components/map-v2/hall-switch.tsx",
  "src/components/map-v2/map-compass.tsx",
  "src/components/map-v2/bottom-sheet.tsx",
  "src/components/map-v2/romi-card.tsx",
  "src/components/map-v2/romi-sheet.tsx",
  "src/components/map-v2/route-sheet.tsx",
  "src/components/map-v2/recap-sheet.tsx",
  "src/components/inbox/inbox-bell.tsx",
  "src/components/inbox/inbox-screen.tsx",
  "src/components/booth-v2/mini-map.tsx",
  "src/components/me/me-ui.tsx",
  "src/components/me/my-page.tsx",
  "src/components/me/my-page-link.tsx",
  "src/components/me/heart-list.tsx",
  "src/components/me/brand-heart-list.tsx",
  "src/components/me/settings-screen.tsx",
  "src/components/me/profile-screen.tsx",
  "src/components/me/delete-account.tsx",
  "src/components/booth-v2/booth-detail.tsx",
  "src/components/booth-v2/booth-actions.tsx",
  "src/components/booth-v2/booth-detail-skeleton.tsx",
  // UI 24 Q1 A 브랜드 칸
  "src/components/booth-v2/brand-row.tsx",
  "src/app/(visitor)/exhibitions/[slug]/map/page.tsx",
  "src/app/(visitor)/exhibitions/[slug]/map/loading.tsx",
  "src/app/(visitor)/booths/[id]/page.tsx",
  "src/app/(visitor)/booths/[id]/loading.tsx",
  // W2(UI 6, v1 상세 칸 옮김)
  "src/components/v2/choice-chip.tsx",
  "src/components/v2/line-input.tsx",
  // UI 1 첫 진입, 10 열리기 전, 11 끝난 박람회 지도
  "src/components/map-v2/entry-cards.tsx",
  "src/components/map-v2/today-sheet.tsx",
  "src/components/booth-v2/left-section.tsx",
  "src/components/booth-v2/verdict-band.tsx",
  "src/components/booth-v2/booth-extras.tsx",
  "src/components/booth-v2/visited-list.tsx",
  "src/app/(visitor)/visited/page.tsx",
  // UI 20 홈과 박람회 전체, 11 끝난 박람회 입구, 16 오프라인 띠
  "src/app/(visitor)/page.tsx",
  "src/app/(visitor)/fairs/page.tsx",
  "src/components/home/fair-row.tsx",
  "src/components/home/home-body.tsx",
  "src/components/home/all-fairs.tsx",
  "src/components/home/hearted-brands.tsx",
  "src/components/home/verdict-ask.tsx",
  "src/components/common/offline-band.tsx",
  // UI 5-04, 5-07 로그인 시트(지금 화면 위)와 /login 페이지
  "src/components/auth/login-panel.tsx",
  "src/components/auth/login-sheet.tsx",
  "src/app/login/login-form.tsx",
  // UI 8 둘러보기(8-01~8-04)
  "src/components/browse/booth-list-screen.tsx",
];

/** 주석을 지운다 — 설명에 예시 값이 들어 있어도 된다. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " ")).replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
}

interface Rule {
  why: string;
  re: RegExp;
}

const RULES: Rule[] = [
  { why: "색 hex", re: /#[0-9a-fA-F]{3,8}\b/ },
  { why: "색 함수", re: /\b(?:rgba?|hsla?|oklch|oklab)\(/ },
  {
    why: "Tailwind 임의값 — v2 변수만 담은 것만 된다",
    // `xxx-[...]` 중 안이 var(--roam-v2-…) 하나가 아닌 것.
    re: /[a-z0-9]-\[(?!var\(--roam-v2-[a-z0-9-]+\)\])[^\]]*\]/,
  },
  { why: "v2가 아닌 CSS 변수", re: /var\(--(?!roam-v2-)[a-z0-9-]+/ },
  {
    why: "v1 색 이름(bg-card, text-muted-foreground …)",
    re: /(?<![\w-])(?:bg|text|border|ring|fill|stroke|outline|divide|from|to|via|shadow|placeholder|caret|accent|decoration)-(?:background|foreground|card|popover|primary|secondary|muted|accent|destructive|success|warning|border|input|ring|chart|route|judge|booth|white|black|gray|slate|zinc|neutral|red|blue|green|amber|indigo)(?![\w]|-(?:weak|muted|subtle|solid|contrast|inverted)\b)/,
  },
  {
    why: "Tailwind 기본 간격 눈금(p-4, gap-2 …) — -v2- 간격을 쓴다",
    re: /(?<![\w-])-?(?:p|px|py|pt|pb|pl|pr|ps|pe|m|mx|my|mt|mb|ml|mr|ms|me|gap|gap-x|gap-y|space-x|space-y|top|bottom|left|right|inset|inset-x|inset-y|translate-x|translate-y)-(?:[1-9]\d*(?:\.\d+)?|0\.\d+|px)(?![\w/-])/,
  },
  {
    why: "Tailwind 기본 글자 눈금(text-sm …) — text-v2-t* 를 쓴다",
    re: /(?<![\w-])text-(?:xs|sm|base|lg|[2-9]?xl)(?![\w-])/,
  },
  {
    why: "Tailwind 기본 둥글기(rounded-lg …) — rounded-v2-* 를 쓴다",
    re: /(?<![\w-])rounded(?:-[trblse]{1,2})?(?:-(?:sm|md|lg|xl|2xl|3xl|full|none))?(?=[\s"'`]|$)/,
  },
  {
    why: "Tailwind 기본 그림자, 굵기, 행간, 자간",
    re: /(?<![\w-])(?:shadow(?:-(?:sm|md|lg|xl|2xl|inner))?|font-(?:thin|light|normal|medium|semibold|bold|extrabold|black)|leading-(?:\d+|none|tight|snug|normal|relaxed|loose)|tracking-(?:tighter|tight|normal|wide|wider|widest))(?=[\s"'`]|$)/,
  },
  {
    why: "Tailwind 기본 크기 눈금(size-5, w-10 …) — 아이콘은 icon-size 변수를 쓴다",
    re: /(?<![\w-])(?:size|w|h|min-w|min-h|max-w|max-h)-(?:[1-9]\d*(?:\.\d+)?|0\.\d+)(?![\w/-])/,
  },
];

describe.each(V2_FILES)("%s", (path) => {
  it("디자인 값을 v2 토큰에서만 받는다", () => {
    const lines = stripComments(readFileSync(path, "utf8")).split("\n");
    const bad: string[] = [];
    lines.forEach((line, i) => {
      for (const r of RULES) if (r.re.test(line)) bad.push(`${path}:${i + 1} [${r.why}] ${line.trim()}`);
    });
    expect(bad, `토큰 밖 값 ${bad.length}줄`).toEqual([]);
  });
});

describe("검사 규칙 자체", () => {
  const hit = (line: string) => RULES.some((r) => r.re.test(line));
  it.each([
    'className="text-[13px]"',
    'className="bg-[#fff]"',
    'style={{ color: "#4f46e5" }}',
    'className="bg-card text-muted-foreground"',
    'className="p-4 gap-2"',
    'className="text-sm"',
    'className="rounded-lg"',
    'className="shadow-md font-bold"',
    'className="size-5"',
    'fill="var(--primary)"',
    'className="w-[360px]"',
    "fill: rgb(0 0 0)",
  ])("막는다: %s", (line) => expect(hit(line)).toBe(true));
  it.each([
    'className="text-v2-t4 font-v2-bold p-v2-x4 gap-v2-x2 rounded-v2-r3 shadow-v2-s2"',
    'className="size-[var(--roam-v2-icon-size-md)] border-v2-stroke-neutral-muted"',
    'className="left-1/2 top-0 -translate-x-1/2 w-2/5 aspect-3/4 inset-0"',
    'fill={C("stroke-neutral-weak")}',
  ])("통과: %s", (line) => expect(hit(line)).toBe(false));
});
