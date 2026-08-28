# Roam 웹 레포 — Roam-design 토큰 소비 마이그레이션 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Roam`(웹) 레포가 `globals.css`에 손으로 쓴 5개 토큰 카테고리(색 베이스값·판단색·모션·스페이싱)를 `Roam-design`이 생성한 CSS로 교체하고, `docs/brand/`를 제거해 `Roam-design`을 가리키게 한다.

**Architecture:** `Roam-design/tokens/formats/css.mjs`를 레거시 이름·`.dark` 선택자로 확장 → 재생성 → `Roam-design/dist/web/tokens.css`를 `Roam/src/styles/tokens.css`로 벤더링(복사·커밋) → `Roam`의 `globals.css`가 `@import`하고 대응하는 손 선언을 지운다.

**Tech Stack:** Node.js/Style Dictionary(Roam-design 쪽), Next.js/Tailwind v4(Roam 쪽) — 기존 스택 그대로, 새 의존성 없음.

## Global Constraints

- 토큰 값은 바꾸지 않는다 — 이름·선택자 포맷만 바꾼다. `tokens/src/*.json` 원본 값 수정 금지.
- 이번 마이그레이션 대상은 정확히 5개 카테고리: `color`(베이스 값), `judgeColor`, `motion.duration`, `motion.easing`, `spacing`(의미 토큰). 라운드·섀도우·타이포·가치색은 범위 밖 — 건드리지 않는다(스펙 §3, §4, §9).
- `@theme inline` 블록(`Roam/src/app/globals.css` 168-234행)은 이번엔 손대지 않는다.
- 다크모드는 `.dark` 클래스 선택자로 낸다(`@media (prefers-color-scheme: dark)` 아님) — `Roam`이 `next-themes`를 `attribute="class"`로 쓰기 때문(스펙 §3).
- `Roam` 레포엔 이 작업과 무관한 미커밋 변경이 있다(`README.md`·`src/app/layout.tsx`·`src/app/(visitor)/page.tsx`·`src/app/manifest.ts`·`src/lib/loading-messages.ts` 등) — 이 파일들을 건드리지 않는다. `docs/brand/` 경로를 언급하는 주석이 이 파일들에도 있지만(코드 동작엔 영향 없는 순수 주석), 이번 플랜에서 고치지 않는다 — 진행 중인 다른 작업과 충돌 위험. `src/lib/i18n/brand-voice.test.ts`는 미커밋 변경 목록에 없어 안전하게 고친다.
- Swift/iOS 관련 없음 — 이 플랜은 `Roam-design`과 `Roam` 두 레포만 건드린다.

---

### Task 1: `Roam-design` — 웹 CSS 포맷을 레거시 이름·`.dark` 선택자로 확장

**Files:**
- Modify: `/Users/sjw/ted.urssu/Roam-design/tokens/formats/css.mjs`
- Modify: `/Users/sjw/ted.urssu/Roam-design/tests/build-web.test.mjs`

**Interfaces:**
- Consumes: 없음(기존 `tokens/src/*.json`, `tokens/lib/naming.mjs`의 `toVarName` 그대로 재사용).
- Produces: `dist/web/tokens.css`가 `color`/`judgeColor`/`motion`/`spacing` 카테고리를 레거시 이름으로, 다크값은 `.dark { ... }` 선택자로 낸다. `radius`/`shadow`/`typography`/`valueColor`는 기존 산출 그대로(변경 없음) — Task 2 이후 아무도 이 부분을 읽지 않는다.

**주의**: 이 태스크는 `Roam-ios`/`Roam`과 무관한 별도 레포(`Roam-design`, 이미 `master`에 토큰 파이프라인이 merge돼 있고 워킹트리는 clean)다. `Roam-design`은 지금 미커밋 변경이 없으므로 워크트리 격리 없이 `master`에서 바로 브랜치 없이 작업해도 안전하다 — 이 레포 자체의 `master`에 직접 커밋한다(워크트리 스킵).

- [ ] **Step 1: 현재 산출물 확인 (베이스라인)**

Run: `cd /Users/sjw/ted.urssu/Roam-design && npm run build:tokens && cat dist/web/tokens.css | head -20`
Expected: 지금 이름(`--color-primary`, `--judge-color-must` 등)과 `@media (prefers-color-scheme: dark)` 블록이 보임 — 바꾸기 전 상태 확인.

- [ ] **Step 2: `css.mjs`에 레거시 네이밍 헬퍼 추가**

`tokens/formats/css.mjs`를 다음으로 교체:

```javascript
import { toVarName } from "../lib/naming.mjs";

// Web-legacy naming: Roam's existing globals.css already uses these names
// (`--primary`, `--judge-must`, `--motion-d1`, `--spacing-global-gutter`) —
// this repo renames its output to match rather than asking the one real
// consumer to add an alias layer. Only color/judgeColor/motion get a custom
// mapping; spacing already matches the default `toVarName(path)` behavior;
// radius/shadow/typography are untouched (not migrated yet — see plan §Task 1 note).
function legacyVarName(path) {
  const [category, ...rest] = path;
  if (category === "color") {
    return toVarName(rest); // --primary, --muted-foreground, --chart-1, --route-visited, ...
  }
  if (category === "judgeColor") {
    return `judge-${toVarName(rest)}`; // --judge-must, --judge-curious, ...
  }
  if (category === "motion") {
    const [kind, ...tail] = rest;
    if (kind === "duration") return `motion-${toVarName(tail)}`; // --motion-d1
    if (kind === "easing") return `motion-ease-${toVarName(tail)}`; // --motion-ease-enter
  }
  return toVarName(path); // spacing (unchanged), radius, shadow, typography (unchanged)
}

function renderValue(path, value) {
  const category = path[0];
  if (value && typeof value === "object" && "light" in value) {
    return { light: value.light, dark: value.dark };
  }
  if (category === "shadow") {
    return { both: `${value.x}px ${value.y}px ${value.blur}px rgba(0, 0, 0, ${value.opacity})` };
  }
  if (category === "typography") {
    return {
      sizeVar: `--${toVarName(["typography", ...path.slice(1), "size"])}: ${value.size}px;`,
      lineHeightVar: `--${toVarName(["typography", ...path.slice(1), "line-height"])}: ${value.lineHeight}px;`,
    };
  }
  if (category === "motion" && path[1] === "easing") {
    return { both: `cubic-bezier(${value.join(", ")})` };
  }
  // motion.duration is specified in ms (tokens/src/motion.json / task-1 spec), not px —
  // the generic "number -> px" fallback below would be semantically wrong for it.
  if (category === "motion" && path[1] === "duration") {
    return { both: `${value}ms` };
  }
  if (typeof value === "number") {
    return { both: `${value}px` };
  }
  return { both: String(value) };
}

export function cssFormat({ dictionary }) {
  const rootLines = [];
  const darkLines = [];

  for (const token of dictionary.allTokens) {
    const rendered = renderValue(token.path, token.original.value);
    if (rendered.sizeVar) {
      rootLines.push(`  ${rendered.sizeVar}`, `  ${rendered.lineHeightVar}`);
      continue;
    }
    const varName = `--${legacyVarName(token.path)}`;
    if (rendered.both !== undefined) {
      rootLines.push(`  ${varName}: ${rendered.both};`);
    } else {
      rootLines.push(`  ${varName}: ${rendered.light};`);
      darkLines.push(`  ${varName}: ${rendered.dark};`);
    }
  }

  return [
    "/* Generated by tokens/build.mjs — DO NOT EDIT. */",
    ":root {",
    rootLines.join("\n"),
    "}",
    "",
    ".dark {",
    darkLines.join("\n"),
    "}",
    "",
  ].join("\n");
}
```

- [ ] **Step 3: 재생성, 새 산출물 확인**

Run: `npm run build:tokens && cat dist/web/tokens.css`
Expected: `:root { --primary: #4f46e5; ... --judge-must: #4f46e5; ... --motion-d1: 50ms; ... --spacing-global-gutter: 16px; ... }` 그리고 `.dark { --primary: #818cf8; ... }`(미디어쿼리 아님). `--radius-*`/`--shadow-*`/`--typography-*`/`--value-color-*`는 이전과 동일하게 그대로 있어야 함(안 건드림).

- [ ] **Step 4: `build-web.test.mjs` 어서션을 새 이름으로 갱신**

`tests/build-web.test.mjs`를 다음으로 교체:

```javascript
import { test } from "node:test";
import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

test("build:tokens produces dist/web/tokens.css with expected variables", () => {
  execSync("npm run build:tokens", { stdio: "pipe" });
  const css = readFileSync(new URL("../dist/web/tokens.css", import.meta.url), "utf8");
  assert.match(css, /--primary: #4f46e5;/);
  assert.match(css, /--muted-foreground: #6b7684;/);
  assert.match(css, /--judge-curious: #8b88ee;/);
  assert.match(css, /--chart-1: #4f46e5;/);
  assert.match(css, /--radius-default: 14px;/);
  assert.match(css, /--spacing-global-gutter: 16px;/);
  assert.match(css, /--typography-xl2-size: 24px;/);
  assert.match(css, /--motion-ease-enter: cubic-bezier\(0, 0, 0\.15, 1\);/);
  assert.match(css, /--motion-d3: 150ms;/);
  assert.match(css, /--shadow-card: 0px 1px 4px rgba\(0, 0, 0, 0\.08\);/);
  assert.doesNotMatch(css, /@media \(prefers-color-scheme: dark\)/);
  assert.match(css, /\.dark \{[^}]*--primary: #818cf8;/s);
});
```

- [ ] **Step 5: 전체 테스트 실행, 통과 확인**

Run: `DEVELOPER_DIR=/Applications/Xcode.app/Contents/Developer npm run test:tokens`
Expected: 7개 테스트 전부 PASS (iOS 산출물은 이 태스크에서 안 건드렸으니 그대로 통과해야 함 — 만약 실패하면 되돌아가서 확인).

- [ ] **Step 6: 커밋**

```bash
cd /Users/sjw/ted.urssu/Roam-design
git add tokens/formats/css.mjs tests/build-web.test.mjs dist/web/tokens.css
git commit -m "feat(web): 웹 CSS 산출물을 레거시 변수명·.dark 선택자로 전환"
```

---

### Task 2: `Roam` — 토큰 벤더링 + `globals.css` 교체

**Files:**
- Create: `Roam/src/styles/tokens.css`
- Modify: `Roam/src/app/globals.css`

**Interfaces:**
- Consumes: Task 1의 `Roam-design/dist/web/tokens.css`(파일 내용을 그대로 복사).
- Produces: 없음(다음 태스크는 독립적).

작업 격리: 이 태스크부터는 `Roam` 레포에서 작업 — 미커밋 변경이 20개 가까이 있으므로 격리된 워크트리에서 진행한다(superpowers:using-git-worktrees, `feature/roam-design-token-migration` 브랜치).

- [ ] **Step 1: 벤더 파일 복사**

```bash
mkdir -p src/styles
cp /Users/sjw/ted.urssu/Roam-design/dist/web/tokens.css src/styles/tokens.css
```

- [ ] **Step 2: `globals.css` 최상단에 import 추가**

`src/app/globals.css`의 `@import "tw-animate-css";` 바로 다음(3번째 줄)에 추가:

```css
@import "../styles/tokens.css";
```

- [ ] **Step 3: `:root` 블록에서 마이그레이션 대상 5개 카테고리 선언 제거**

`src/app/globals.css`의 `:root { ... }` 블록(11-115행)에서 아래 줄들을 지운다 — **이 줄들만**, 나머지(`--radius`, `*-foreground` 계열, `--ring`, `--route-line`, `--booth-*`, `--heatmap-blend`, 원시 스페이싱 스케일 `--spacing-x*`)는 그대로 둔다:

```
--background: #ffffff;
--foreground: #14161a;
--card: #ffffff;
--popover: #ffffff;
--primary: #4f46e5; /* indigo-600 */
--secondary: #f2f4f6;
--muted: #f2f4f6;
--muted-foreground: #6b7684;
--accent: #eef2ff; /* indigo-50 */
--destructive: #f04452;
--success: #15c47e;
--warning: #ffb020;
--border: #e5e8eb;
--input: #e5e8eb;
--chart-1: #4f46e5;
--chart-2: #15c47e;
--chart-3: #ffb020;
--chart-4: #06b6d4;
--chart-5: #f04452;
--route-visited: #15c47e;
--judge-must: var(--primary);
--judge-curious: #8b88ee;
--judge-good: var(--route-visited);
--judge-ok: #7edcb4;
--judge-bad: #d0595d;
--judge-pass: #aab2bf;
--spacing-global-gutter: var(--spacing-x4); /* 16px — 화면 좌우 기본 여백 */
--spacing-component-default: var(--spacing-x3); /* 12px — 컴포넌트 간 기본 세로 간격 */
--spacing-nav-to-title: var(--spacing-x5); /* 20px — 상단바~타이틀 */
--spacing-screen-bottom: var(--spacing-x14); /* 56px — 화면 하단 여백 */
--spacing-between-text: var(--spacing-x1-5); /* 6px — 텍스트 요소 간 */
--spacing-between-chips: var(--spacing-x2); /* 8px — 칩 간 가로 간격 */
--motion-d1: 50ms;
--motion-d2: 100ms;
--motion-d3: 150ms;
--motion-d4: 200ms;
--motion-d5: 250ms;
--motion-d6: 300ms;
--motion-ease-linear: cubic-bezier(0, 0, 1, 1); /* 등속 — 스피너 등 반복 재생용 */
--motion-ease-functional: cubic-bezier(0.35, 0, 0.35, 1);
--motion-ease-enter: cubic-bezier(0, 0, 0.15, 1);
--motion-ease-exit: cubic-bezier(0.35, 0, 1, 1);
--motion-ease-enter-expressive: cubic-bezier(0.03, 0.4, 0.1, 1);
--motion-ease-exit-expressive: cubic-bezier(0.35, 0, 0.95, 0.55);
```

`--route-line`(52행)은 지우지 않는다 — `Roam-design`에 없는 토큰(스펙 §4 범위 밖).
`--motion-color-transition`/`--motion-pressed-scale`(106-107행, `var(--motion-d3)` 참조)도
지우지 않는다 — 이건 duration 값이 아니라 그걸 참조하는 별도 시맨틱 토큰이라
`Roam-design`에 대응 항목이 없다.

주석 줄(65-71행 근처 히트맵·SEED 스케일 설명 등)도 관련 없으면 그대로 둔다 — 코드만 지운다.

- [ ] **Step 4: `.dark` 블록에서 동일 카테고리 제거**

`.dark { ... }` 블록(117-166행)에서 위와 대응하는 다크값 선언을 지운다(`--background`부터 `--judge-pass`까지 — `.dark` 블록엔 스페이싱/모션이 원래 없다, 라이트와 공유). `--route-line`·`--booth-*`·`--heatmap-blend`는 그대로 둔다.

- [ ] **Step 5: 빌드 검증**

Run: `npx tsc --noEmit`
Expected: 에러 없음(CSS 변경은 타입체크에 안 걸리지만, 다른 걸 실수로 안 건드렸는지 확인 차원).

Run: `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next build`
Expected: 빌드 성공. `@import` 경로가 틀렸거나 `.dark`/`:root` 블록에 문법 오류가 있으면 여기서 잡힌다.

- [ ] **Step 6: 커밋**

```bash
git add src/styles/tokens.css src/app/globals.css
git commit -m "feat: 웹 토큰 5개 카테고리를 Roam-design 생성 CSS로 교체"
```

---

### Task 3: `Roam` — 브랜드 문서 이관 마무리

**Files:**
- Delete: `Roam/docs/brand/` (전체 — `00_brand-core.md`·`01_romi.md`·`02_voice-tone.md`·`03_visual.md`·`04_naming-messaging.md`·`README.md`·`_decisions-2026-08-15.md`·`assets/`)
- Create: `Roam/docs/brand.md`
- Modify: `Roam/src/lib/i18n/brand-voice.test.ts`

**Interfaces:**
- Consumes: 없음.
- Produces: 없음.

- [ ] **Step 1: `docs/brand/` 삭제**

Run: `git rm -r docs/brand`
Expected: 8개 마크다운 + `assets/` 하위 파일들이 삭제로 스테이징됨.

- [ ] **Step 2: 안내 파일 생성**

```markdown
# 브랜드 문서 위치 이동

Roam 브랜드 문서(정체성·로미 캐릭터·보이스톤·비주얼 원칙·네이밍·에셋)는
`Roam-design` 레포(`docs/brand/`)로 이관됐다 — 웹·iOS·(향후) Android가 공유하는
단일 소스로 통합하기 위함. 실제 디자인 토큰 값(색·타이포·스페이싱·라운드·섀도우·모션)도
`Roam-design/tokens/src/`가 근거다.

이관 스펙: `Roam-design/docs/superpowers/specs/2026-08-28-roam-design-brand-token-system-design.md`
```

Write to `docs/brand.md`.

- [ ] **Step 3: `brand-voice.test.ts` 주석 갱신**

`src/lib/i18n/brand-voice.test.ts` 9행 부근:

```typescript
 * 브랜드북(`docs/brand/`)의 1층(불변)·2층(생성)·4층(금칙)을 기계로 강제한다.
```

를 다음으로 교체:

```typescript
 * 브랜드북(이제 `Roam-design/docs/brand/`)의 1층(불변)·2층(생성)·4층(금칙)을 기계로 강제한다.
```

(로직·검사 대상은 변경 없음 — 이 파일은 `docs/brand/`를 import하지 않고 `DICTS`/`LOADING_MESSAGES`/`manifest` 문자열만 정규식으로 검사한다. 주석 한 줄만 고친다.)

- [ ] **Step 4: 테스트 실행**

Run: `npx vitest run src/lib/i18n/brand-voice.test.ts`
Expected: 기존과 동일하게 전부 PASS — 주석만 바뀌었으니 동작 변화 없어야 함.

- [ ] **Step 5: 커밋**

```bash
git add docs/brand.md src/lib/i18n/brand-voice.test.ts
git commit -m "docs: 브랜드 문서를 Roam-design으로 이관 완료, 안내 파일로 대체"
```

---

### Task 4: 전체 검증 — 타입체크·테스트·린트·시각 확인

**Files:** 없음(검증만).

**Interfaces:**
- Consumes: Task 1-3 전체.
- Produces: 없음 — 이 플랜의 마지막 태스크.

- [ ] **Step 1: 필수 검증 커맨드**

Run:
```bash
npx tsc --noEmit
npx vitest run
npx eslint src/app/globals.css src/styles/tokens.css src/lib/i18n/brand-voice.test.ts docs/brand.md 2>&1 || true
```
Expected: `tsc`·`vitest` 전부 통과(브랜드 보이스 가드 포함). `eslint`는 CSS/MD 파일 대상이면 스킵될 수 있음 — 에러 없으면 OK.

- [ ] **Step 2: 개발 서버로 시각 확인**

Run(백그라운드): `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev`

Claude-in-chrome(또는 사용 가능한 브라우저 툴)으로:
1. 전시 홈 화면 열기 — 라이트 모드에서 인디고 프라이머리 색·판단 색 칩(꼭갈래/끌려/좋았어 등)이 정상 렌더되는지 확인.
2. `next-themes` 다크 토글(우측 상단 등)로 다크모드 전환 — 같은 요소들이 다크 색상(`#818cf8` 계열)으로 정확히 바뀌는지 확인. **이게 이번 마이그레이션에서 제일 위험했던 지점**(`.dark` 클래스 선택자 vs 미디어쿼리) — 반드시 눈으로 확인.
3. 지도 화면 — 판단 색 렌더링 확인(부스 마커 등).

버그 발견 시: `Roam-design`의 `css.mjs`(Task 1) 또는 `globals.css`(Task 2)로 돌아가 수정.

- [ ] **Step 3: 완료 보고**

문제 없으면 이 플랜 완료. `Roam-design`(Task 1)과 `Roam`(Task 2-4) 양쪽 다 커밋된 상태 — 두 레포 별도로 머지/PR 결정 필요(각 레포 컨벤션대로).

## Self-Review 결과

- **스펙 커버리지**: §2(벤더링)→Task 2 Step 1, §3(네이밍·다크선택자)→Task 1, §5(docs/brand 제거)→Task 3, §6(globals.css)→Task 2, §7(검증)→Task 4. §4(범위 밖)·§9(후속)는 의도적으로 이 플랜에 없음.
- **플레이스홀더 스캔**: 없음 — 모든 스텝에 실제 코드/명령 포함.
- **타입 일관성**: Task 1에서 바뀐 CSS 변수명이 Task 2의 `globals.css` 삭제 대상 목록과 정확히 일치(둘 다 이 세션에서 실제 `globals.css`를 읽고 만든 목록).
- **범위 확인**: 라운드·섀도우·타이포·가치색·`Roam-ios` 연결은 이 플랜에 없음 — 의도된 것(후속).
