# 방문객 화면 위계 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 한 화면이 한 가지를 말하게 만든다 — 전시 화면의 의사결정 큐를 첫 스크린풀로 올리고, 홈에서 전시 상태를 형태로 구분하고, 한글 본문 행간을 읽을 수 있는 값으로 올린다.

**Architecture:** 전부 렌더 레이어 작업이다. 새 엔진·새 저장소 메서드·새 LLM 호출이 없다. 결정 로직은 순수 함수로 뽑아 테스트하고(`primaryAction`, `exhibitionSignals`), 화면은 그 함수의 결과를 그린다. 원시 디자인 토큰(`--text-*`, SEED 공유값)은 건드리지 않고 문장용 역할 유틸리티를 추가한다.

**Tech Stack:** Next.js 16 App Router · React 19 · Tailwind v4 (`@layer utilities`) · vitest + @testing-library/react (jsdom)

**설계 문서:** `docs/superpowers/specs/2026-10-03-visitor-screen-hierarchy-design.md`

## Global Constraints

- **판단 어휘는 `judge` 네임스페이스가 진실이다.** 관심: `꼭 갈래`·`끌려`·`패스` / 판정: `좋았어`·`그냥그랬어`·`아니었어`. **`끌림`·`이미 봄`은 폐기어이고 `brand-voice.test.ts`가 금지한다** (CLAUDE.md의 해당 표기는 stale).
- **새 문구는 전부 `src/lib/i18n/dictionaries.ts`의 `ko`·`en` 양쪽에 같은 키로 넣는다.** `brand-voice.test.ts`가 키 일치를 검사한다.
- **로미 발화 금칙:** 존댓말 금지 · 한 문구에 느낌표 2개 이상 금지 · 과장/영업/`AI가 분석`/`효율적`/`완벽한`/`동선을 짜` 금지 · 가치 이름 되읽기 금지(`발견 쪽 부스`·`관심 가치` 등).
- **원시 타입 스케일 `--text-xs` ~ `--text-3xl`을 수정하지 않는다.** SEED 공유값이고 버튼·칩 높이가 묶여 있다.
- **터치 영역은 44px 미만으로 줄이지 않는다** (Apple HIG 44pt). 시각적 크기만 줄인다.
- **색만으로 상태를 나르지 않는다** (WCAG 1.4.1). 상태는 형태(포스터 유무·카드/행)로도 구분한다.
- **간격은 의미 토큰으로 쓴다:** `--spacing-global-gutter`(16) · `--spacing-component-default`(12) · `--spacing-nav-to-title`(20) · `--spacing-screen-bottom`(56).
- 검증은 매 태스크 끝에: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <changed>`.
- 커밋마다 `/why`로 이유를 기록한다(메모리 규칙).

## File Structure

| 파일 | 책임 | 작업 |
|---|---|---|
| `src/app/globals.css` | 문장용 타입 유틸리티 `.type-body`·`.type-body-lg` | 수정 (`@layer utilities`) |
| `src/lib/design/typography.test.ts` | 행간 비율 가드 — 문장 유틸은 1.6 이상 | 생성 |
| `src/components/feed/interest-feed.tsx` | 로미 한 줄·근거를 문장 크기로 | 수정 |
| `src/components/exhibition/exhibition-card.tsx` | 상태별 형태(카드/행) | 수정 |
| `src/components/exhibition/exhibition-utility-row.tsx` | 지도·메모·검색 유틸 행 | 생성 |
| `src/components/exhibition/exhibition-utility-row.test.tsx` | 유틸 행 렌더·접근 이름 | 생성 |
| `src/lib/exhibition/primary-action.ts` | 상태 → 유일한 primary CTA (순수) | 생성 |
| `src/lib/exhibition/primary-action.test.ts` | 위 함수 테스트 | 생성 |
| `src/lib/exhibition/signals.ts` | 부스 수·로미 준비도·남은 일수 (순수) | 생성 |
| `src/lib/exhibition/signals.test.ts` | 위 함수 테스트 | 생성 |
| `src/app/(visitor)/exhibitions/[slug]/page.tsx` | 재배치 | 수정 |
| `src/app/(visitor)/page.tsx` | 홈 재배치 | 수정 |
| `src/components/exhibition/exhibition-status-section.tsx` | 지난 전시 기본 접힘 | 수정 |
| `src/components/exhibition/exhibition-card.test.tsx` | 상태별 형태 테스트 | 생성 |
| `src/lib/i18n/dictionaries.ts` | 새 문구(ko/en) | 수정 |

---

## Task 1: 문장용 타입 유틸리티

한글 본문 행간을 1.6 이상으로 올린다. 원시 스케일은 건드리지 않고 유틸리티를 추가해, 버튼·칩 높이에 영향을 주지 않는다.

**Files:**
- Modify: `src/app/globals.css:271-290` (`@layer utilities` 블록)
- Create: `src/lib/design/typography.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces: CSS 클래스 `.type-body` (16px / 26px / 1.625), `.type-body-lg` (17px / 27px / 1.588). Task 2·4·6이 이 클래스명을 쓴다.

- [ ] **Step 1: 실패하는 가드 테스트를 쓴다**

`src/lib/design/typography.test.ts` 생성:

```ts
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
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/design/typography.test.ts`
Expected: FAIL — `type-body 유틸리티가 globals.css에 없다`

- [ ] **Step 3: 유틸리티를 추가한다**

`src/app/globals.css`의 `@layer utilities { ... }` 안, `.tabular` 바로 뒤에 넣는다:

```css
  /* 문장용 타입 역할 — 원시 스케일(--text-*)은 SEED 공유값이고 버튼·칩 높이가
     거기 묶여 있어 건드리지 않는다. 산문은 이 두 유틸로만 쓴다.
     한글은 어센더·디센더로 생기는 숨 쉴 틈이 없는 정방형 글자라 같은 비율에서
     라틴보다 빽빽하게 읽힌다 — W3C klreq가 한글 본문 행간 160%를 권하고
     네이버·다음 뉴스 본문도 17px/1.56~1.63에 수렴한다.
     ⚠️ 12px(text-xs)에 문장을 쓰지 않는다. 배지·출처 라벨 전용. */
  .type-body {
    font-size: 1rem; /* 16px */
    line-height: 1.625rem; /* 26px = 1.625 */
  }
  .type-body-lg {
    font-size: 1.0625rem; /* 17px = Apple HIG 본문 권장 최소 */
    line-height: 1.6875rem; /* 27px = 1.588 */
  }
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/design/typography.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 전체 검증 후 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/design/typography.test.ts
git add src/app/globals.css src/lib/design/typography.test.ts
git commit -m "feat(type): 문장용 타입 유틸 .type-body — 한글 본문 행간 1.625"
```

---

## Task 2: 피드 카드를 문장 크기로

로미의 판단 근거가 12px(`text-xs`)로 날짜·장소와 같은 크기다. 제품의 입장이 "판단 근거를 주고 사용자가 판단한다"인데 그 근거가 화면에서 가장 작다.

**Files:**
- Modify: `src/components/feed/interest-feed.tsx` (로미 한 줄·근거·행동 제안)

> ⚠️ `exhibition-card.tsx`는 **건드리지 않는다.** Task 6이 그 파일을 전면
> 재작성하면서 `.type-body` + `line-clamp-3`를 포함한다. 여기서 먼저 고치면
> Task 6과 충돌한다.

**Interfaces:**
- Consumes: Task 1의 `.type-body`
- Produces: 없음 (렌더만 바뀜)

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/feed/interest-feed.test.tsx` 생성. 로미 한 줄이 문장 크기로 렌더되는지 가드한다:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { InterestFeed } from "./interest-feed";
import type { FeedItem } from "@/lib/feed/curate";
import type { BoothListItem, Category } from "@/lib/types";

const booth = {
  id: "b1",
  exhibitionId: "e1",
  hallId: "h1",
  categoryId: "c1",
  code: "A1101",
  name: "유유출판사",
  company: "유유",
  description: "",
  images: [],
  tags: ["indie"],
  x: 0,
  y: 0,
  popularity: 50,
  createdAt: "2026-01-01",
} satisfies BoothListItem;

const items: FeedItem[] = [
  {
    booth,
    related: [],
    pick: "stable",
    grounding: {
      what: "작은 출판사의 에세이 위주 부스야.",
      why: "작은 출판사의 에세이 위주 부스야. 아까 ‘참융뜰’ 좋아했잖아.",
      quote: null,
      evidence: [],
      todo: [],
      confidence: "medium",
    },
  },
];

const categoryById: Record<string, Category> = {
  c1: { id: "c1", name: "독립출판", slug: "indie", color: "#4f46e5", sort: 0 } as Category,
};

describe("InterestFeed 타이포그래피", () => {
  it("로미 한 줄은 문장 크기(.type-body)로 렌더된다 — 12px 금지", () => {
    render(
      <InterestFeed
        items={items}
        categoryById={categoryById}
        memoryLine={null}
        slug="sibf-2026"
        round={0}
        poolLeft={3}
      />,
    );
    const line = screen.getByText(/작은 출판사의 에세이 위주 부스야/);
    expect(line).toHaveClass("type-body");
    expect(line.className).not.toMatch(/\btext-xs\b/);
  });
});
```

> `Grounding`의 필드는 `what`·`why`·`quote`·`evidence`·`todo`·`confidence` 여섯 개다 (`src/lib/feed/grounding.ts:30`). 캐스트를 쓰지 않았으니 필드가 빠지면 `tsc`가 잡는다 — 일부러 그렇게 뒀다.

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/feed/interest-feed.test.tsx`
Expected: FAIL — `expected element to have class "type-body"`

- [ ] **Step 3: 산문 호출부를 교체한다**

`src/components/feed/interest-feed.tsx`에서 **문장을 담은** 요소만 바꾼다. 라벨·배지·코드는 그대로 둔다.

- 로미 한 줄(근거 문장): `className="text-sm ..."` → `className="type-body ..."`
- 근거·행동 제안 문장(`grounding.todo`, `grounding.evidence` 설명문): `text-xs` → `type-body`
- 신뢰 배지·출처 라벨(`grounding.quoteSource`)·부스 코드: **`text-xs` 유지** (문장이 아니다)
- 부스명: `text-[17px]` → `text-xl`(20px, SEED t7)

(전시 카드 설명의 `text-sm line-clamp-2` → `.type-body line-clamp-3` 전환은
Task 6이 그 파일을 재작성할 때 함께 한다. 글자가 커지면 한 줄에 들어가는 글자
수가 줄어 2줄 클램프가 정보를 더 자르므로 줄 수로 보상하는 것인데, 같은 파일을
두 태스크가 고치면 충돌한다.)

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/feed/interest-feed.test.tsx`
Expected: PASS

- [ ] **Step 5: 남은 `text-xs` 문장을 전수 확인한다**

Run:
```bash
grep -n 'text-xs' src/components/feed/interest-feed.tsx
```
남은 `text-xs`가 전부 배지·라벨·코드인지 눈으로 확인한다. 문장이 하나라도 남아 있으면 `.type-body`로 올린다.

- [ ] **Step 6: 전체 검증 후 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/feed/interest-feed.tsx src/components/feed/interest-feed.test.tsx
git add src/components/feed/interest-feed.tsx src/components/feed/interest-feed.test.tsx
git commit -m "fix(type): 로미 판단 근거를 12px에서 문장 크기로 — 위계 역전 교정"
```

---

## Task 3: 유틸리티 행 — 카드 3장을 1행으로

지도·메모장·검색이 가치 온보딩과 **똑같은 카드 스타일**로 그려져 넷이 동등한 선택지로 읽힌다. 셋은 *이동*이지 *행동*이 아니므로 카드 껍데기를 벗긴다. 터치 영역 44는 유지한다.

**Files:**
- Create: `src/components/exhibition/exhibition-utility-row.tsx`
- Create: `src/components/exhibition/exhibition-utility-row.test.tsx`
- Modify: `src/lib/i18n/dictionaries.ts` (`exhibitionUtil` 네임스페이스 ko/en)

**Interfaces:**
- Consumes: 없음
- Produces: `<ExhibitionUtilityRow slug={string} showNotes={boolean} onSearch={() => void} />`. Task 4가 이 시그니처로 쓴다.

- [ ] **Step 1: 사전에 문구를 넣는다**

`src/lib/i18n/dictionaries.ts`의 `ko`에 추가 (기존 `booth` 네임스페이스 뒤):

```ts
  exhibitionUtil: {
    label: "전시 바로가기",
    map: "지도",
    notes: "메모장",
    search: "부스 찾기",
  },
```

`en`에 같은 키로:

```ts
  exhibitionUtil: {
    label: "Exhibition shortcuts",
    map: "Map",
    notes: "Notes",
    search: "Find a booth",
  },
```

`label`은 유틸 행 자체(`<nav>`)의 접근 이름이다. 행에 `map`을 쓰면 지도 링크와
이름이 같아져 보조기술이 둘을 구별하지 못한다.

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`src/components/exhibition/exhibition-utility-row.test.tsx` 생성:

```tsx
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExhibitionUtilityRow } from "./exhibition-utility-row";

describe("ExhibitionUtilityRow", () => {
  it("지도·메모장·부스 찾기 3칸을 렌더한다", () => {
    render(
      <ExhibitionUtilityRow slug="sibf-2026" showNotes onSearch={() => {}} />,
    );
    expect(screen.getByRole("link", { name: "지도" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "메모장" })).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "부스 찾기" }),
    ).toBeInTheDocument();
  });

  it("지도·메모장 링크가 전시 slug 경로를 가리킨다", () => {
    render(
      <ExhibitionUtilityRow slug="sibf-2026" showNotes onSearch={() => {}} />,
    );
    expect(screen.getByRole("link", { name: "지도" })).toHaveAttribute(
      "href",
      "/exhibitions/sibf-2026/map",
    );
    expect(screen.getByRole("link", { name: "메모장" })).toHaveAttribute(
      "href",
      "/exhibitions/sibf-2026/notes",
    );
  });

  it("비로그인(showNotes=false)이면 메모장을 숨긴다 — 계정에 묶인 저장이라", () => {
    render(
      <ExhibitionUtilityRow
        slug="sibf-2026"
        showNotes={false}
        onSearch={() => {}}
      />,
    );
    expect(
      screen.queryByRole("link", { name: "메모장" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "지도" })).toBeInTheDocument();
  });

  it("부스 찾기를 누르면 onSearch를 부른다", async () => {
    const onSearch = vi.fn();
    render(
      <ExhibitionUtilityRow slug="sibf-2026" showNotes onSearch={onSearch} />,
    );
    await userEvent.click(screen.getByRole("button", { name: "부스 찾기" }));
    expect(onSearch).toHaveBeenCalledOnce();
  });

  it("세 칸 모두 터치 영역 44px을 유지한다 (Apple HIG 44pt)", () => {
    render(
      <ExhibitionUtilityRow slug="sibf-2026" showNotes onSearch={() => {}} />,
    );
    for (const el of [
      screen.getByRole("link", { name: "지도" }),
      screen.getByRole("link", { name: "메모장" }),
      screen.getByRole("button", { name: "부스 찾기" }),
    ]) {
      expect(el.className).toMatch(/min-h-11/);
    }
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run src/components/exhibition/exhibition-utility-row.test.tsx`
Expected: FAIL — `Failed to resolve import "./exhibition-utility-row"`

- [ ] **Step 4: 컴포넌트를 만든다**

`src/components/exhibition/exhibition-utility-row.tsx` 생성:

```tsx
"use client";

import Link from "next/link";
import { Map as MapIcon, NotebookPen, Search } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * 전시 화면 유틸리티 행 — 지도·메모장·부스 찾기.
 *
 * 예전엔 셋이 각각 가치 온보딩과 **똑같은** 카드(border·shadow·radius + 44px
 * 아이콘 타일 + 제목 + 설명 + 셰브론)였다. 테두리·면·그림자는 "독립된 객체이고
 * 이만큼 중요하다"는 신호라, 넷에 똑같이 주면 위계가 사라져 사용자가 넷을
 * 동등한 선택지로 읽는다. 셋은 *이동*이지 *행동*이 아니므로 껍데기만 벗긴다.
 *
 * ⚠️ 시각적 크기만 줄이고 **터치 영역 44px은 유지한다**(min-h-11, Apple HIG 44pt).
 * WCAG 2.5.8의 하한은 24px이지만 그건 통과/실패 판정선이고 편안함의 기준이 아니다.
 */
export function ExhibitionUtilityRow({
  slug,
  showNotes,
  onSearch,
}: {
  slug: string;
  /** 메모장은 계정에 묶인 저장이라 비로그인엔 숨긴다. */
  showNotes: boolean;
  onSearch: () => void;
}) {
  const t = useT();
  const cell =
    "flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary text-sm font-semibold text-foreground active:opacity-70";

  return (
    <nav
      className="flex gap-[var(--spacing-between-chips)]"
      aria-label={t("exhibitionUtil.label")}
    >
      <Link href={`/exhibitions/${slug}/map`} className={cell}>
        <MapIcon className="size-[18px]" aria-hidden />
        {t("exhibitionUtil.map")}
      </Link>
      {showNotes && (
        <Link href={`/exhibitions/${slug}/notes`} className={cell}>
          <NotebookPen className="size-[18px]" aria-hidden />
          {t("exhibitionUtil.notes")}
        </Link>
      )}
      <button type="button" onClick={onSearch} className={cell}>
        <Search className="size-[18px]" aria-hidden />
        {t("exhibitionUtil.search")}
      </button>
    </nav>
  );
}
```

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run src/components/exhibition/exhibition-utility-row.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: 전체 검증 후 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/exhibition/exhibition-utility-row.tsx src/components/exhibition/exhibition-utility-row.test.tsx src/lib/i18n/dictionaries.ts
git add src/components/exhibition/exhibition-utility-row.tsx src/components/exhibition/exhibition-utility-row.test.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(exhibition): 지도·메모·검색 카드 3장을 유틸리티 행으로"
```

---

## Task 4: 상태 → 유일한 primary CTA (순수 함수)

전시 화면에 primary가 항상 정확히 하나여야 한다. 그 하나가 무엇인지는 관람 아크의 어느 막인지가 결정한다. 서버 컴포넌트는 직접 테스트하기 어려우니 결정만 순수 함수로 뽑는다.

**Files:**
- Create: `src/lib/exhibition/primary-action.ts`
- Create: `src/lib/exhibition/primary-action.test.ts`

**Interfaces:**
- Consumes: 없음
- Produces:
  ```ts
  export type PrimaryAction = "onboarding" | "feed" | "finish";
  export function primaryAction(input: {
    signedIn: boolean;
    hasChosenValues: boolean;
    judgedCount: number;
  }): PrimaryAction;
  ```
  Task 5(전시 화면 재배치)가 이 함수로 분기한다.

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/exhibition/primary-action.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";
import { primaryAction } from "./primary-action";

describe("primaryAction — 한 화면에 primary 하나", () => {
  it("비로그인이면 피드가 primary다 (열람은 공개, 온보딩은 계정에 묶인다)", () => {
    expect(
      primaryAction({ signedIn: false, hasChosenValues: false, judgedCount: 0 }),
    ).toBe("feed");
  });

  it("로그인했고 가치를 안 골랐으면 온보딩이 primary다", () => {
    expect(
      primaryAction({ signedIn: true, hasChosenValues: false, judgedCount: 0 }),
    ).toBe("onboarding");
  });

  it("가치를 골랐고 판정이 없으면 피드가 primary다 — 약속한 결과를 즉시 보여준다", () => {
    expect(
      primaryAction({ signedIn: true, hasChosenValues: true, judgedCount: 0 }),
    ).toBe("feed");
  });

  it("판정이 1건이라도 있으면 마무리가 primary다 — 끝을 설계하지 않으면 마지막 기억이 '앱을 닫았다'가 된다", () => {
    expect(
      primaryAction({ signedIn: true, hasChosenValues: true, judgedCount: 1 }),
    ).toBe("finish");
  });

  it("가치를 안 골랐어도 판정이 쌓였으면 마무리가 이긴다 — 온보딩을 건너뛰고 반응만 한 사람도 회고로 갈 수 있어야 한다", () => {
    expect(
      primaryAction({ signedIn: true, hasChosenValues: false, judgedCount: 3 }),
    ).toBe("finish");
  });

  it("비로그인은 판정이 있어도 마무리로 보내지 않는다 — 회고는 계정에 쓰인다", () => {
    expect(
      primaryAction({ signedIn: false, hasChosenValues: false, judgedCount: 5 }),
    ).toBe("feed");
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/exhibition/primary-action.test.ts`
Expected: FAIL — `Failed to resolve import "./primary-action"`

- [ ] **Step 3: 구현한다**

`src/lib/exhibition/primary-action.ts` 생성:

```ts
/**
 * 전시 화면의 유일한 primary — 관람 아크의 어느 막인지로 정한다.
 *
 * 예전엔 가치 온보딩·지도·메모장·검색이 같은 카드 스타일로 나란히 있어
 * 무엇이 주된 할 일인지 알 수 없었다. 강조는 **하나일 때만** 작동한다
 * (고립 효과) — 넷을 같은 무게로 두면 효과가 0이 아니라 위계가 사라진다.
 *
 * 순수 함수인 이유: 서버 컴포넌트는 직접 테스트하기 어렵다. 결정만 떼어낸다.
 */
export type PrimaryAction = "onboarding" | "feed" | "finish";

export function primaryAction(input: {
  signedIn: boolean;
  hasChosenValues: boolean;
  /** 이 전시에서 사용자가 내린 판정 수(관심·판정 합). */
  judgedCount: number;
}): PrimaryAction {
  // 회고는 계정에 쓰이고 온보딩 결과도 계정에 묶인다 — 비로그인은 읽기만 한다.
  if (!input.signedIn) return "feed";
  // 판정이 하나라도 있으면 마무리가 가장 앞선다. 온보딩을 건너뛰고 반응만 한
  // 사람도 회고로 갈 수 있어야 한다(가치 선택이 회고의 전제가 아니다).
  if (input.judgedCount > 0) return "finish";
  if (!input.hasChosenValues) return "onboarding";
  return "feed";
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/exhibition/primary-action.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: 전체 검증 후 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/exhibition/primary-action.ts src/lib/exhibition/primary-action.test.ts
git add src/lib/exhibition/primary-action.ts src/lib/exhibition/primary-action.test.ts
git commit -m "feat(exhibition): 상태별 유일한 primary CTA 결정 함수"
```

---

## Task 5: 전시 화면 재배치

의사결정 큐를 `y=730`에서 `y=312`로 올린다. 418px 회수.

**Files:**
- Modify: `src/app/(visitor)/exhibitions/[slug]/page.tsx:112` (포스터 `h-52` → `h-30`)
- Modify: `src/app/(visitor)/exhibitions/[slug]/page.tsx:154-234` (메타·카드 3장 → 유틸 행)
- Modify: `src/lib/i18n/dictionaries.ts` (`feed.progress` ko/en)

**Interfaces:**
- Consumes: Task 3의 `ExhibitionUtilityRow`, Task 4의 `primaryAction`, Task 1의 `.type-body`
- Produces: 없음

- [ ] **Step 1: 진행 비트 문구를 사전에 넣는다**

`ko`의 `feed` 네임스페이스에 추가:

```ts
    progress: "취향 기록 {judged}/{total}",
```

`en`:

```ts
    progress: "Taste logged {judged}/{total}",
```

- [ ] **Step 2: 포스터를 120px로 줄이고 메타를 스크림으로 옮긴다**

`page.tsx:112`의 `h-52`(208px)를 `h-30`(120px)으로 바꾼다. Tailwind에 `h-30`이 없으면 `h-[120px]`을 쓴다.

그리고 `page.tsx:155-166`의 장소·기간 `<section>`을 **삭제**하고, 포스터 스크림 안에 한 줄로 넣는다. 포스터에 이미 박혀 있는 정보와 중복이고, 같은 이유로 기간 필을 한 번 걷어낸 이력이 코드 주석에 있다:

```tsx
          {/* 장소·기간은 포스터 스크림에 한 줄로 — 아래 본문에 2줄로 또 쓰면
              포스터에 박힌 정보와 세 번 겹친다. 주목 상위 구간(상단 절반)을
              중복에 쓰지 않는다. */}
          <p className="relative flex items-center gap-1.5 text-sm font-medium text-white drop-shadow-sm">
            <MapPin className="size-4" aria-hidden />
            {exhibition.venue}
            <span aria-hidden>·</span>
            {range}
          </p>
```

포스터가 없는 전시(그라디언트 배경)에서도 흰 글씨가 읽히므로 분기는 필요 없다.

- [ ] **Step 3: 카드 3장을 유틸 행으로 교체한다**

`page.tsx`에서 지도 카드(196-211행 부근)·메모장 카드(213-231행 부근)·`<BoothSearch>`(234행)를 지우고, `<div className="space-y-2.5">` 묶음을 아래 `ExhibitionUtilityBar` 한 줄로 바꾼다.

`page.tsx`는 **서버 컴포넌트라 `useState`를 쓸 수 없다.** 검색 펼침 상태를 들 곳이
필요하므로 유틸 행과 검색을 한 클라이언트 컴포넌트로 묶는다 —
`ExhibitionUtilityRow`를 `page.tsx`에서 직접 쓰지 않는다.

`src/components/exhibition/exhibition-utility-bar.tsx` 생성:

```tsx
"use client";

import { useState } from "react";
import { ExhibitionUtilityRow } from "@/components/exhibition/exhibition-utility-row";
import { BoothSearch } from "@/components/feed/booth-search";
import type { Category } from "@/lib/types";

/**
 * 유틸 행 + 접힌 부스 검색. 검색은 피드의 보조 경로라 상시 입력창으로
 * 자리를 점유할 이유가 없다 — 탭하면 전체폭으로 펼친다.
 * 서버 컴포넌트인 page.tsx가 상태를 들 수 없어 여기서 묶는다.
 */
export function ExhibitionUtilityBar({
  slug,
  showNotes,
  categoryById,
}: {
  slug: string;
  showNotes: boolean;
  categoryById: Record<string, Category>;
}) {
  const [searchOpen, setSearchOpen] = useState(false);
  return (
    <div className="space-y-[var(--spacing-component-default)]">
      <ExhibitionUtilityRow
        slug={slug}
        showNotes={showNotes}
        onSearch={() => setSearchOpen((v) => !v)}
      />
      {searchOpen && <BoothSearch slug={slug} categoryById={categoryById} />}
    </div>
  );
}
```

`page.tsx`에서는:

```tsx
          <ExhibitionUtilityBar
            slug={slug}
            showNotes={!!user}
            categoryById={categoryById}
          />
```

- [ ] **Step 4: primary를 하나로 분기한다**

`page.tsx`에서 `primaryAction`을 부르고, 결과에 따라 `ValueOnboarding`과 `FinishVisit`을 조건부로 둔다:

```tsx
  const primary = primaryAction({
    signedIn: !!user,
    hasChosenValues: topValues.length > 0,
    judgedCount: taste.judgedCount,
  });
```

- `ValueOnboarding`은 `primary === "onboarding"`일 때만 렌더 (기존 `{user && ...}`를 대체)
- `FinishVisit`은 `primary === "finish"`일 때만 렌더 (기존 `{user && ...}`를 대체)
- 둘 다 아니면(`"feed"`) 피드만 남는다 — 카드 자체가 CTA다

- [ ] **Step 5: 진행 비트를 피드 제목 위에 넣는다**

`<InterestFeed>` 바로 위:

```tsx
          {user && taste.judgedCount > 0 && (
            <div className="space-y-1">
              <div
                className="h-1 overflow-hidden rounded-full bg-secondary"
                role="progressbar"
                aria-valuenow={taste.judgedCount}
                aria-valuemin={0}
                aria-valuemax={taste.judgedCount + feedItems.length}
                aria-label={t("feed.progress", {
                  judged: taste.judgedCount,
                  total: taste.judgedCount + feedItems.length,
                })}
              >
                <div
                  className="h-full bg-primary"
                  style={{
                    width: `${Math.round(
                      (taste.judgedCount /
                        Math.max(1, taste.judgedCount + feedItems.length)) *
                        100,
                    )}%`,
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {t("feed.progress", {
                  judged: taste.judgedCount,
                  total: taste.judgedCount + feedItems.length,
                })}
              </p>
            </div>
          )}
```

- [ ] **Step 6: 하단 여백에 이름을 준다**

`page.tsx:154`의 `pb-28`(112px)은 컴패니언 필을 피하는 **실재하는 이유**가 있는데 매직넘버로 남아 있다. `globals.css`의 `@theme inline` 블록에 토큰을 추가하고:

```css
  /* 하단 상주 컴패니언 필을 피하는 여백. 필은 바닥에서 64px를 점유한다 —
     아바타 32(size-8) + 필 패딩 16(p-2) + 컨테이너 하단 16. 거기에 마지막
     카드가 숨 쉴 48을 더한 값이다. 필 크기가 바뀌면 여기만 고친다. */
  --spacing-companion-clearance: 112px;
```

`page.tsx`에서 `pb-28` → `pb-[var(--spacing-companion-clearance)]`.

- [ ] **Step 7: 검증 + 실측 확인**

```bash
npx tsc --noEmit
npx vitest run
npx eslint "src/app/(visitor)/exhibitions/[slug]/page.tsx" src/components/exhibition/exhibition-utility-bar.tsx
```

mock 모드로 띄워 390×844에서 **첫 피드 카드가 y≈312에 오는지** 눈으로 확인한다:

```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev
```

확인 항목:
- 상단바 아래 포스터가 120px이고 장소·기간이 그 위에 한 줄로 보인다
- 유틸 행 3칸이 한 줄, 각 칸을 엄지로 누를 수 있다
- 피드 첫 카드 제목과 로미 한 줄이 스크롤 없이 보인다
- 로미 한 줄이 이전보다 크고 행간이 넓다
- 컴패니언 필이 마지막 카드를 가리지 않는다

- [ ] **Step 8: 커밋**

```bash
git add "src/app/(visitor)/exhibitions/[slug]/page.tsx" src/components/exhibition/exhibition-utility-bar.tsx src/app/globals.css src/lib/i18n/dictionaries.ts
git commit -m "feat(exhibition): 의사결정 큐를 첫 스크린풀로 — 730→312, primary 하나"
```

---

## Task 6: 전시 카드에 상태를 형태로

`ExhibitionCard`가 상태를 인자로 받지 않아 진행 중·예정·종료가 전부 같은 카드다. 정작 `page.tsx`의 추천 로직은 종료 전시를 이미 제외한다 — 로직은 알고 화면만 모른다.

**Files:**
- Modify: `src/components/exhibition/exhibition-card.tsx`
- Create: `src/components/exhibition/exhibition-card.test.tsx`
- Modify: `src/lib/i18n/dictionaries.ts` (`home.enter`·`home.browse`·`home.viewRecord` ko/en)

**Interfaces:**
- Consumes: `ExhibitionStatusKind` from `@/lib/exhibition/status`
- Produces: `<ExhibitionCard exhibition={Exhibition} status={ExhibitionStatusKind} recommended?={boolean} recommendedLabel?={string} />`. Task 7이 `status`를 넘긴다.

- [ ] **Step 1: 문구를 사전에 넣는다**

`ko`의 `home` 네임스페이스에 추가:

```ts
    enter: "들어가기",
    browse: "둘러보기",
    viewRecord: "기록 보기",
```

`en`:

```ts
    enter: "Enter",
    browse: "Take a look",
    viewRecord: "See the record",
```

- [ ] **Step 2: 실패하는 테스트를 쓴다**

`src/components/exhibition/exhibition-card.test.tsx` 생성:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExhibitionCard } from "./exhibition-card";
import type { Exhibition } from "@/lib/types";

const ex = {
  id: "e1",
  slug: "sibf-2026",
  name: "2026 서울국제도서전",
  venue: "COEX A홀",
  description: "책과 출판을 다루는 전시",
  startDate: "2026-06-17",
  endDate: "2026-06-21",
  coverImageUrl: "/poster.webp",
  mapWidth: 100,
  mapHeight: 100,
  tips: {} as Exhibition["tips"],
  createdAt: "2026-01-01",
} satisfies Exhibition;

describe("ExhibitionCard — 상태를 형태로", () => {
  it("진행 중은 포스터가 있는 카드로 그린다", () => {
    render(<ExhibitionCard exhibition={ex} status="ongoing" />);
    expect(screen.getByTestId("exhibition-poster")).toBeInTheDocument();
    expect(screen.getByText("들어가기")).toBeInTheDocument();
  });

  it("예정은 포스터 없이 행으로 그린다 — 꽉 찬 포스터는 지금 들어갈 수 있다는 뜻으로 읽힌다", () => {
    render(<ExhibitionCard exhibition={ex} status="upcoming" />);
    expect(screen.queryByTestId("exhibition-poster")).not.toBeInTheDocument();
    expect(screen.getByText("둘러보기")).toBeInTheDocument();
  });

  it("종료는 포스터 없는 행이고 기록 보기로 간다", () => {
    render(<ExhibitionCard exhibition={ex} status="ended" />);
    expect(screen.queryByTestId("exhibition-poster")).not.toBeInTheDocument();
    expect(screen.getByText("기록 보기")).toBeInTheDocument();
  });

  it("상태가 달라도 전시 이름은 항상 읽힌다", () => {
    for (const status of ["ongoing", "upcoming", "ended"] as const) {
      const { unmount } = render(
        <ExhibitionCard exhibition={ex} status={status} />,
      );
      expect(screen.getByText("2026 서울국제도서전")).toBeInTheDocument();
      unmount();
    }
  });

  it("추천 배지는 진행 중에만 붙는다 — 끝난 전시를 취향 근거로 추천하지 않는다", () => {
    const { unmount } = render(
      <ExhibitionCard
        exhibition={ex}
        status="ended"
        recommended
        recommendedLabel="로미 추천"
      />,
    );
    expect(screen.queryByText("로미 추천")).not.toBeInTheDocument();
    unmount();
    render(
      <ExhibitionCard
        exhibition={ex}
        status="ongoing"
        recommended
        recommendedLabel="로미 추천"
      />,
    );
    expect(screen.getByText("로미 추천")).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: 실패를 확인한다**

Run: `npx vitest run src/components/exhibition/exhibition-card.test.tsx`
Expected: FAIL — `status` prop 없음(타입 에러) 또는 `exhibition-poster` testid 없음

- [ ] **Step 4: 구현한다**

`src/components/exhibition/exhibition-card.tsx`를 다음으로 바꾼다:

```tsx
import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { Exhibition } from "@/lib/types";
import type { ExhibitionStatusKind } from "@/lib/exhibition/status";

/**
 * 전시 카드 — **상태가 형태를 정한다.**
 *
 * 예전엔 상태를 아예 안 받아서 진행 중·예정·종료가 전부 같은 카드였다.
 * 상태를 말하는 건 섹션 제목(작은 회색 글씨) 하나뿐이라, 스크롤로 그걸
 * 지나치면 끝난 전시가 지금 갈 수 있는 전시와 똑같이 보였다.
 * 색이나 작은 라벨만으로 상태를 나르면 색을 구분하기 어려운 사용자에게는
 * 아예 전달되지 않는다(WCAG 1.4.1) — 포스터 유무·카드/행으로 가른다.
 *
 * 예정에 포스터를 채우지 않는 이유: 부스 데이터가 아직 얇은데 포스터가
 * 꽉 차면 지금 들어갈 수 있는 것처럼 보인다.
 */
export function ExhibitionCard({
  exhibition,
  status,
  recommended = false,
  recommendedLabel = "로미 추천",
}: {
  exhibition: Exhibition;
  status: ExhibitionStatusKind;
  /** 로미 추천 전시 — 진행 중에만 유효하다. */
  recommended?: boolean;
  recommendedLabel?: string;
}) {
  const t = useT();
  const range = `${format(new Date(exhibition.startDate), "M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;
  // TODO(별도 플랜): 끝난 전시는 목적지가 달라야 한다 — 지금은 진행 중과 같은
  // 화면으로 가서 온보딩·피드·"오늘 관람 마치기"가 그대로 뜬다. 읽기 전용
  // 기록 화면(`/exhibitions/[slug]/record`)은 이 플랜 범위 밖이라 라우트가
  // 없다. 없는 경로로 보내면 404가 되므로 지금은 같은 경로를 쓴다.
  const href = `/exhibitions/${exhibition.slug}`;
  const cta =
    status === "ongoing"
      ? t("home.enter")
      : status === "upcoming"
        ? t("home.browse")
        : t("home.viewRecord");

  // 진행 중만 꽉 찬 카드. 나머지는 행 — 결정 대상이 아니다.
  if (status !== "ongoing") {
    return (
      <Link
        href={href}
        className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:scale-[0.99]"
      >
        <span className="w-12 shrink-0 text-xs font-semibold tabular text-muted-foreground">
          {format(new Date(exhibition.startDate), "M.d")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{exhibition.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {exhibition.venue}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
          {cta}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </Link>
    );
  }

  return (
    <Link
      href={href}
      className={cn(
        "group block overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]",
        recommended ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      {recommended && (
        <div className="flex items-center gap-1 bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          {recommendedLabel}
        </div>
      )}
      <div
        data-testid="exhibition-poster"
        className="relative flex h-28 items-end bg-gradient-to-br from-primary/85 to-[#4338ca] p-4"
        style={
          exhibition.coverImageUrl
            ? {
                backgroundImage: `url(${exhibition.coverImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center top",
              }
            : undefined
        }
      >
        {exhibition.coverImageUrl && (
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"
            aria-hidden
          />
        )}
        <h3 className="relative text-xl font-bold leading-tight text-white drop-shadow-sm">
          {exhibition.name}
        </h3>
      </div>
      <div className="space-y-1.5 p-4">
        <p className="type-body line-clamp-3 text-muted-foreground">
          {exhibition.description}
        </p>
        <div className="flex items-center gap-1 pt-1 text-sm font-medium text-foreground">
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{exhibition.venue}</span>
          <span aria-hidden>·</span>
          <CalendarDays className="size-3.5" aria-hidden />
          <span className="tabular">{range}</span>
        </div>
        <p className="pt-1 text-sm font-bold text-primary">{cta}</p>
      </div>
    </Link>
  );
}
```

> `useT()`를 쓰므로 이 파일 맨 위에 `"use client";`를 추가한다. (현재는 서버에서 렌더되지만 `ExhibitionStatusSection`이 이미 클라이언트 컴포넌트다.)

- [ ] **Step 5: 통과를 확인한다**

Run: `npx vitest run src/components/exhibition/exhibition-card.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: 호출부를 고친다**

`src/components/exhibition/exhibition-status-section.tsx`가 `status`를 넘기도록 prop을 추가한다:

```tsx
export function ExhibitionStatusSection({
  title,
  status,
  exhibitions,
  ...
}: {
  title: string;
  status: ExhibitionStatusKind;
  ...
})
```

그리고 `<ExhibitionCard exhibition={ex} status={status} ... />`.

`src/app/(visitor)/page.tsx`의 세 `<ExhibitionStatusSection>`에 각각 `status="ongoing"`·`status="upcoming"`·`status="ended"`를 넘긴다.

- [ ] **Step 7: 검증 후 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/exhibition/ "src/app/(visitor)/page.tsx" src/lib/i18n/dictionaries.ts
git add src/components/exhibition/ "src/app/(visitor)/page.tsx" src/lib/i18n/dictionaries.ts
git commit -m "feat(home): 전시 상태를 형태로 — 진행 중만 카드, 예정·종료는 행"
```

---

## Task 7: 홈 재배치 + 지난 전시 접기

주목 상위 구간(`0–422`)이 전부 마스코트와 로고에 쓰이고 전시가 한 장도 안 들어온다. 첫 전시 카드를 `y=473`에서 그 구간 안으로 올린다.

**Files:**
- Modify: `src/app/(visitor)/page.tsx:137-170` (히어로)
- Modify: `src/components/exhibition/exhibition-status-section.tsx` (지난 전시 기본 접힘)
- Create: `src/components/exhibition/exhibition-status-section.test.tsx`

**Interfaces:**
- Consumes: Task 6의 `ExhibitionCard` with `status`
- Produces: 없음

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/components/exhibition/exhibition-status-section.test.tsx` 생성:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ExhibitionStatusSection } from "./exhibition-status-section";
import type { Exhibition } from "@/lib/types";

function ex(n: number): Exhibition {
  return {
    id: `e${n}`,
    slug: `ex-${n}`,
    name: `전시 ${n}`,
    venue: "COEX",
    description: "설명",
    startDate: "2026-01-0" + ((n % 9) + 1),
    endDate: "2026-01-1" + ((n % 9) + 1),
    mapWidth: 100,
    mapHeight: 100,
    tips: {} as Exhibition["tips"],
    createdAt: "2026-01-01",
  };
}

describe("ExhibitionStatusSection", () => {
  it("진행 중 섹션은 펼친 상태로 시작한다", () => {
    render(
      <ExhibitionStatusSection
        title="진행 중"
        status="ongoing"
        exhibitions={[ex(1), ex(2)]}
      />,
    );
    expect(screen.getByText("전시 1")).toBeInTheDocument();
    expect(screen.getByText("전시 2")).toBeInTheDocument();
  });

  it("지난 전시 섹션은 접힌 상태로 시작한다 — 결정 대상이 아니다", () => {
    render(
      <ExhibitionStatusSection
        title="지난 전시"
        status="ended"
        exhibitions={[ex(1), ex(2)]}
      />,
    );
    expect(screen.queryByText("전시 1")).not.toBeInTheDocument();
    expect(screen.getByText(/지난 전시/)).toBeInTheDocument();
  });

  it("지난 전시 제목을 누르면 펼쳐진다", async () => {
    render(
      <ExhibitionStatusSection
        title="지난 전시"
        status="ended"
        exhibitions={[ex(1), ex(2)]}
      />,
    );
    await userEvent.click(screen.getByRole("button", { name: /지난 전시/ }));
    expect(screen.getByText("전시 1")).toBeInTheDocument();
  });

  it("전시가 없으면 아무것도 그리지 않는다", () => {
    const { container } = render(
      <ExhibitionStatusSection title="예정" status="upcoming" exhibitions={[]} />,
    );
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/components/exhibition/exhibition-status-section.test.tsx`
Expected: FAIL — 지난 전시가 펼쳐진 채로 렌더돼 `전시 1`이 보인다

- [ ] **Step 3: 지난 전시를 disclosure로 만든다**

`exhibition-status-section.tsx`에서 `status === "ended"`일 때 제목을 버튼으로 바꾸고 기본 접힘으로 둔다:

```tsx
  const collapsible = status === "ended";
  const [open, setOpen] = useState(!collapsible);

  if (exhibitions.length === 0) return null;

  if (collapsible && !open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-11 w-full items-center justify-between px-1 text-sm font-bold text-muted-foreground active:opacity-70"
      >
        {t("home.endedCount", { n: exhibitions.length })}
        <ChevronDown className="size-4" aria-hidden />
      </button>
    );
  }
```

사전 `ko`: `endedCount: "지난 전시 {n}개"` / `en`: `endedCount: "{n} past exhibitions"`.

> 기존 `VISIBLE_CAP = 3` + 더보기 로직은 펼친 뒤에도 그대로 둔다 — 지난 전시가 많을 때 두 단계로 접히는 건 과하지 않다.

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/components/exhibition/exhibition-status-section.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 홈 히어로를 줄인다**

`src/app/(visitor)/page.tsx:137-170`의 히어로 `<section>`을 바꾼다. **로그인 사용자**는 128px 마스코트 애니메이션을 지우고 인사 한 줄만 남긴다:

```tsx
      {user ? (
        <section className="px-[var(--spacing-global-gutter)] pb-[var(--spacing-component-default)] pt-[var(--spacing-nav-to-title)]">
          <h1 className="type-body-lg font-bold">{t("home.heroGreeting")}</h1>
        </section>
      ) : (
        /* 비로그인 랜딩 — 앱 이름과 목적은 유지한다. Google OAuth 심사가
           홈페이지의 앱 이름이 동의 화면과 일치하는지 직접 확인하고,
           크롤러도 여기서 서비스가 뭔지 읽는다. 크기만 줄인다. */
        <section className="px-[var(--spacing-global-gutter)] pb-[var(--spacing-component-default)] pt-[var(--spacing-nav-to-title)]">
          <h1 className="text-2xl font-extrabold tracking-tight">Roam</h1>
          <p className="type-body mt-1 text-muted-foreground">
            {t("home.tagline")}
          </p>
        </section>
      )}
```

`RoamMotion`·`Image` import가 안 쓰이면 지운다(eslint가 잡는다). `/logo.svg`는 상단바에 그대로 남는다.

- [ ] **Step 6: 로그인 배너를 전시 아래로 내린다**

비로그인 안내 배너(`page.tsx:172-190` 부근)를 `<section>` 전시 목록 **뒤**로 옮긴다. 첫 화면에서 전시를 먼저 보여주고, 로그인은 둘러본 다음에 설명한다 — 계정 벽을 첫 화면에 세우지 않는다는 방향(열람은 공개)과 같다.

- [ ] **Step 7: 검증 + 실측 확인**

```bash
npx tsc --noEmit
npx vitest run
npx eslint "src/app/(visitor)/page.tsx" src/components/exhibition/
```

mock 모드 390×844에서 확인:
- 첫 전시 카드가 `y≈150` 부근에서 시작한다(주목 상위 구간 안)
- 진행 중 카드와 예정·지난 행이 **형태로** 구별된다
- 지난 전시가 기본으로 접혀 있다
- 비로그인에서 `Roam` 이름과 태그라인이 여전히 보인다 (OAuth 심사 요구)

- [ ] **Step 8: 커밋**

```bash
git add "src/app/(visitor)/page.tsx" src/components/exhibition/ src/lib/i18n/dictionaries.ts
git commit -m "feat(home): 전시를 주목 구간으로 — 마스코트 축소, 지난 전시 접기"
```

---

## Task 8: 홈 큐레이션 신호

"뭐가 좋은지 모른다"를 가진 사실로만 해결한다. 인기순 데이터는 없고, 지어내면 신뢰를 깬다.

**Files:**
- Create: `src/lib/exhibition/signals.ts`
- Create: `src/lib/exhibition/signals.test.ts`
- Modify: `src/app/(visitor)/page.tsx` (ongoing·upcoming에 신호 계산)
- Modify: `src/components/exhibition/exhibition-card.tsx` (신호 2줄 렌더)
- Modify: `src/lib/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: `BoothListItem[]`, `Exhibition`
- Produces:
  ```ts
  export interface ExhibitionSignals {
    boothCount: number;
    /** 로미가 근거를 가진 부스 수(enrichment summary가 있는 것). */
    groundedCount: number;
    /** 종료일까지 남은 일수. 진행 중이 아니면 null. */
    daysLeft: number | null;
  }
  export function exhibitionSignals(
    exhibition: Exhibition,
    booths: BoothListItem[],
    todayIso: string,
  ): ExhibitionSignals;
  ```

- [ ] **Step 1: 실패하는 테스트를 쓴다**

`src/lib/exhibition/signals.test.ts` 생성:

```ts
import { describe, expect, it } from "vitest";
import { exhibitionSignals } from "./signals";
import type { BoothListItem, Exhibition } from "@/lib/types";

const ex = {
  id: "e1",
  slug: "sibf-2026",
  name: "도서전",
  venue: "COEX",
  description: "",
  startDate: "2026-06-17",
  endDate: "2026-06-21",
  mapWidth: 100,
  mapHeight: 100,
  tips: {} as Exhibition["tips"],
  createdAt: "2026-01-01",
} satisfies Exhibition;

function booth(id: string, opts: { summary?: string; facility?: boolean } = {}) {
  return {
    id,
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: id,
    company: "",
    description: "",
    images: [],
    tags: [],
    x: 0,
    y: 0,
    popularity: 0,
    createdAt: "2026-01-01",
    kind: opts.facility ? "facility" : "exhibitor",
    enrichment: opts.summary
      ? ({ summary: opts.summary } as BoothListItem["enrichment"])
      : undefined,
  } as BoothListItem;
}

describe("exhibitionSignals", () => {
  it("부스 수는 facility를 빼고 센다 — 라운지·화장실은 볼거리가 아니다", () => {
    const s = exhibitionSignals(
      ex,
      [booth("a"), booth("b"), booth("c", { facility: true })],
      "2026-06-18",
    );
    expect(s.boothCount).toBe(2);
  });

  it("로미 준비도는 enrichment summary가 있는 부스만 센다", () => {
    const s = exhibitionSignals(
      ex,
      [booth("a", { summary: "에세이 위주" }), booth("b")],
      "2026-06-18",
    );
    expect(s.groundedCount).toBe(1);
  });

  it("빈 문자열 summary는 근거로 세지 않는다 — 없음과 비어 있음을 구별한다", () => {
    const s = exhibitionSignals(ex, [booth("a", { summary: "   " })], "2026-06-18");
    expect(s.groundedCount).toBe(0);
  });

  it("진행 중이면 종료일까지 남은 일수를 준다 (오늘 포함)", () => {
    expect(exhibitionSignals(ex, [], "2026-06-19").daysLeft).toBe(3);
    expect(exhibitionSignals(ex, [], "2026-06-21").daysLeft).toBe(1);
  });

  it("아직 시작 안 했거나 이미 끝났으면 daysLeft는 null이다", () => {
    expect(exhibitionSignals(ex, [], "2026-06-01").daysLeft).toBeNull();
    expect(exhibitionSignals(ex, [], "2026-06-22").daysLeft).toBeNull();
  });
});
```

- [ ] **Step 2: 실패를 확인한다**

Run: `npx vitest run src/lib/exhibition/signals.test.ts`
Expected: FAIL — `Failed to resolve import "./signals"`

- [ ] **Step 3: 구현한다**

`src/lib/exhibition/signals.ts` 생성:

```ts
import { exhibitionStatus } from "@/lib/exhibition/status";
import type { BoothListItem, Exhibition } from "@/lib/types";

/**
 * 홈 전시 카드의 결정 근거 — **가진 사실만.**
 *
 * 인기순은 쓰지 않는다. 전시별 인기 데이터가 없고, 없는 걸 지어내면
 * "성공처럼 보이는 실패"를 홈에서 반복한다.
 *
 * 로미 준비도(groundedCount)는 Roam만 말할 수 있는 지표다. 저작 커버리지가
 * 부스마다 다른 현실을 약점으로 숨기는 대신 "여긴 로미가 잘 아는 전시야"로 쓴다.
 */
export interface ExhibitionSignals {
  /** 볼거리 부스 수 — facility(라운지·화장실·무대)는 뺀다. */
  boothCount: number;
  /** 로미가 근거를 가진 부스 수 = enrichment summary가 실제로 채워진 것. */
  groundedCount: number;
  /** 종료일까지 남은 일수(오늘 포함). 진행 중이 아니면 null. */
  daysLeft: number | null;
}

const DAY_MS = 86_400_000;

export function exhibitionSignals(
  exhibition: Exhibition,
  booths: BoothListItem[],
  todayIso: string,
): ExhibitionSignals {
  const visitable = booths.filter((b) => b.kind !== "facility");
  // 공백만 있는 summary는 근거가 아니다 — 없음과 비어 있음을 구별한다.
  const groundedCount = visitable.filter(
    (b) => (b.enrichment?.summary ?? "").trim().length > 0,
  ).length;

  const daysLeft =
    exhibitionStatus(exhibition, todayIso) === "ongoing"
      ? Math.round(
          (Date.parse(`${exhibition.endDate}T00:00:00Z`) -
            Date.parse(`${todayIso}T00:00:00Z`)) /
            DAY_MS,
        ) + 1
      : null;

  return { boothCount: visitable.length, groundedCount, daysLeft };
}
```

- [ ] **Step 4: 통과를 확인한다**

Run: `npx vitest run src/lib/exhibition/signals.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: 문구를 사전에 넣는다**

`ko`의 `home`:

```ts
    signalBooths: "부스 {n}곳",
    signalGrounded: "로미가 아는 곳 {n}",
    signalDaysLeft: "{n}일 남음",
    signalLastDay: "오늘까지",
```

`en`:

```ts
    signalBooths: "{n} booths",
    signalGrounded: "{n} Romi knows",
    signalDaysLeft: "{n} days left",
    signalLastDay: "Last day",
```

- [ ] **Step 6: 카드에 신호 줄을 넣는다**

`ExhibitionCard`에 optional prop을 추가하고(`signals?: ExhibitionSignals`), 진행 중 카드의 `<div className="space-y-1.5 p-4">` 안 맨 위에 넣는다:

```tsx
        {signals && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-foreground">
            <span className="tabular">
              {t("home.signalBooths", { n: signals.boothCount })}
            </span>
            {signals.daysLeft !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="font-bold text-primary">
                  {signals.daysLeft === 1
                    ? t("home.signalLastDay")
                    : t("home.signalDaysLeft", { n: signals.daysLeft })}
                </span>
              </>
            )}
            {signals.groundedCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular text-muted-foreground">
                  {t("home.signalGrounded", { n: signals.groundedCount })}
                </span>
              </>
            )}
          </p>
        )}
```

- [ ] **Step 7: 홈에서 신호를 계산한다**

`src/app/(visitor)/page.tsx`에서, 지금은 `hasInterest`일 때만 도는 부스 읽기를 **진행 중·예정 전시에 대해서는 항상** 돌린다. 종료 전시는 행으로만 그려지므로 읽지 않는다 — 비용이 그만큼 묶인다.

```tsx
  // 신호(부스 수·로미 준비도)는 결정 근거라 비로그인에도 보여준다. 다만
  // 종료 전시는 행으로만 그려 신호를 안 쓰므로 읽지 않는다 — 읽기 비용을
  // 결정 대상(진행 중·예정)으로 한정한다.
  const needSignals = [...ongoing, ...upcoming];
  const signalEntries = await Promise.all(
    needSignals.map(async (ex) => {
      const booths = await repo.listBoothsByExhibitionId(ex.id);
      return [ex.slug, exhibitionSignals(ex, booths, today)] as const;
    }),
  );
  const signalsBySlug = new Map(signalEntries);
```

그리고 `ExhibitionStatusSection`에 `signalsBySlug`를 넘겨 카드마다 `signals={signalsBySlug.get(ex.slug)}`로 전달한다.

> ⚠️ `hasInterest` 분기에서 이미 같은 읽기를 하고 있다. **중복 읽기를 하지 않도록** 두 경로를 하나로 합친다 — 부스를 한 번만 읽어 `matchExhibition`과 `exhibitionSignals`에 둘 다 넘긴다.

- [ ] **Step 8: 검증 + 운영 dry-run**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/exhibition/signals.ts src/lib/exhibition/signals.test.ts "src/app/(visitor)/page.tsx" src/components/exhibition/exhibition-card.tsx
```

`MockRepository`는 인터페이스만 흉내내고 행동은 다르다. 특히 **`listBoothsByExhibitionId`는 `BOOTH_LIST_COLS`로 컬럼을 좁히므로 `enrichment`가 실제로 오는지 운영에서 확인해야 한다** — `groundedCount`가 전부 0으로 나오면 이 신호는 거짓이 된다.

```bash
npx next dev   # .env(운영 자격증명) — 읽기 전용 경로만 태운다
```

확인: 홈에서 SIBF 카드의 `로미가 아는 곳 N`이 0이 아닌지. 0이면 `listBoothsByExhibitionId`가 enrichment를 조인하는지 `src/lib/supabase/repository.ts`에서 확인하고, 안 오면 `groundedCount` 신호를 이 태스크에서 **빼고** 별도 태스크로 돌린다(거짓 신호를 내보내지 않는다).

- [ ] **Step 9: 커밋**

```bash
git add src/lib/exhibition/signals.ts src/lib/exhibition/signals.test.ts "src/app/(visitor)/page.tsx" src/components/exhibition/exhibition-card.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(home): 전시 결정 근거 — 부스 수·로미 준비도·남은 일수"
```

---

## Self-Review 기록

**스펙 커버리지**

| 스펙 항목 | 태스크 |
|---|---|
| P0-F 포스터 축소·메타 흡수 | Task 5 Step 2 |
| P0-F 카드 3장 → 유틸 행 | Task 3, Task 5 Step 3 |
| P0-F 상태당 primary 하나 | Task 4, Task 5 Step 4 |
| P0-F 진행 비트 | Task 5 Step 5 |
| P0-F `pb-28` 토큰화 | Task 5 Step 6 |
| P0-G 문장용 타입 유틸 | Task 1 |
| P0-G 산문 호출부 교체 + 클램프 재조정 | Task 2 |
| P0-H 마스코트 축소 | Task 7 Step 5 |
| P0-H 상태를 형태로 | Task 6 |
| P0-H 지난 전시 기본 접힘 | Task 7 Step 3 |
| P0-H 큐레이션 신호 4종 | Task 8 |

**미해결로 남기는 것 (의도적)**

- **종료 전시 전용 화면** (`/exhibitions/[slug]/record`). Task 6에서 `href`를 기존 경로로 두고 TODO만 남긴다. 끝난 전시에서 "오늘 관람 마치기"가 뜨는 문제는 Task 5의 `primaryAction`이 `judgedCount`로 분기하므로 **부분적으로만** 해소된다 — 완전한 해결은 별도 플랜.
- **취향 겹침 신호**(`matchReason`)는 이미 `page.tsx`에 있고 Task 8이 건드리지 않는다. 신호 4종 중 이것만 기존 코드 그대로다.

**타입 일관성 확인**

- `ExhibitionStatusKind`는 `@/lib/exhibition/status`에서 import — Task 6·7이 같은 이름을 쓴다.
- `ExhibitionSignals`는 Task 8에서 정의하고 같은 태스크 안에서만 쓴다.
- `primaryAction` 반환값 `"onboarding" | "feed" | "finish"` — Task 5가 세 값 전부 분기한다.
- `ExhibitionUtilityRow` 시그니처 `{ slug, showNotes, onSearch }` — Task 3이 정의하고 Task 5의 `ExhibitionUtilityBar`가 그대로 쓴다.
