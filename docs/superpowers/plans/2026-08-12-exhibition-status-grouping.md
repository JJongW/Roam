# 전시 목록 상태별 구분 + 회차 묶음 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 홈의 전시 목록을 예정/진행중/지난 전시 3섹션으로 나누고, 같은 회차 시리즈는 대표 전시 하나로 묶어 보여준다.

**Architecture:** `startDate`/`endDate` vs 오늘 날짜로 상태를 계산하고, 전시 이름의 "제N회" 접두사로 회차를 묶는 순수 함수를 만든다. 홈 페이지는 기존 취향 매칭 정렬 로직 위에 이 함수들을 적용해 3섹션으로 렌더하고, 섹션 안에서 3개 넘는 항목은 클라이언트 컴포넌트의 "더보기"로 펼친다.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · vitest

## Global Constraints

- 상태 판정은 `startDate`/`endDate` vs 오늘 날짜만으로 — **새 DB 필드를 추가하지 않는다**.
- 회차 묶음은 "제N회" 접두사 패턴 자동 감지로 — **새 DB 필드를 추가하지 않는다**. 별도 회차 목록 페이지도 만들지 않는다.
- 섹션당 최대 **3개** 표시, 넘으면 같은 자리에서 "더보기"로 펼친다 — **새 라우트를 만들지 않는다**.
- 추천 배지(취향 겹침)는 **진행중·예정 섹션에만** 적용한다. 지난 전시 섹션엔 붙이지 않는다.
- 주석은 한국어, 무엇을 하는지가 아니라 왜 그런지를 쓴다.
- 새 npm 의존성을 추가하지 않는다.
- 검증 3종은 매 태스크 끝에: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.

---

### Task 1: 상태·회차 순수 함수 — `status.ts`

**Files:**
- Create: `src/lib/exhibition/status.ts`
- Test: `src/lib/exhibition/status.test.ts`

**Interfaces:**
- Consumes: `Exhibition`(`@/lib/types` — `{id, slug, name, startDate: string, endDate: string, ...}`, 이미 정의됨).
- Produces: `ExhibitionStatusKind = "upcoming" | "ongoing" | "ended"`. `exhibitionStatus(ex: Exhibition, todayISO: string): ExhibitionStatusKind`. `seriesKeyOf(name: string): string`. `pickSeriesRepresentative(exhibitions: Exhibition[], status: ExhibitionStatusKind): Exhibition[]`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/exhibition/status.test.ts` 전체 내용:

```ts
import { describe, expect, it } from "vitest";
import {
  exhibitionStatus,
  seriesKeyOf,
  pickSeriesRepresentative,
} from "./status";
import type { Exhibition } from "@/lib/types";

function ex(overrides: Partial<Exhibition> & { id: string; name: string; startDate: string; endDate: string }): Exhibition {
  return {
    slug: overrides.id,
    venue: "test",
    description: "",
    mapWidth: 100,
    mapHeight: 100,
    tips: { arrival: [], routes: [], facilities: [] },
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  } as Exhibition;
}

describe("exhibitionStatus", () => {
  it("오늘이 시작일 이전이면 upcoming", () => {
    const e = ex({ id: "e1", name: "전시1", startDate: "2026-08-20", endDate: "2026-08-25" });
    expect(exhibitionStatus(e, "2026-08-12")).toBe("upcoming");
  });
  it("시작일 당일이면 ongoing", () => {
    const e = ex({ id: "e1", name: "전시1", startDate: "2026-08-12", endDate: "2026-08-15" });
    expect(exhibitionStatus(e, "2026-08-12")).toBe("ongoing");
  });
  it("종료일 당일이면 ongoing", () => {
    const e = ex({ id: "e1", name: "전시1", startDate: "2026-08-08", endDate: "2026-08-12" });
    expect(exhibitionStatus(e, "2026-08-12")).toBe("ongoing");
  });
  it("종료일 다음날이면 ended", () => {
    const e = ex({ id: "e1", name: "전시1", startDate: "2026-06-24", endDate: "2026-06-28" });
    expect(exhibitionStatus(e, "2026-08-12")).toBe("ended");
  });
});

describe("seriesKeyOf", () => {
  it("'제N회' 접두사를 떼어낸다", () => {
    expect(seriesKeyOf("제1회 서울국제도서전")).toBe("서울국제도서전");
    expect(seriesKeyOf("제23회 서울국제도서전")).toBe("서울국제도서전");
  });
  it("접두사 사이 공백이 있어도 처리한다", () => {
    expect(seriesKeyOf("제 5 회 일러스트레이션페어")).toBe("일러스트레이션페어");
  });
  it("접두사가 없으면 이름 그대로", () => {
    expect(seriesKeyOf("하우스 아카이브")).toBe("하우스 아카이브");
  });
});

describe("pickSeriesRepresentative", () => {
  it("같은 회차 시리즈는 upcoming·ongoing에서 가장 임박한 것만 남긴다", () => {
    const list = [
      ex({ id: "e2", name: "제2회 도서전", startDate: "2026-09-01", endDate: "2026-09-05" }),
      ex({ id: "e1", name: "제1회 도서전", startDate: "2026-08-20", endDate: "2026-08-25" }),
    ];
    const result = pickSeriesRepresentative(list, "upcoming");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e1");
  });
  it("같은 회차 시리즈는 ended에서 가장 최근 종료한 것만 남긴다", () => {
    const list = [
      ex({ id: "e1", name: "제1회 도서전", startDate: "2026-01-01", endDate: "2026-01-05" }),
      ex({ id: "e2", name: "제2회 도서전", startDate: "2026-06-01", endDate: "2026-06-05" }),
    ];
    const result = pickSeriesRepresentative(list, "ended");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("e2");
  });
  it("다른 시리즈는 각각 남기고, 입력 순서(첫 등장 순)를 유지한다", () => {
    const list = [
      ex({ id: "a", name: "일러스트레이션페어", startDate: "2026-08-20", endDate: "2026-08-22" }),
      ex({ id: "b", name: "제1회 도서전", startDate: "2026-08-10", endDate: "2026-08-12" }),
      ex({ id: "c", name: "제2회 도서전", startDate: "2026-08-15", endDate: "2026-08-17" }),
    ];
    const result = pickSeriesRepresentative(list, "upcoming");
    expect(result.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("빈 배열이면 빈 배열", () => {
    expect(pickSeriesRepresentative([], "upcoming")).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/exhibition/status.test.ts`
Expected: FAIL — `./status` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/lib/exhibition/status.ts` 전체 내용:

```ts
import type { Exhibition } from "@/lib/types";

export type ExhibitionStatusKind = "upcoming" | "ongoing" | "ended";

/** startDate·endDate와 오늘 날짜(YYYY-MM-DD) 문자열 비교만으로 판정한다 —
 *  DB에 상태 필드가 따로 없다. 시작·종료 당일은 모두 ongoing에 포함한다. */
export function exhibitionStatus(
  ex: Exhibition,
  todayISO: string,
): ExhibitionStatusKind {
  if (todayISO < ex.startDate) return "upcoming";
  if (todayISO > ex.endDate) return "ended";
  return "ongoing";
}

/** "제N회" 접두사(공백 허용)를 떼어낸 나머지를 회차 묶음 키로 쓴다. 접두사가
 *  없으면 이름 그대로가 키라 그 전시 혼자 자기 묶음이 된다. */
export function seriesKeyOf(name: string): string {
  return name.replace(/^제\s*\d+\s*회\s*/, "").trim();
}

/**
 * 같은 회차 시리즈(seriesKeyOf가 같은)는 대표 전시 하나로 합친다 — 새 회차
 * 페이지 없이 홈 목록 자리 하나만 차지하게 한다. upcoming·ongoing은 가장
 * 임박한(startDate 오름차순) 것을, ended는 가장 최근에 끝난(endDate 내림차순)
 * 것을 대표로 남긴다. 반환 순서는 입력에서 각 시리즈가 처음 등장한 순서를
 * 그대로 따른다 — 이 함수는 정렬을 새로 하지 않고 중복만 걷어낸다(정렬은
 * 호출부 책임).
 */
export function pickSeriesRepresentative(
  exhibitions: Exhibition[],
  status: ExhibitionStatusKind,
): Exhibition[] {
  const groups = new Map<string, Exhibition[]>();
  const firstSeenOrder: string[] = [];
  for (const ex of exhibitions) {
    const key = seriesKeyOf(ex.name);
    if (!groups.has(key)) {
      groups.set(key, []);
      firstSeenOrder.push(key);
    }
    groups.get(key)!.push(ex);
  }
  return firstSeenOrder.map((key) => {
    const group = groups.get(key)!;
    if (status === "ended") {
      return [...group].sort((a, b) => b.endDate.localeCompare(a.endDate))[0];
    }
    return [...group].sort((a, b) => a.startDate.localeCompare(b.startDate))[0];
  });
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/exhibition/status.test.ts`
Expected: PASS(11개 전부)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "exhibition/status"
npx vitest run
npx eslint src/lib/exhibition/status.ts src/lib/exhibition/status.test.ts
git add src/lib/exhibition/status.ts src/lib/exhibition/status.test.ts
git commit -m "feat(home): 전시 상태·회차 판정 순수 함수 추가

시작·종료일 vs 오늘로 예정/진행중/지난 전시를 가르고, '제N회' 접두사로
같은 시리즈 전시를 대표 하나로 묶는 로직을 순수 함수로 분리한다. 다음
태스크에서 홈 페이지가 이 함수들로 목록을 3섹션으로 나눈다."
```

---

### Task 2: 홈 페이지 3섹션 재구성 + 더보기 컴포넌트

**Files:**
- Create: `src/components/exhibition/exhibition-status-section.tsx`
- Modify: `src/lib/i18n/dictionaries.ts`(`home` 네임스페이스, ko 183번째 줄 근처 + en 871번째 줄 근처)
- Modify: `src/app/(visitor)/page.tsx`

**Interfaces:**
- Consumes: Task 1의 `exhibitionStatus`/`pickSeriesRepresentative`. `todayISO()`(`@/lib/exhibition/current`, 이미 구현됨). `ExhibitionCard`(`@/components/exhibition/exhibition-card`, 이미 구현됨 — `{exhibition, recommended?, recommendedLabel?}`). `useT()`(`@/lib/i18n/provider`).
- Produces: `ExhibitionStatusSection({title, exhibitions, recommendedSlug?, recommendedLabel?, recommendedReason?}): JSX.Element | null`.

- [ ] **Step 1: i18n 카피 추가**

`src/lib/i18n/dictionaries.ts`의 ko `home` 블록(183번째 줄 근처, `listHeading: "..."` 다음 줄)에 추가:

```ts
    statusOngoing: "진행 중인 전시",
    statusUpcoming: "다가오는 전시",
    statusEnded: "지난 전시",
    showMore: "더보기 ({n})",
```

en `home` 블록(871번째 줄 근처, `listHeading: "..."` 다음 줄)에 추가:

```ts
    statusOngoing: "Ongoing",
    statusUpcoming: "Upcoming",
    statusEnded: "Past fairs",
    showMore: "Show {n} more",
```

- [ ] **Step 2: 더보기 컴포넌트 작성**

`src/components/exhibition/exhibition-status-section.tsx` 전체 내용:

```tsx
"use client";

import { useState } from "react";
import { ExhibitionCard } from "@/components/exhibition/exhibition-card";
import { useT } from "@/lib/i18n/provider";
import type { Exhibition } from "@/lib/types";

const VISIBLE_CAP = 3;

/**
 * 상태별 전시 섹션 — 최대 3개만 보여주고 나머지는 "더보기"로 같은 자리에서
 * 펼친다(새 페이지·API 호출 없음, 이미 서버가 다 내려준 목록 중 일부만
 * 숨겼다 보여주는 것뿐이다). 이 섹션에 전시가 하나도 없으면 렌더하지 않는다.
 */
export function ExhibitionStatusSection({
  title,
  exhibitions,
  recommendedSlug,
  recommendedLabel,
  recommendedReason,
}: {
  title: string;
  exhibitions: Exhibition[];
  recommendedSlug?: string;
  recommendedLabel?: string;
  recommendedReason?: string | null;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  if (exhibitions.length === 0) return null;

  const visible = expanded ? exhibitions : exhibitions.slice(0, VISIBLE_CAP);
  const hiddenCount = exhibitions.length - visible.length;

  return (
    <div className="space-y-2">
      <h2 className="px-1 text-sm font-bold text-muted-foreground">{title}</h2>
      <div className="space-y-3">
        {visible.map((ex) => (
          <div key={ex.id} className="space-y-1.5">
            <ExhibitionCard
              exhibition={ex}
              recommended={ex.slug === recommendedSlug}
              recommendedLabel={recommendedLabel}
            />
            {ex.slug === recommendedSlug && recommendedReason && (
              <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                {recommendedReason}
              </p>
            )}
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-center text-sm font-semibold text-primary active:opacity-70"
        >
          {t("home.showMore", { n: hiddenCount })}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 홈 페이지 재구성**

`src/app/(visitor)/page.tsx`에서 import 목록에 추가:

```tsx
import { todayISO } from "@/lib/exhibition/current";
import { exhibitionStatus, pickSeriesRepresentative } from "@/lib/exhibition/status";
import { ExhibitionStatusSection } from "@/components/exhibition/exhibition-status-section";
```

기존 코드:

```tsx
  // 첫 전시를 "추천"이라 부를 수 있는 건 실제로 겹친 가치가 있을 때뿐이다.
  const top = exhibitions[0];
  const topMatch = top ? matchBySlug.get(top.slug) : undefined;
  const topReason = topMatch ? matchReason(topMatch.matched) : null;
```

를 다음으로 교체:

```tsx
  const today = todayISO();
  const byStatus = (status: "upcoming" | "ongoing" | "ended") =>
    exhibitions.filter((ex) => exhibitionStatus(ex, today) === status);

  const ongoing = pickSeriesRepresentative(byStatus("ongoing"), "ongoing");
  const upcoming = pickSeriesRepresentative(byStatus("upcoming"), "upcoming");
  // 지난 전시는 매치 점수·개막일 순서가 의미 없다 — 최근에 끝난 것부터.
  const ended = [...pickSeriesRepresentative(byStatus("ended"), "ended")].sort(
    (a, b) => b.endDate.localeCompare(a.endDate),
  );

  // "추천"은 진행중·예정 중에서만 — 이미 끝난 전시를 취향 근거로 추천하는 건
  // 의미가 없다. ongoing을 upcoming보다 먼저 두어 "지금 갈 수 있는 곳"을 우선한다.
  const top = [...ongoing, ...upcoming][0];
  const topMatch = top ? matchBySlug.get(top.slug) : undefined;
  const topReason = topMatch ? matchReason(topMatch.matched) : null;
  const topReasonText =
    topReason ?? (exhibitions.length === 1 ? t("home.singleReason") : null);
  const topStatus = top ? exhibitionStatus(top, today) : null;
```

(이 코드가 `const { t } = await getI18n();`보다 뒤에 오도록 위치를 확인 — 현재 파일에서 `getI18n()` 호출은 이미 `exhibitions`/`matchBySlug` 계산보다 앞에 있다.)

기존 렌더 블록:

```tsx
      <section className="space-y-3 px-[var(--spacing-global-gutter)] pb-6 pt-2">
        {exhibitions.length > 0 && (
          <h2 className="px-1 text-sm font-bold text-muted-foreground">
            {t("home.listHeading")}
          </h2>
        )}
        {exhibitions.length === 0 ? (
          <EmptyState
            title={t("home.emptyTitle")}
            description={t("home.emptyDesc")}
          />
        ) : (
          exhibitions.map((ex, i) => (
            <div key={ex.id} className="space-y-1.5">
              {/* "로미 추천"은 겹친 가치가 실제로 있을 때만 — 근거 없이 주장하지 않는다. */}
              <ExhibitionCard
                exhibition={ex}
                recommended={i === 0 && topReason !== null}
                recommendedLabel={t("home.recommended")}
              />
              {/* 근거 한 줄 — 결정론(LLM 없음). 겹친 가치를 그대로 말하고, 겹침이 없으면
                  아무 말도 하지 않는다. 전시가 하나뿐일 때만 그 사실을 솔직히 알린다. */}
              {i === 0 && (topReason || exhibitions.length === 1) && (
                <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                  {topReason ?? t("home.singleReason")}
                </p>
              )}
            </div>
          ))
        )}
      </section>
```

를 다음으로 교체:

```tsx
      <section className="space-y-5 px-[var(--spacing-global-gutter)] pb-6 pt-2">
        {exhibitions.length === 0 ? (
          <EmptyState
            title={t("home.emptyTitle")}
            description={t("home.emptyDesc")}
          />
        ) : (
          <>
            <ExhibitionStatusSection
              title={t("home.statusOngoing")}
              exhibitions={ongoing}
              recommendedSlug={top?.slug}
              recommendedLabel={t("home.recommended")}
              recommendedReason={topStatus === "ongoing" ? topReasonText : null}
            />
            <ExhibitionStatusSection
              title={t("home.statusUpcoming")}
              exhibitions={upcoming}
              recommendedSlug={top?.slug}
              recommendedLabel={t("home.recommended")}
              recommendedReason={topStatus === "upcoming" ? topReasonText : null}
            />
            <ExhibitionStatusSection
              title={t("home.statusEnded")}
              exhibitions={ended}
            />
          </>
        )}
      </section>
```

- [ ] **Step 4: 검증**

이 페이지·컴포넌트는 다른 방문객 페이지 대부분과 마찬가지로 유닛테스트가 없다 — 새로 만들지 않는다.

```bash
npx tsc --noEmit
npx vitest run
npx eslint "src/app/(visitor)/page.tsx" src/components/exhibition/exhibition-status-section.tsx src/lib/i18n/dictionaries.ts
```

- [ ] **Step 5: 수동 확인(선택, 가능하면)**

`npx next dev`로 mock 모드 실행 후 홈(`/`)에서 진행중/예정/지난 전시 섹션이 나뉘어 보이는지, 지난 전시(SIBF·SIF)에 추천 배지가 안 붙는지, 더보기가 있으면 눌러서 펼쳐지는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/components/exhibition/exhibition-status-section.tsx src/lib/i18n/dictionaries.ts "src/app/(visitor)/page.tsx"
git commit -m "feat(home): 전시 목록을 진행중/예정/지난 전시 3섹션으로 재구성

지금까지 평평한 목록 하나에 이미 끝난 전시와 예정 전시가 섞여 있었다.
상태별로 나누고, 섹션마다 3개 넘으면 더보기로 펼친다. 취향 겹침 추천은
진행중·예정에만 붙는다 — 끝난 전시를 추천하는 건 의미가 없다."
```

---

## 자기 점검 결과

- **스펙 커버리지**: 스펙의 세 아키텍처 항목(상태·회차 순수 함수, 홈 페이지 재구성, 더보기 컴포넌트) 모두 Task 1~2에 1:1 대응. "새 DB 필드 없음", "새 라우트 없음", "추천 배지는 진행중·예정에만" 세 확정 사항 모두 Global Constraints에 반영되고 구현이 그대로 따른다.
- **플레이스홀더 스캔**: 없음 — 모든 코드가 실제 파일 경로·실제 함수 시그니처를 참조.
- **타입 일관성**: `ExhibitionStatusKind`/`exhibitionStatus`/`pickSeriesRepresentative`(Task 1 정의) → Task 2(홈 페이지 호출부) 동일 시그니처로 소비. `ExhibitionStatusSection` props가 홈 페이지의 호출 인자와 정확히 일치.
- **범위 점검**: 2태스크 모두 단일 관심사 + 독립 테스트 가능. Task 1(순수 함수, 완전 독립)→Task 2(UI, Task 1 소비) 순서로 각 태스크가 앞 태스크 없이 테스트 불가능하지 않다.
