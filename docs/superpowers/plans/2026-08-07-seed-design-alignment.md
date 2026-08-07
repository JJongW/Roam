# SEED 디자인 토큰 정렬 — 1단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 색은 그대로 두고, 폰트를 Inter→Pretendard로 바꾸고, 간격·radius·그림자·모션·타이포
위계 토큰을 SEED 디자인 시스템(seed-design.io) 값으로 맞춘 뒤, `/admin/design-system`
페이지에서 이 토큰 전부(색 포함)를 한눈에 확인할 수 있게 한다.

**Architecture:** `globals.css`의 기존 `@theme inline` 항목(`--radius-*`, `--shadow-*`)은
이름을 유지한 채 값만 SEED 스케일로 교체한다 — 기존 컴포넌트 코드는 한 줄도 안 바뀌고
새 값을 자동으로 받는다. 새로 추가하는 간격·모션 토큰은 Tailwind가 자동으로 유틸리티
클래스를 만들어버리지 않도록 `@theme inline`이 아니라 `:root`에 둔다(2·3단계 전까지는
`var(--token)`으로만 명시적으로 쓰인다). 타이포는 Tailwind의 `--text-*`/`--text-*--line-height`
네임스페이스를 새로 채워 SEED `t`-스케일 값을 붓는다. 모션은 CSS 변수와 1:1 대응하는
JS 상수 모듈(`src/lib/motion.ts`)도 둔다 — framer-motion은 숫자를 요구해 CSS 변수를
직접 못 읽는다. `/admin/design-system`은 기존 `AdminSidebar`/`AdminSection`/`Card`를
그대로 쓰는 새 정적 페이지 하나로 시작한다.

**Tech Stack:** Next.js 16(App Router) · Tailwind v4(`@theme inline`) · `next/font/local` ·
`pretendard` npm 패키지 · shadcn/ui `Button`/`Card` · lucide-react.

## Global Constraints

- **색은 안 건드린다** — `globals.css`의 기존 `--primary`/`--secondary`/`--success` 등
  모든 색상 값은 그대로. `/admin/design-system`도 SEED 색이 아니라 **Roam 자체 팔레트**를
  보여준다.
- **폰트는 Pretendard로 교체** — `next/font/local`로 자체 호스팅. 크기·행간·굵기 체계는
  SEED `t1~t14` 스케일을 따른다.
- 기존 컴포넌트 코드(className)는 이번 스코프에서 **거의 안 건드린다** — 이름이 같은
  토큰은 값만 바꿔 자동 적용시킨다. 코드가 새 토큰을 "제대로" 쓰도록 정리하는 건 2단계.
- 새 간격·모션 토큰은 `@theme inline`이 아니라 `:root`에 둔다 — 의도치 않은 Tailwind
  유틸리티 클래스 생성을 피한다.
- `/admin/design-system`은 새 페이지 1개 + 필요한 하위 표시 컴포넌트만 추가한다 — 기존
  `/admin` 레이아웃(`src/app/admin/layout.tsx`)·사이드바 패턴을 재사용, 새로 안 만든다.
  이 레이아웃이 이미 `isAdminAuthed()` 게이트와 `AdminSidebar`/`AdminTopNav`를 씌워주므로
  페이지 자체엔 인증 체크가 필요 없다.
- 레이아웃/그리드 브레이크포인트는 관리자 콘솔에만 해당 — 방문객 앱(`max-w-md` 고정
  모바일 폭)은 이번 스코프 밖.
- SEED 값 출처: `docs/superpowers/specs/2026-08-07-seed-design-alignment.md`(1차 조사 +
  2026-08-07 재확인으로 typography line-height 오류 수정본). 각 태스크의 값은 이 문서에서
  그대로 옮긴 것이며 임의로 반올림하지 않는다.

---

### Task 1: Pretendard 폰트 교체

**Files:**
- Modify: `package.json` (dependencies)
- Modify: `src/app/layout.tsx`
- Modify: `src/app/globals.css:140`

**Interfaces:**
- Produces: CSS 변수 `--font-pretendard`(Next.js가 자동 생성), `--font-sans`가 이를
  참조. 이후 태스크는 건드리지 않음.

- [ ] **Step 1: pretendard 패키지 설치**

`package.json`의 `dependencies` 블록에 알파벳 순서로 추가(`next-themes`와 `react` 사이):

```json
    "next-themes": "^0.4.6",
    "pretendard": "^1.3.9",
    "react": "19.2.4",
```

Run: `npm install`

- [ ] **Step 2: `src/app/layout.tsx`의 폰트 로딩을 Inter → Pretendard로 교체**

기존:
```tsx
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { getLocale, hasLocaleCookie } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
```

교체:
```tsx
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { getLocale, hasLocaleCookie } from "@/lib/i18n/server";
import "./globals.css";

const pretendard = localFont({
  src: [
    {
      path: "../../node_modules/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/pretendard/dist/web/static/woff2/Pretendard-Medium.woff2",
      weight: "500",
    },
    {
      path: "../../node_modules/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2",
      weight: "700",
    },
  ],
  variable: "--font-pretendard",
  display: "swap",
});
```

같은 파일 안, `RootLayout`의 `<html className=...>`에서 `${inter.variable}`를
`${pretendard.variable}`로 교체:

```tsx
    <html
      lang={locale}
      className={`${pretendard.variable} h-full antialiased`}
      suppressHydrationWarning
    >
```

- [ ] **Step 3: `globals.css`의 `--font-sans`가 새 변수를 참조하도록 교체**

`src/app/globals.css:140`, 기존:
```css
  --font-sans: var(--font-inter), ui-sans-serif, system-ui, -apple-system, sans-serif;
```

교체:
```css
  --font-sans: var(--font-pretendard), ui-sans-serif, system-ui, -apple-system, sans-serif;
```

- [ ] **Step 4: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/app/layout.tsx src/app/globals.css`
Expected: 에러 없음.

Run: `npm run dev` (또는 이미 켜져 있으면 재사용) 후 브라우저로 아무 페이지나 열어
한글 텍스트가 Pretendard로 렌더되는지 눈으로 확인(개발자 도구 → Elements → Computed →
`font-family`에 Pretendard가 잡히는지, 또는 한글 글자 형태가 이전과 달라졌는지).

- [ ] **Step 5: 커밋**

```bash
git add package.json package-lock.json src/app/layout.tsx src/app/globals.css
git commit -m "feat(design): Inter → Pretendard 폰트 교체"
```

---

### Task 2: Spacing 토큰 추가

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `:root`에 CSS 커스텀 프로퍼티 `--spacing-x0-5`~`--spacing-x16`(원시 19개) +
  `--spacing-global-gutter`/`--spacing-component-default`/`--spacing-nav-to-title`/
  `--spacing-screen-bottom`/`--spacing-between-text`/`--spacing-between-chips`(의미 6개).
  Task 6이 `/admin/design-system`에서 이 정확한 변수 이름들을 그대로 읽는다.

- [ ] **Step 1: `:root` 블록 끝(`--booth-skipped-stroke` 다음 줄, 닫는 `}` 앞)에 추가**

`src/app/globals.css`, `:root { ... --booth-skipped-stroke: #e0a8ae; }` 바로 앞에 삽입:

```css

  /* SEED 간격 스케일 — 참고용 원시 토큰. Tailwind 유틸 네임스페이스(@theme) 밖에 둬서
     기존 px-4/gap-3 등 어떤 유틸리티도 안 건드린다. 2·3단계부터 var()로 명시 사용. */
  --spacing-x0-5: 0.125rem; /* 2px */
  --spacing-x1: 0.25rem; /* 4px */
  --spacing-x1-5: 0.375rem; /* 6px */
  --spacing-x2: 0.5rem; /* 8px */
  --spacing-x2-5: 0.625rem; /* 10px */
  --spacing-x3: 0.75rem; /* 12px */
  --spacing-x3-5: 0.875rem; /* 14px */
  --spacing-x4: 1rem; /* 16px */
  --spacing-x4-5: 1.125rem; /* 18px */
  --spacing-x5: 1.25rem; /* 20px */
  --spacing-x6: 1.5rem; /* 24px */
  --spacing-x7: 1.75rem; /* 28px */
  --spacing-x8: 2rem; /* 32px */
  --spacing-x9: 2.25rem; /* 36px */
  --spacing-x10: 2.5rem; /* 40px */
  --spacing-x12: 3rem; /* 48px */
  --spacing-x13: 3.25rem; /* 52px */
  --spacing-x14: 3.5rem; /* 56px */
  --spacing-x16: 4rem; /* 64px */

  --spacing-global-gutter: var(--spacing-x4); /* 16px — 화면 좌우 기본 여백 */
  --spacing-component-default: var(--spacing-x3); /* 12px — 컴포넌트 간 기본 세로 간격 */
  --spacing-nav-to-title: var(--spacing-x5); /* 20px — 상단바~타이틀 */
  --spacing-screen-bottom: var(--spacing-x14); /* 56px — 화면 하단 여백 */
  --spacing-between-text: var(--spacing-x1-5); /* 6px — 텍스트 요소 간 */
  --spacing-between-chips: var(--spacing-x2); /* 8px — 칩 간 가로 간격 */
```

`.dark` 블록엔 추가하지 않는다(간격은 색이 아니라 라이트/다크 공통).

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/app/globals.css`
Expected: 에러 없음. 이 시점엔 이 변수를 쓰는 코드가 없어 시각적 변화도 없다(의도된
동작 — Task 6에서 처음 소비됨).

- [ ] **Step 3: 커밋**

```bash
git add src/app/globals.css
git commit -m "feat(design): SEED 간격 토큰 추가(:root, 미사용 — Task 6에서 소비)"
```

---

### Task 3: Radius + Shadow 값 교체

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `--radius-sm/md/lg/xl/2xl`, `--shadow-card/sheet/pop` — 이름은 유지, 값만
  변경. 기존 컴포넌트(`rounded-sm`~`rounded-2xl`, `var(--shadow-*)` 사용처)는 코드
  변경 없이 새 값을 받는다.

- [ ] **Step 1: `@theme inline` 블록의 radius 5줄 교체**

`src/app/globals.css`, 기존(현재 108~151행 `@theme inline` 블록 안):
```css
  --radius-sm: calc(var(--radius) - 6px);
  --radius-md: calc(var(--radius) - 3px);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) + 6px);
  --radius-2xl: calc(var(--radius) + 12px);
```

교체(SEED `r`-스케일 — sm/lg/xl은 정확히 일치, md/2xl은 가장 가까운 값으로 반올림):
```css
  --radius-sm: 0.5rem; /* 8px = SEED r2, 정확히 일치 */
  --radius-md: 0.75rem; /* 12px = SEED r3, 기존 11px에서 반올림 */
  --radius-lg: 0.875rem; /* 14px = SEED r3.5, 정확히 일치 */
  --radius-xl: 1.25rem; /* 20px = SEED r5, 정확히 일치 */
  --radius-2xl: 1.5rem; /* 24px = SEED r6, 기존 26px에서 반올림 */
```

`:root`의 `--radius: 0.875rem;`(기존 radius 계산의 기준값)은 이제 어디서도
참조되지 않지만, `:root` 다른 곳에서 쓰일 수 있는 범용 변수라 그대로 둔다(제거는
스코프 밖 — 다음에 손댈 사람이 안전하게 지울 수 있게 grep 한 줄 남김 없이 위 5줄만
바꾼다).

- [ ] **Step 2: 같은 블록의 shadow 3줄 교체**

기존:
```css
  --shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.05);
  --shadow-sheet: 0 -2px 24px rgba(0, 0, 0, 0.10);
  --shadow-pop: 0 8px 28px rgba(0, 0, 0, 0.12);
```

교체(SEED s1/s2/s3 — `sheet`는 세기만 s2 기준, 방향은 바텀시트 특성상 위로 유지):
```css
  --shadow-card: 0px 1px 4px 0px rgba(0, 0, 0, 0.08); /* SEED s1 */
  --shadow-sheet: 0 -2px 10px rgba(0, 0, 0, 0.10); /* SEED s2 세기, 방향은 위로 유지 */
  --shadow-pop: 0px 4px 16px 0px rgba(0, 0, 0, 0.12); /* SEED s3 */
```

- [ ] **Step 3: 빌드 + 시각 확인**

Run: `npx tsc --noEmit && npx eslint src/app/globals.css`

브라우저에서 카드가 있는 아무 화면(예: `/admin`)을 열어 모서리가 살짝 각지고
(11px→12px는 육안 차이 거의 없음, xl/2xl은 살짝 좁아짐), 그림자가 조금 더 옅어졌는지
확인. 라이트/다크 둘 다.

- [ ] **Step 4: 커밋**

```bash
git add src/app/globals.css
git commit -m "fix(design): radius·shadow 값을 SEED 스케일로 교체(이름 유지)"
```

---

### Task 4: Motion 토큰 추가

**Files:**
- Modify: `src/app/globals.css`
- Create: `src/lib/motion.ts`
- Create: `src/lib/motion.test.ts`

**Interfaces:**
- Produces: CSS 변수 `--motion-d1`~`--motion-d6`, `--motion-color-transition`,
  `--motion-pressed-scale`, `--motion-ease-linear/functional/enter/exit/enter-expressive/
  exit-expressive` (`:root`). JS: `MOTION_DURATION`(초 단위 숫자, framer-motion
  `transition.duration`용) · `MOTION_EASE`(4개 숫자 배열, framer-motion `transition.ease`용)
  — `src/lib/motion.ts`에서 export. Task 6의 `MotionDemo`가 CSS 변수를, 향후 framer-motion
  코드가 JS 상수를 소비한다.

- [ ] **Step 1: `globals.css` `:root`에 motion 토큰 추가**

Task 2에서 추가한 spacing 블록 바로 다음에 이어서 삽입:

```css

  /* SEED 모션 토큰 — duration 6단계 + easing 6종 */
  --motion-d1: 50ms;
  --motion-d2: 100ms;
  --motion-d3: 150ms;
  --motion-d4: 200ms;
  --motion-d5: 250ms;
  --motion-d6: 300ms;
  --motion-color-transition: var(--motion-d3);
  --motion-pressed-scale: var(--motion-d3);

  --motion-ease-linear: cubic-bezier(0, 0, 1, 1); /* 등속 — 스피너 등 반복 재생용 */
  --motion-ease-functional: cubic-bezier(0.35, 0, 0.35, 1);
  --motion-ease-enter: cubic-bezier(0, 0, 0.15, 1);
  --motion-ease-exit: cubic-bezier(0.35, 0, 1, 1);
  --motion-ease-enter-expressive: cubic-bezier(0.03, 0.4, 0.1, 1);
  --motion-ease-exit-expressive: cubic-bezier(0.35, 0, 0.95, 0.55);
```

- [ ] **Step 2: `src/lib/motion.ts` 신규 작성**

```ts
// SEED 모션 토큰의 JS 판본. framer-motion의 transition prop은 문자열이 아니라
// 숫자(초 단위 duration, 4개 숫자 배열 ease)를 요구해 CSS 변수를 직접 못 읽는다 —
// 여기 원본 값을 그대로 복제해 둔다. globals.css의 --motion-* 값과 반드시 같이 바꿀 것.

export const MOTION_DURATION = {
  d1: 0.05,
  d2: 0.1,
  d3: 0.15,
  d4: 0.2,
  d5: 0.25,
  d6: 0.3,
} as const;

export const MOTION_EASE = {
  linear: [0, 0, 1, 1],
  functional: [0.35, 0, 0.35, 1],
  enter: [0, 0, 0.15, 1],
  exit: [0.35, 0, 1, 1],
  enterExpressive: [0.03, 0.4, 0.1, 1],
  exitExpressive: [0.35, 0, 0.95, 0.55],
} as const;
```

- [ ] **Step 3: 동기화 확인용 테스트 작성**

`src/lib/motion.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { MOTION_DURATION, MOTION_EASE } from "./motion";

describe("motion tokens", () => {
  it("duration 6단계가 초 단위로 정확히 존재한다", () => {
    expect(MOTION_DURATION).toEqual({
      d1: 0.05,
      d2: 0.1,
      d3: 0.15,
      d4: 0.2,
      d5: 0.25,
      d6: 0.3,
    });
  });

  it("easing 6종이 4개 숫자 큐빅베지어 배열이다", () => {
    const keys = [
      "linear",
      "functional",
      "enter",
      "exit",
      "enterExpressive",
      "exitExpressive",
    ] as const;
    for (const key of keys) {
      expect(MOTION_EASE[key]).toHaveLength(4);
    }
    expect(MOTION_EASE.linear).toEqual([0, 0, 1, 1]);
  });
});
```

- [ ] **Step 4: 테스트 + 빌드 확인**

Run: `npx vitest run src/lib/motion.test.ts`
Expected: PASS (2 tests)

Run: `npx tsc --noEmit && npx eslint src/app/globals.css src/lib/motion.ts src/lib/motion.test.ts`
Expected: 에러 없음.

- [ ] **Step 5: 커밋**

```bash
git add src/app/globals.css src/lib/motion.ts src/lib/motion.test.ts
git commit -m "feat(design): SEED 모션 토큰 추가(CSS 변수 + JS 상수)"
```

---

### Task 5: Typography 값 교체

**Files:**
- Modify: `src/app/globals.css`

**Interfaces:**
- Produces: `--text-xs/sm/base/lg/xl/2xl/3xl` + 각 `--text-*--line-height` — Tailwind
  네이티브 네임스페이스라 `text-xs`~`text-3xl` 클래스를 쓰는 기존 컴포넌트 전부가 코드
  변경 없이 새 값을 받는다.

- [ ] **Step 1: `@theme inline` 블록에 typography 오버라이드 추가**

`src/app/globals.css`, `@theme inline` 블록의 `--shadow-pop` 줄(Task 3에서 값을 바꾼 그 줄)
바로 다음, 블록을 닫는 `}` 앞에 삽입:

```css

  /* SEED 타이포 스케일(t-scale) — Tailwind 기본값을 덮어써서 text-xs~3xl을 쓰는
     기존 코드가 전부 자동으로 새 값을 받는다. 폰트는 A-0(Pretendard)이 이미 처리. */
  --text-xs: 0.75rem; /* 12px = SEED t2, 정확히 일치 */
  --text-xs--line-height: 1rem; /* 16px */
  --text-sm: 0.875rem; /* 14px = SEED t4, 정확히 일치 */
  --text-sm--line-height: 1.1875rem; /* 19px */
  --text-base: 1rem; /* 16px = SEED t5, 정확히 일치 */
  --text-base--line-height: 1.375rem; /* 22px */
  --text-lg: 1.125rem; /* 18px = SEED t6, 정확히 일치 */
  --text-lg--line-height: 1.5rem; /* 24px */
  --text-xl: 1.25rem; /* 20px = SEED t7, 정확히 일치 */
  --text-xl--line-height: 1.6875rem; /* 27px */
  --text-2xl: 1.5rem; /* 24px = SEED t9, 정확히 일치 */
  --text-2xl--line-height: 2rem; /* 32px */
  --text-3xl: 1.75rem; /* 28px = SEED t11, 정확히 일치(기존 30px에서 조정) */
  --text-3xl--line-height: 2.375rem; /* 38px */
```

- [ ] **Step 2: 빌드 + 시각 확인**

Run: `npx tsc --noEmit && npx eslint src/app/globals.css`

브라우저에서 텍스트가 많은 화면(예: `/admin/booths`)을 열어 본문 텍스트 줄간격이
살짝 좁아졌는지(base: 24px→22px) 확인 — 레이아웃이 깨지지 않는지(줄바꿈 위치가
바뀌어도 정상, 넘침·겹침만 없으면 됨).

- [ ] **Step 3: 회귀 확인**

Run: `npx vitest run`
Expected: 기존 스냅샷/UI 테스트가 있다면 전부 PASS(현재 이 값들에 의존하는 테스트는
없는 것으로 확인됨 — 실패가 있으면 이 태스크가 원인인지 먼저 확인).

- [ ] **Step 4: 커밋**

```bash
git add src/app/globals.css
git commit -m "fix(design): 타이포 크기·행간을 SEED t-scale로 교체(이름 유지)"
```

---

### Task 6: `/admin/design-system` 페이지

**Files:**
- Create: `src/components/admin/design-system/motion-demo.tsx`
- Create: `src/app/admin/design-system/page.tsx`
- Modify: `src/components/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: `AdminSection`(`src/components/admin/section.tsx`, `{title, description?,
  children}`), `Card`(`src/components/ui/card.tsx`), `Button`(`src/components/ui/button.tsx`,
  `variant="secondary" size="sm"` 확인됨), `cn`(`src/lib/utils.ts`). CSS 변수 전부
  (`--primary` 등 기존 색상 변수, Task 2의 `--spacing-*`, Task 3의 `--radius-*`/
  `--shadow-*`, Task 5의 `--text-*`).
- Produces: 없음(트리의 리프 페이지). `AdminSidebar`/`AdminTopNav`의 `ITEMS` 배열에
  항목 하나 추가 — 이후 태스크 없음.

- [ ] **Step 1: `AdminSidebar`의 `ITEMS`에 항목 추가**

`src/components/admin/admin-nav.tsx`, import에 `Palette` 추가:

```tsx
import {
  LayoutDashboard,
  Building2,
  Store,
  CalendarClock,
  BarChart3,
  Compass,
  Palette,
} from "lucide-react";
```

`ITEMS` 배열의 "분석" 다음에 추가:

```tsx
const ITEMS = [
  { href: "/admin", label: "개요", icon: LayoutDashboard, exact: true },
  { href: "/admin/exhibitions", label: "전시", icon: Building2 },
  { href: "/admin/booths", label: "부스", icon: Store },
  { href: "/admin/events", label: "이벤트", icon: CalendarClock },
  { href: "/admin/analytics", label: "분석", icon: BarChart3 },
  { href: "/admin/design-system", label: "디자인 시스템", icon: Palette },
];
```

`AdminSidebar`/`AdminTopNav` 둘 다 이 배열을 순회해 렌더하므로 다른 수정은 필요 없다.

- [ ] **Step 2: `MotionDemo` 클라이언트 컴포넌트 작성**

`src/components/admin/design-system/motion-demo.tsx`:

```tsx
"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DURATIONS = [
  { key: "d1", ms: 50 },
  { key: "d2", ms: 100 },
  { key: "d3", ms: 150 },
  { key: "d4", ms: 200 },
  { key: "d5", ms: 250 },
  { key: "d6", ms: 300 },
] as const;

const EASINGS = [
  { key: "linear", label: "linear — 등속(스피너 등)", curve: "cubic-bezier(0, 0, 1, 1)" },
  { key: "functional", label: "functional — 눌림 등 상태 전환", curve: "cubic-bezier(0.35, 0, 0.35, 1)" },
  { key: "enter", label: "enter — 화면 진입", curve: "cubic-bezier(0, 0, 0.15, 1)" },
  { key: "exit", label: "exit — 화면 이탈", curve: "cubic-bezier(0.35, 0, 1, 1)" },
  { key: "enter-expressive", label: "enter-expressive", curve: "cubic-bezier(0.03, 0.4, 0.1, 1)" },
  { key: "exit-expressive", label: "exit-expressive", curve: "cubic-bezier(0.35, 0, 0.95, 0.55)" },
] as const;

export function MotionDemo() {
  const [durationMs, setDurationMs] = useState<number>(200);
  const [movedKeys, setMovedKeys] = useState<Set<string>>(new Set());

  function play(key: string) {
    setMovedKeys((prev) => new Set(prev).add(key));
    setTimeout(() => {
      setMovedKeys((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
    }, durationMs + 400);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap gap-2">
        {DURATIONS.map((d) => (
          <button
            key={d.key}
            type="button"
            onClick={() => setDurationMs(d.ms)}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-semibold",
              durationMs === d.ms
                ? "border-primary bg-accent text-primary"
                : "border-border text-muted-foreground",
            )}
          >
            {d.key} · {d.ms}ms
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {EASINGS.map((e) => (
          <div key={e.key} className="space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold">{e.label}</p>
              <Button size="sm" variant="secondary" onClick={() => play(e.key)}>
                재생
              </Button>
            </div>
            <div className="relative h-8 w-64 rounded-md bg-secondary">
              <div
                className="absolute left-0 top-1/2 size-6 -translate-y-1/2 rounded-full bg-primary"
                style={{
                  transitionProperty: "transform",
                  transitionDuration: `${durationMs}ms`,
                  transitionTimingFunction: e.curve,
                  transform: movedKeys.has(e.key) ? "translateX(220px)" : "translateX(0)",
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `/admin/design-system` 페이지 작성**

`src/app/admin/design-system/page.tsx`:

```tsx
import { AdminSection } from "@/components/admin/section";
import { MotionDemo } from "@/components/admin/design-system/motion-demo";

export const metadata = { title: "디자인 시스템" };

const COLORS = [
  { name: "Primary", varName: "--primary" },
  { name: "Primary Foreground", varName: "--primary-foreground" },
  { name: "Secondary", varName: "--secondary" },
  { name: "Secondary Foreground", varName: "--secondary-foreground" },
  { name: "Muted", varName: "--muted" },
  { name: "Muted Foreground", varName: "--muted-foreground" },
  { name: "Accent", varName: "--accent" },
  { name: "Accent Foreground", varName: "--accent-foreground" },
  { name: "Destructive", varName: "--destructive" },
  { name: "Success", varName: "--success" },
  { name: "Warning", varName: "--warning" },
  { name: "Border", varName: "--border" },
  { name: "Route Visited", varName: "--route-visited" },
  { name: "Booth Active", varName: "--booth-active" },
  { name: "Booth Skipped", varName: "--booth-skipped" },
] as const;

const TYPE_STEPS = [
  { name: "text-xs", className: "text-xs", px: "12px", lineHeight: "16px" },
  { name: "text-sm", className: "text-sm", px: "14px", lineHeight: "19px" },
  { name: "text-base", className: "text-base", px: "16px", lineHeight: "22px" },
  { name: "text-lg", className: "text-lg", px: "18px", lineHeight: "24px" },
  { name: "text-xl", className: "text-xl", px: "20px", lineHeight: "27px" },
  { name: "text-2xl", className: "text-2xl", px: "24px", lineHeight: "32px" },
  { name: "text-3xl", className: "text-3xl", px: "28px", lineHeight: "38px" },
] as const;

const WEIGHTS = [
  { name: "Regular", className: "font-normal" },
  { name: "Medium", className: "font-medium" },
  { name: "Bold", className: "font-bold" },
] as const;

const SPACING_STEPS = [
  { name: "x0.5", varName: "--spacing-x0-5", px: 2 },
  { name: "x1", varName: "--spacing-x1", px: 4 },
  { name: "x1.5", varName: "--spacing-x1-5", px: 6 },
  { name: "x2", varName: "--spacing-x2", px: 8 },
  { name: "x2.5", varName: "--spacing-x2-5", px: 10 },
  { name: "x3", varName: "--spacing-x3", px: 12 },
  { name: "x3.5", varName: "--spacing-x3-5", px: 14 },
  { name: "x4", varName: "--spacing-x4", px: 16 },
  { name: "x4.5", varName: "--spacing-x4-5", px: 18 },
  { name: "x5", varName: "--spacing-x5", px: 20 },
  { name: "x6", varName: "--spacing-x6", px: 24 },
  { name: "x7", varName: "--spacing-x7", px: 28 },
  { name: "x8", varName: "--spacing-x8", px: 32 },
  { name: "x9", varName: "--spacing-x9", px: 36 },
  { name: "x10", varName: "--spacing-x10", px: 40 },
  { name: "x12", varName: "--spacing-x12", px: 48 },
  { name: "x13", varName: "--spacing-x13", px: 52 },
  { name: "x14", varName: "--spacing-x14", px: 56 },
  { name: "x16", varName: "--spacing-x16", px: 64 },
] as const;

const SEMANTIC_SPACING = [
  { name: "global-gutter", px: 16, desc: "화면 좌우 기본 여백" },
  { name: "component-default", px: 12, desc: "컴포넌트 간 기본 세로 간격" },
  { name: "nav-to-title", px: 20, desc: "상단바~타이틀" },
  { name: "screen-bottom", px: 56, desc: "화면 하단 여백" },
  { name: "between-text", px: 6, desc: "텍스트 요소 간" },
  { name: "between-chips", px: 8, desc: "칩 간 가로 간격" },
] as const;

const RADIUS_STEPS = [
  { name: "sm", className: "rounded-sm", px: "8px" },
  { name: "md", className: "rounded-md", px: "12px" },
  { name: "lg", className: "rounded-lg", px: "14px" },
  { name: "xl", className: "rounded-xl", px: "20px" },
  { name: "2xl", className: "rounded-2xl", px: "24px" },
  { name: "full", className: "rounded-full", px: "9999px" },
] as const;

const SHADOW_STEPS = [
  { name: "card", varName: "--shadow-card", label: "평상시 카드 (SEED s1)" },
  { name: "sheet", varName: "--shadow-sheet", label: "바텀시트, 위 방향 (SEED s2 세기)" },
  { name: "pop", varName: "--shadow-pop", label: "팝오버·강조 (SEED s3)" },
] as const;

export default function DesignSystemPage() {
  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">디자인 시스템</h1>
        <p className="text-sm text-muted-foreground">
          Roam이 쓰는 모든 디자인 토큰 — 색은 자체 팔레트, 나머지(간격·radius·그림자·
          모션·타이포)는 SEED 디자인 시스템 값
        </p>
      </header>

      <AdminSection title="색(Color)" description="Roam 자체 팔레트 — 라이트 모드 기준">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COLORS.map((c) => (
            <div key={c.varName} className="space-y-1.5">
              <div
                className="h-14 rounded-md border border-border"
                style={{ background: `var(${c.varName})` }}
              />
              <p className="text-xs font-semibold">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.varName}</p>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="타이포(Typography)"
        description="Pretendard · 400/500/700만 사용 · SEED t-scale 위계"
      >
        <div className="space-y-4">
          {TYPE_STEPS.map((t) => (
            <div
              key={t.name}
              className="flex items-baseline gap-4 border-b border-border pb-3 last:border-0"
            >
              <div className="w-24 shrink-0 text-xs text-muted-foreground">
                {t.name}
                <br />
                {t.px} / {t.lineHeight}
              </div>
              <div className="flex flex-1 flex-wrap items-baseline gap-4">
                {WEIGHTS.map((w) => (
                  <span key={w.name} className={`${t.className} ${w.className}`}>
                    가나다 Roam 123
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="간격(Spacing)" description="원시 스케일 x0.5~x16 + 의미 토큰">
        <div className="space-y-2">
          {SPACING_STEPS.map((s) => (
            <div key={s.varName} className="flex items-center gap-3">
              <span className="w-12 shrink-0 text-xs font-semibold">{s.name}</span>
              <div className="h-3 rounded-sm bg-primary" style={{ width: `var(${s.varName})` }} />
              <span className="text-xs text-muted-foreground">{s.px}px</span>
            </div>
          ))}
        </div>
        <div className="mt-5 space-y-2 border-t border-border pt-4">
          {SEMANTIC_SPACING.map((s) => (
            <div key={s.name} className="flex items-center justify-between text-xs">
              <span className="font-semibold">{s.name}</span>
              <span className="text-muted-foreground">
                {s.px}px — {s.desc}
              </span>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="Radius" description="기존 이름(sm~2xl) 유지, 값만 SEED 스케일">
        <div className="grid grid-cols-3 gap-4 sm:grid-cols-6">
          {RADIUS_STEPS.map((r) => (
            <div key={r.name} className="space-y-1.5 text-center">
              <div className={`mx-auto size-14 border-2 border-primary ${r.className}`} />
              <p className="text-xs font-semibold">{r.name}</p>
              <p className="text-xs text-muted-foreground">{r.px}</p>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection title="그림자(Shadow)" description="card=s1, sheet=s2(방향 유지), pop=s3">
        <div className="grid grid-cols-1 gap-8 py-4 sm:grid-cols-3">
          {SHADOW_STEPS.map((s) => (
            <div key={s.varName} className="space-y-2 text-center">
              <div
                className="mx-auto flex h-20 w-full items-center justify-center rounded-lg bg-card text-xs font-semibold"
                style={{ boxShadow: `var(${s.varName})` }}
              >
                {s.name}
              </div>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
      </AdminSection>

      <AdminSection
        title="모션(Motion)"
        description="duration 6단계 + easing 6종 — 버튼을 눌러 실제로 확인"
      >
        <MotionDemo />
      </AdminSection>
    </div>
  );
}
```

- [ ] **Step 4: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/app/admin/design-system/page.tsx src/components/admin/design-system/motion-demo.tsx src/components/admin/admin-nav.tsx`
Expected: 에러 없음.

- [ ] **Step 5: 수동 확인**

`npm run dev` 후 `/admin/design-system` 접속(관리자 게이트가 켜져 있으면 먼저 통과):
- 사이드바에 "디자인 시스템" 항목이 보이고 클릭하면 이 페이지로 이동하는지
- 색 섹션의 스와치 색이 실제 앱 색과 일치하는지(예: Primary가 인디고)
- 타이포 섹션 글자가 Pretendard로 렌더되고 굵기 3종이 뚜렷이 구분되는지
- 간격 바(bar)들이 실제로 단계적으로 넓어지는지
- Radius 스와치들의 모서리가 단계별로 달라지는지
- Shadow 카드 3개가 라이트/다크 모두에서 그림자가 보이는지(`ThemeToggle`로 전환)
- 모션 섹션에서 duration 버튼을 바꾸고 각 easing "재생" 버튼을 눌러보면 점이 실제로
  다른 속도/곡선으로 움직이는지

- [ ] **Step 6: 커밋**

```bash
git add src/app/admin/design-system/page.tsx src/components/admin/design-system/motion-demo.tsx src/components/admin/admin-nav.tsx
git commit -m "feat(admin): SEED 토큰 전체를 보여주는 /admin/design-system 페이지 추가"
```

---

## 최종 검증 (전체 태스크 완료 후)

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/app/globals.css src/app/layout.tsx src/lib/motion.ts src/lib/motion.test.ts src/app/admin/design-system/page.tsx src/components/admin/design-system/motion-demo.tsx src/components/admin/admin-nav.tsx
```

브라우저로 방문객 화면(`/`)과 관리자 화면(`/admin`, `/admin/design-system`)을 라이트/
다크 각각 한 번씩 훑어 레이아웃이 깨지지 않았는지 최종 확인.
