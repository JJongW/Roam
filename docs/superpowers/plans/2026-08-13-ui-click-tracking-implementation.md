# UI 클릭 집계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin이 지도 컨트롤·피드 CTA·컴패니언 바 등 버튼별 전체 클릭 집계("버튼 인기도")를
볼 수 있게 한다.

**Architecture:** 기존 Stream A(`analytics_event` 테이블, `POST /api/analytics/events`)에
새 타입 `"ui_click"`을 하나 추가하고 `meta.control`로 버튼을 구분한다. 부스와 무관한
클릭은 클라이언트가 `exhibitionSlug`를 명시적으로 보내야 하므로 스키마·라우트를
확장한다. 순수 집계 함수 하나(`ui-click-breakdown.ts`)가 raw 이벤트 배열을 받아
control별 카운트를 만들고, admin 분석 페이지에 막대그래프 패널로 얹는다.

**Tech Stack:** Next.js Route Handlers, Zod, Supabase(Postgres)/in-memory mock repo,
Recharts, vitest.

## Global Constraints

- LLM 호출 절대 금지 — 순수 카운팅/집계.
- `analyticsEventInputSchema` 확장은 반드시 optional 필드로 — 기존 `view`/`dwell`
  호출부(부스 상세 등)를 깨면 안 된다.
- Mock repository 변경분엔 vitest 유닛 테스트를 반드시 붙인다. Supabase repository는
  이 플랜에서 스키마·로직 변경이 없으므로(기존 `recordAnalytics`/`_allAnalytics` 그대로
  재사용) 테스트 대상 아님 — 관련 태스크 없음.
- 매 태스크: `npx tsc --noEmit`, `npx vitest run`, `npx eslint <changed paths>` 그린
  확인 후 커밋.
- `public/booths/house-archive/`, `public/house_archive_br/` 아래 파일은 절대 건드리지
  않는다(사용자의 별도 진행 중 작업).
- control id는 스펙에 고정된 11개 문자열 그대로 쓴다(오타·변형 금지):
  `map_zoom_in`, `map_zoom_out`, `map_reset_view`, `map_rotate`,
  `feed_exhausted_finish`, `feed_exhausted_map`, `feed_repick`,
  `companion_bar_open`, `companion_faq_q1`, `companion_faq_q2`, `companion_faq_q3`,
  `finish_visit_start`.

---

### Task 1: 스키마 확장 + exhibitionId 귀속 라우트 수정

**Files:**
- Modify: `src/lib/types/index.ts` (ANALYTICS_TYPES, 39-46번째 줄 근처)
- Modify: `src/lib/schemas/index.ts` (analyticsEventInputSchema, 172-178번째 줄 근처)
- Modify: `src/app/api/analytics/events/route.ts`
- Test: `src/app/api/analytics/events/route.test.ts` (신규)

**Interfaces:**
- Produces: `ANALYTICS_TYPES`에 `"ui_click"` 추가(다른 태스크 모두 이 값을 씀).
  `analyticsEventInputSchema`에 `exhibitionSlug?: string` 추가(다른 태스크의 클라이언트
  계측 호출이 이 필드를 씀).

- [ ] **Step 1: `ANALYTICS_TYPES`에 `"ui_click"` 추가**

`src/lib/types/index.ts`의 `ANALYTICS_TYPES` 배열:

```ts
export const ANALYTICS_TYPES = [
  "view",
  "dwell",
  "route_start",
  "route_complete",
  "booth_arrive",
  "event_bookmark",
  "ui_click",
] as const;
```

(기존 6개 값은 그대로 두고 `"ui_click"`만 추가 — 순서·기존 값 변경 없음.)

- [ ] **Step 2: `analyticsEventInputSchema`에 `exhibitionSlug` 추가**

`src/lib/schemas/index.ts`:

```ts
export const analyticsEventInputSchema = z.object({
  type: z.enum(ANALYTICS_TYPES),
  boothId: z.string().optional(),
  exhibitionSlug: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
```

- [ ] **Step 3: 라우트가 `exhibitionSlug`로 전시를 귀속하게 수정**

`src/app/api/analytics/events/route.ts` 전체를 다음으로 교체:

```ts
import { NextResponse } from "next/server";
import { getRepository } from "@/lib/repositories";
import { parseBody } from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { analyticsEventInputSchema } from "@/lib/schemas";

// Fire-and-forget visitor analytics ingestion.
export async function POST(req: Request) {
  const parsed = await parseBody(req, analyticsEventInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  // 세션은 재사용되면 exhibitionId가 최초 생성 시점 값으로 고정된다 — 이 이벤트가
  // 실제로 어느 전시인지는 부스에서 직접 구해 세션 값보다 우선한다(그래야 세션이
  // "unknown"으로 굳어 있었거나 다른 전시에서 만들어졌어도 이 이벤트는 정확하다).
  const booth = parsed.data.boothId ? await repo.getBooth(parsed.data.boothId) : null;
  // 부스와 무관한 클릭(지도 컨트롤·피드 CTA·컴패니언 바 등)은 boothId가 없으므로
  // 클라이언트가 직접 보낸 exhibitionSlug로 귀속한다 — 세션 폴백은 같은 이유로
  // 신뢰할 수 없다(위 주석 참고).
  const exhibitionBySlug = parsed.data.exhibitionSlug
    ? await repo.getExhibition(parsed.data.exhibitionSlug)
    : null;
  const exhibitionId = booth?.exhibitionId ?? exhibitionBySlug?.exhibition.id;
  const session = await ensureSession(exhibitionId);
  await repo.recordAnalytics(session.id, exhibitionId ?? session.exhibitionId, parsed.data);
  return new NextResponse(null, { status: 202 });
}
```

- [ ] **Step 4: 라우트 테스트 작성**

`src/app/api/analytics/events/route.test.ts` (신규 파일):

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "./route";
import { getRepository } from "@/lib/repositories";
import { MockRepository } from "@/lib/mock/repository";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

describe("POST /api/analytics/events", () => {
  it("attributes a booth-less ui_click event via exhibitionSlug", async () => {
    const repo = await getRepository();
    expect(repo).toBeInstanceOf(MockRepository);

    const req = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ui_click",
        exhibitionSlug: "sibf-2026",
        meta: { control: "map_zoom_in" },
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const detail = await repo.getExhibition("sibf-2026");
    const events = await repo._allAnalytics!(detail!.exhibition.id);
    const clicks = events.filter((e) => e.type === "ui_click");
    expect(clicks.length).toBe(1);
    expect(clicks[0].meta?.control).toBe("map_zoom_in");
  });

  it("still attributes booth-scoped events via boothId (unchanged behavior)", async () => {
    const req = new Request("http://localhost/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "view", boothId: "b_a1902" }),
    });

    const res = await POST(req);
    expect(res.status).toBe(202);

    const repo = await getRepository();
    const booth = await repo.getBooth("b_a1902");
    const events = await repo._allAnalytics!(booth!.exhibitionId);
    expect(events.some((e) => e.type === "view" && e.boothId === "b_a1902")).toBe(
      true,
    );
  });
});
```

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/types/index.ts src/lib/schemas/index.ts src/app/api/analytics/events/route.ts src/app/api/analytics/events/route.test.ts
git add src/lib/types/index.ts src/lib/schemas/index.ts src/app/api/analytics/events/route.ts src/app/api/analytics/events/route.test.ts
git commit -m "feat(analytics): ui_click 타입 + exhibitionSlug 귀속 추가"
```

---

### Task 2: 집계 함수

**Files:**
- Create: `src/lib/admin/ui-click-breakdown.ts`
- Test: `src/lib/admin/ui-click-breakdown.test.ts`

**Interfaces:**
- Consumes: `AnalyticsEvent`(`src/lib/types/index.ts`에 이미 존재 — `type`, `meta` 필드
  포함).
- Produces: `UiClickCount { control: string; count: number }`,
  `uiClickBreakdown(events: AnalyticsEvent[]): UiClickCount[]` — Task 5(admin UI)가 씀.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/admin/ui-click-breakdown.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { uiClickBreakdown } from "./ui-click-breakdown";
import type { AnalyticsEvent } from "@/lib/types";

function ev(control: string, type: AnalyticsEvent["type"] = "ui_click"): AnalyticsEvent {
  return {
    id: `an_${Math.random()}`,
    sessionId: "s1",
    exhibitionId: "exh_1",
    type,
    createdAt: "2026-08-13T00:00:00.000Z",
    meta: { control },
  } as AnalyticsEvent;
}

describe("uiClickBreakdown", () => {
  it("counts by control, descending, ignoring non-ui_click events", () => {
    const events = [
      ev("map_zoom_in"),
      ev("map_zoom_in"),
      ev("companion_bar_open"),
      ev("map_zoom_in"),
      ev("view", "view"),
    ];
    const result = uiClickBreakdown(events);
    expect(result).toEqual([
      { control: "map_zoom_in", count: 3 },
      { control: "companion_bar_open", count: 1 },
    ]);
  });

  it("returns an empty array when there are no ui_click events", () => {
    expect(uiClickBreakdown([ev("view", "view")])).toEqual([]);
  });

  it("ignores ui_click events with no meta.control", () => {
    const noControl: AnalyticsEvent = {
      id: "an_x",
      sessionId: "s1",
      exhibitionId: "exh_1",
      type: "ui_click",
      createdAt: "2026-08-13T00:00:00.000Z",
    } as AnalyticsEvent;
    expect(uiClickBreakdown([noControl])).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/admin/ui-click-breakdown.test.ts`
Expected: FAIL — `./ui-click-breakdown` 모듈 없음.

- [ ] **Step 3: 구현**

`src/lib/admin/ui-click-breakdown.ts`:

```ts
import type { AnalyticsEvent } from "@/lib/types";

export interface UiClickCount {
  control: string;
  count: number;
}

/**
 * 버튼(지도 컨트롤·피드 CTA·컴패니언 바 등) 클릭 집계 — meta.control로 묶어
 * count 내림차순. 순수, 테스트 가능. control이 없는 이벤트는 뺀다.
 */
export function uiClickBreakdown(events: AnalyticsEvent[]): UiClickCount[] {
  const counts = new Map<string, number>();
  for (const e of events) {
    if (e.type !== "ui_click") continue;
    const control = e.meta?.control;
    if (typeof control !== "string" || !control) continue;
    counts.set(control, (counts.get(control) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([control, count]) => ({ control, count }))
    .sort((a, b) => b.count - a.count);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/admin/ui-click-breakdown.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit
npx eslint src/lib/admin/ui-click-breakdown.ts src/lib/admin/ui-click-breakdown.test.ts
git add src/lib/admin/ui-click-breakdown.ts src/lib/admin/ui-click-breakdown.test.ts
git commit -m "feat(admin): ui_click 버튼별 집계 함수"
```

---

### Task 3: 지도 컨트롤 계측

**Files:**
- Modify: `src/components/map/exhibition-map.tsx`
- Modify: `src/components/map/map-view.tsx`

**Interfaces:**
- Consumes: Task 1의 `POST /api/analytics/events`(`type: "ui_click"`,
  `exhibitionSlug`, `meta.control`).
- Produces: `ExhibitionMap`에 신규 prop `exhibitionSlug?: string`(다른 소비자 없음,
  이 태스크에서 선언·소비 모두 끝남).

- [ ] **Step 1: `ExhibitionMap`에 `exhibitionSlug` prop 추가 + 계측 헬퍼**

`src/components/map/exhibition-map.tsx`의 `MapProps` 인터페이스(≈100-120번째 줄,
`persistKey` 선언부 근처)에 추가:

```ts
  /** admin 버튼 인기도 집계용 — persistKey(스토리지 키)와 별개로, 클릭 이벤트를
   *  귀속시킬 전시를 명시한다. 없으면 계측만 조용히 스킵(지도 자체 동작은 영향 없음). */
  exhibitionSlug?: string;
```

함수 시그니처(140번째 줄 근처) destructuring에 `exhibitionSlug`도 추가:

```ts
export function ExhibitionMap({
  width: widthProp,
  height: heightProp,
  booths,
  categories,
  halls = [],
  selectedId,
  mustIds = [],
  curiousIds = [],
  passIds = [],
  goodIds = [],
  okIds = [],
  badIds = [],
  position,
  floorplan,
  fillHeight = false,
  focus,
  onSelect,
  onMapTap,
  onInteractStart,
  onMoveStart,
  onMoveEnd,
  centerOn,
  focusBottomInset = 0,
  heat,
  heatPairs,
  className,
  persistKey,
  exhibitionSlug,
  viewportClassName = "inset-0",
  controlsClassName = "bottom-4 right-3",
}: MapProps) {
```

컴포넌트 본문 최상단(`containerRef`/`svgRef` 선언 근처)에 fire-and-forget 헬퍼 추가:

```ts
  function trackClick(control: string) {
    if (!exhibitionSlug) return;
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ui_click",
        exhibitionSlug,
        meta: { control },
      }),
    });
  }
```

- [ ] **Step 2: 4개 컨트롤 버튼에 계측 연결**

같은 파일, 컨트롤 버튼 4개(≈1531-1566번째 줄)의 `onClick`을 다음처럼 감싼다
(기존 동작은 그대로 두고 계측 호출만 앞에 추가):

```tsx
        <Button
          variant="outline"
          size="icon"
          className="bg-card shadow-[var(--shadow-card)]"
          aria-label="지도 90도 회전"
          onClick={() => {
            trackClick("map_rotate");
            rotate90();
          }}
        >
          <RotateCw className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-card shadow-[var(--shadow-card)]"
          aria-label="확대"
          onClick={() => {
            trackClick("map_zoom_in");
            zoomBy(1.25, undefined, true);
          }}
        >
          <Plus className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-card shadow-[var(--shadow-card)]"
          aria-label="축소"
          onClick={() => {
            trackClick("map_zoom_out");
            zoomBy(0.8, undefined, true);
          }}
        >
          <Minus className="size-5" />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="bg-card shadow-[var(--shadow-card)]"
          aria-label="전체 보기"
          onClick={() => {
            trackClick("map_reset_view");
            resetView();
          }}
        >
          <Maximize2 className="size-5" />
        </Button>
```

- [ ] **Step 3: `map-view.tsx`가 `exhibitionSlug` 전달**

`src/components/map/map-view.tsx`의 `<ExhibitionMap ... persistKey={detail.exhibition.slug}`
호출(≈201-209번째 줄)에 한 줄 추가:

```tsx
      <ExhibitionMap
        ...
        persistKey={detail.exhibition.slug}
        exhibitionSlug={detail.exhibition.slug}
        ...
      />
```

(정확한 위치는 `persistKey` prop 바로 다음 줄 — 기존 다른 prop 순서는 건드리지 않는다.)

- [ ] **Step 4: 검증 + 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/map/exhibition-map.tsx src/components/map/map-view.tsx
git add src/components/map/exhibition-map.tsx src/components/map/map-view.tsx
git commit -m "feat(analytics): 지도 컨트롤 클릭 계측"
```

---

### Task 4: 피드 CTA 계측

**Files:**
- Modify: `src/components/feed/interest-feed.tsx`

**Interfaces:**
- Consumes: Task 1의 `POST /api/analytics/events`. `InterestFeed`는 이미 `slug: string`
  prop을 갖고 있다(변경 없음, 그대로 씀).

- [ ] **Step 1: 계측 헬퍼 추가**

`src/components/feed/interest-feed.tsx`에서 기존 `fire(boothId)` 함수(≈172번째 줄)
근처에 헬퍼 추가:

```ts
  function trackClick(control: string) {
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ui_click",
        exhibitionSlug: slug,
        meta: { control },
      }),
    });
  }
```

- [ ] **Step 2: 소진 상태 CTA 2곳 + 하단 "새로 고르기" 버튼에 연결**

같은 파일, 소진 상태 블록(≈147-158번째 줄):

```tsx
                <a
                  href="#finish-visit-button"
                  onClick={() => trackClick("feed_exhausted_finish")}
                  className="inline-flex min-h-11 items-center rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground active:opacity-80"
                >
                  {t("feed.exhaustedFinishCta")}
                </a>
                <Link
                  href={`/exhibitions/${slug}/map`}
                  onClick={() => trackClick("feed_exhausted_map")}
                  className="inline-flex min-h-11 items-center rounded-xl border border-border px-4 text-sm font-semibold active:bg-accent/40"
                >
                  {t("feed.exhaustedMapCta")}
                </Link>
```

목록 끝 "새로 고르기" 버튼(≈372-383번째 줄) — 기존 `onClick={repick}`을 감싼다:

```tsx
        <button
          type="button"
          onClick={() => {
            trackClick("feed_repick");
            repick();
          }}
          disabled={repicking}
          className="flex min-h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border text-sm font-semibold text-muted-foreground active:bg-accent/40 disabled:opacity-60"
        >
```

(버튼 내부 아이콘·텍스트 JSX는 그대로 둔다 — `onClick`만 교체.)

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/feed/interest-feed.tsx
git add src/components/feed/interest-feed.tsx
git commit -m "feat(analytics): 피드 CTA 클릭 계측"
```

---

### Task 5: 컴패니언 바 + 관람 마치기 버튼 계측

**Files:**
- Modify: `src/components/companion/companion-bar.tsx`
- Modify: `src/components/companion/finish-visit.tsx`

**Interfaces:**
- Consumes: Task 1의 `POST /api/analytics/events`. `FinishVisit`은 이미 `slug: string`
  prop을 갖고 있다.

- [ ] **Step 1: `CompanionBar`에 exhibitionSlug 파생 + 계측 헬퍼**

`src/components/companion/companion-bar.tsx`, `CompanionBar` 함수 본문 상단
(`const isExhibitionHome = ...` 줄, ≈47번째 줄) 바로 아래에 추가:

```ts
  const exhibitionSlug = pathname.match(/\/exhibitions\/([^/]+)/)?.[1];

  function trackClick(control: string) {
    if (!exhibitionSlug) return;
    void fetch("/api/analytics/events", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        type: "ui_click",
        exhibitionSlug,
        meta: { control },
      }),
    });
  }
```

- [ ] **Step 2: 필 버튼(대화 시트 열기)에 연결**

같은 파일, 하단 필 버튼(≈65-68번째 줄, `onClick={() => setOpen(true)}`):

```tsx
        <button
          type="button"
          onClick={() => {
            trackClick("companion_bar_open");
            setOpen(true);
          }}
          className="pointer-events-auto flex max-w-full items-center gap-2 rounded-full border border-border bg-background/90 py-2 pl-2 pr-4 shadow-[var(--shadow-card)] backdrop-blur-xl active:scale-[0.98]"
        >
```

`<CompanionChat t={t} />` 호출(≈96번째 줄)을 `trackClick`도 넘기도록 수정:

```tsx
          <CompanionChat t={t} onAsk={trackClick} />
```

- [ ] **Step 3: `CompanionChat`이 FAQ 클릭을 계측**

같은 파일, `CompanionChat` 함수(≈104번째 줄):

```tsx
function CompanionChat({
  t,
  onAsk,
}: {
  t: TFn;
  onAsk: (control: string) => void;
}) {
  const [log, setLog] = useState<{ role: "you" | "roam"; text: string }[]>([]);
  const prompts = [
    { q: t("companion.q1"), a: t("companion.a1"), control: "companion_faq_q1" },
    { q: t("companion.q2"), a: t("companion.a2"), control: "companion_faq_q2" },
    { q: t("companion.q3"), a: t("companion.a3"), control: "companion_faq_q3" },
  ];

  function ask(q: { q: string; a: string; control: string }) {
    onAsk(q.control);
    setLog((prev) => [
      ...prev,
      { role: "you", text: q.q },
      { role: "roam", text: q.a },
    ]);
  }
```

(`prompts.map`의 `key={p.q}`·버튼 JSX는 그대로 — `p`가 이제 `control`도 갖고 있을 뿐
렌더링 로직은 변경 없음.)

- [ ] **Step 4: `finish_visit_start` 계측**

`src/components/companion/finish-visit.tsx`의 메인 버튼(≈102-111번째 줄,
`id="finish-visit-button"`, `onClick={openRetro}`):

```tsx
      <button
        id="finish-visit-button"
        type="button"
        onClick={() => {
          void fetch("/api/analytics/events", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              type: "ui_click",
              exhibitionSlug: slug,
              meta: { control: "finish_visit_start" },
            }),
          });
          openRetro();
        }}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-muted-foreground active:opacity-70 disabled:opacity-50"
      >
```

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/companion/companion-bar.tsx src/components/companion/finish-visit.tsx
git add src/components/companion/companion-bar.tsx src/components/companion/finish-visit.tsx
git commit -m "feat(analytics): 컴패니언 바·관람 마치기 버튼 클릭 계측"
```

---

### Task 6: admin 분석 페이지에 "버튼 인기도" 패널 추가

**Files:**
- Create: `src/components/charts/ui-click-chart.tsx`
- Modify: `src/app/admin/analytics/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `uiClickBreakdown(events): UiClickCount[]`,
  `repo._allAnalytics(exhibitionId): Promise<AnalyticsEvent[]>`(기존 메서드, 이미
  mock·supabase 둘 다 구현됨).

- [ ] **Step 1: 차트 컴포넌트**

`src/components/charts/ui-click-chart.tsx` (`onboarding-value-chart.tsx`와 동일한
톤·팔레트):

```tsx
"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { UiClickCount } from "@/lib/admin/ui-click-breakdown";

const COLORS = ["#4f46e5", "#6366f1", "#818cf8", "#8b5cf6", "#15c47e", "#ffb020"];

const LABEL_BY_CONTROL: Record<string, string> = {
  map_zoom_in: "지도 확대",
  map_zoom_out: "지도 축소",
  map_reset_view: "지도 전체 보기",
  map_rotate: "지도 회전",
  feed_exhausted_finish: "피드 소진 · 마치기",
  feed_exhausted_map: "피드 소진 · 지도로",
  feed_repick: "피드 새로 고르기",
  companion_bar_open: "컴패니언 바 열기",
  companion_faq_q1: "컴패니언 FAQ 1",
  companion_faq_q2: "컴패니언 FAQ 2",
  companion_faq_q3: "컴패니언 FAQ 3",
  finish_visit_start: "관람 마치기 시작",
};

export function UiClickChart({ data }: { data: UiClickCount[] }) {
  if (data.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        아직 집계된 클릭이 없습니다.
      </p>
    );
  }
  const rows = data
    .slice(0, 12)
    .map((d) => ({ ...d, label: LABEL_BY_CONTROL[d.control] ?? d.control }));
  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart
          data={rows}
          layout="vertical"
          margin={{ left: 8, right: 16, top: 4, bottom: 4 }}
        >
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="label"
            width={112}
            tick={{ fontSize: 12, fill: "var(--muted-foreground)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "var(--secondary)" }}
            contentStyle={{
              borderRadius: 12,
              border: "1px solid var(--border)",
              background: "var(--card)",
              fontSize: 13,
            }}
            formatter={(value) => `${value}회`}
          />
          <Bar dataKey="count" radius={[0, 8, 8, 0]} barSize={16}>
            {rows.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

- [ ] **Step 2: admin 분석 페이지 와이어링**

`src/app/admin/analytics/page.tsx` — import 추가:

```ts
import { UiClickChart } from "@/components/charts/ui-click-chart";
import { uiClickBreakdown } from "@/lib/admin/ui-click-breakdown";
```

기존 `const [points, popular, edges, funnel, booths, signals] = await Promise.all([...])`
블록(26-33번째 줄)에 `repo._allAnalytics!(exhibition.id)` 항목을 추가:

```ts
  const [points, popular, edges, funnel, booths, signals, analyticsEvents] =
    await Promise.all([
      repo.analyticsHeatmap(exhibition.id),
      repo.analyticsPopular(exhibition.id, 8),
      repo.analyticsFlow(exhibition.id),
      repo.analyticsConversion(exhibition.id),
      repo.listBoothsByExhibitionId(exhibition.id),
      repo.listExhibitionSignals(exhibition.id),
      repo._allAnalytics!(exhibition.id),
    ]);
```

그 아래 `const onboardingValues = onboardingValueBreakdown(signals);` 줄 다음에 추가:

```ts
  const uiClicks = uiClickBreakdown(analyticsEvents);
```

기존 온보딩 가치 패널(≈74-79번째 줄, `<AdminSection title="온보딩에서 고른 가치">`)
바로 아래에 새 패널 추가:

```tsx
      <AdminSection
        title="버튼 인기도"
        description="지도 컨트롤·피드 CTA·컴패니언 바 등 전체 클릭 집계"
      >
        <UiClickChart data={uiClicks} />
      </AdminSection>
```

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/charts/ui-click-chart.tsx src/app/admin/analytics/page.tsx
git add src/components/charts/ui-click-chart.tsx src/app/admin/analytics/page.tsx
git commit -m "feat(admin): 버튼 인기도 패널 추가"
```

---

## 최종 확인 (전체 태스크 완료 후)

- [ ] mock 미리보기로 `/admin/analytics` 접속해 "버튼 인기도" 패널이 빈 상태 문구를
      정상 표시하는지 확인(집계 이벤트가 아직 없으므로).
- [ ] 지도에서 줌/회전/전체보기 버튼을 눌러보고 네트워크 탭에
      `POST /api/analytics/events`가 202로 나가는지 확인, `/admin/analytics` 새로고침 시
      막대그래프에 반영되는지 확인.
