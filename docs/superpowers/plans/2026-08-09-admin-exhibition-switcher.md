# Admin 전시 선택기 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/booths`·`/admin/events`·`/admin/analytics`·`/admin/timeline`이 전부
"지금 관리해야 할 전시" 하나만 자동으로 보여주고 바꿀 방법이 없던 것을, 운영자가 직접
다른 전시로 전환해서 볼 수 있게 한다.

**Architecture:** admin 레이아웃에 전시 선택 드롭다운(`ExhibitionSwitcher`)을 두고
선택값을 쿠키(`admin_exhibition_id`)에 저장한다. 전시 스코프 페이지 4곳은 쿠키값이
있으면 그 전시를, 없거나 무효하면 기존 `pickAdminExhibition` 자동 선택으로 폴백하는
새 순수 함수 `resolveAdminExhibition`을 통해 "지금 볼 전시"를 정한다.

**Tech Stack:** Next.js 16 App Router(Route Handlers, `cookies()` from
`next/headers`), React 19, Zod, 기존 `Select`(Radix) 컴포넌트.

## Global Constraints

- 서버 액션 안 씀 — 전부 API 라우트(Zod 검증, `{ data } | { error }` envelope,
  `src/lib/api/http.ts`의 `ok`/`fail`/`noContent`/`parseBody`).
- 새 API 라우트는 `requireAdmin()` 게이트 필수.
- `pickAdminExhibition`(`src/lib/exhibition/current.ts`)은 수정하지 않고
  `resolveAdminExhibition`이 내부에서 폴백으로 재사용한다 — 기존 동작(쿠키 없을 때)
  100% 보존.
- `/admin/accounts`·`/admin/design-system`은 전시 스코프가 아니므로 안 건드린다.
- 새 UI 프리미티브 안 만듦 — 기존 `Select`(`src/components/ui/select.tsx`) 사용.
- 쿠키는 `httpOnly: true, sameSite: "lax", path: "/"` (기존 `ADMIN_COOKIE` 패턴과
  동일).
- **라이브 dev 서버 검증은 mock 모드로만, 반드시 이 작업의 워크트리 안에서** — 실제
  Supabase 자격증명을 로드하는 checkout에서 검증 서버를 띄우지 않는다(과거 세션에서
  실제 계정이 삭제된 사고가 있었다). 검증 지시를 받는 구현자·리뷰어는 `NEXT_PUBLIC_
  SUPABASE_URL=` 등을 명시적으로 비운 채(`npx next dev`) 실행해야 한다.

---

## Task 1: `resolveAdminExhibition` 순수 함수

**Files:**
- Modify: `src/lib/exhibition/current.ts`
- Test: `src/lib/exhibition/current.test.ts`

**Interfaces:**
- Produces: `resolveAdminExhibition(exhibitions: Exhibition[], cookieExhibitionId: string | undefined, today: string): Exhibition | undefined`
  — Task 4가 이 시그니처로 소비한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/exhibition/current.test.ts` 맨 아래(`todayISO` describe 블록 뒤)에 추가:

```ts
import { resolveAdminExhibition } from "./current";

describe("resolveAdminExhibition", () => {
  it("쿠키의 전시 id가 목록에 있으면 그 전시를 고른다", () => {
    // sif가 자동 선택 대상이 아닌 날짜(2026-09-01, house_archive가 자동 선택됨)에도
    // 쿠키가 sibf를 가리키면 sibf를 고른다.
    expect(
      resolveAdminExhibition(all, "exh_sibf_2026", "2026-09-01")?.id,
    ).toBe("exh_sibf_2026");
  });

  it("쿠키가 없으면 pickAdminExhibition과 동일하게 자동 선택한다", () => {
    expect(resolveAdminExhibition(all, undefined, "2026-07-31")?.id).toBe(
      pickAdminExhibition(all, "2026-07-31")?.id,
    );
  });

  it("쿠키의 전시 id가 목록에 없으면(삭제됨) 자동 선택으로 폴백한다", () => {
    expect(
      resolveAdminExhibition(all, "exh_deleted", "2026-07-31")?.id,
    ).toBe(pickAdminExhibition(all, "2026-07-31")?.id);
  });

  it("목록이 비면 undefined", () => {
    expect(resolveAdminExhibition([], "exh_sibf_2026", "2026-07-31")).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행해서 실패 확인**

Run: `npx vitest run src/lib/exhibition/current.test.ts`
Expected: FAIL — `resolveAdminExhibition` is not exported from `./current`

- [ ] **Step 3: 최소 구현**

`src/lib/exhibition/current.ts`의 `pickAdminExhibition` 함수 뒤(38번째 줄,
`todayISO` 함수 앞)에 추가:

```ts
/**
 * 운영자가 admin 전시 선택기로 명시 선택한 전시(쿠키)가 있으면 그걸, 없거나
 * 무효(삭제된 전시 id 등)하면 pickAdminExhibition 자동 선택으로 폴백한다.
 */
export function resolveAdminExhibition(
  exhibitions: Exhibition[],
  cookieExhibitionId: string | undefined,
  today: string,
): Exhibition | undefined {
  if (cookieExhibitionId) {
    const found = exhibitions.find((e) => e.id === cookieExhibitionId);
    if (found) return found;
  }
  return pickAdminExhibition(exhibitions, today);
}
```

- [ ] **Step 4: 테스트 실행해서 통과 확인**

Run: `npx vitest run src/lib/exhibition/current.test.ts`
Expected: PASS (11 tests: 기존 7 + 신규 4)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/exhibition/current.ts src/lib/exhibition/current.test.ts
git commit -m "feat(admin): resolveAdminExhibition — 쿠키 선택 전시, 없으면 자동 선택 폴백"
```

---

## Task 2: 쿠키 쓰기 API 라우트

**Files:**
- Create: `src/app/api/admin/exhibition-selection/route.ts`

**Interfaces:**
- Consumes: `requireAdmin()`, `parseBody()`, `noContent()`, `fail()` from
  `@/lib/api/http`(기존, 시그니처 그대로).
- Produces: `POST /api/admin/exhibition-selection` — body
  `{ exhibitionId: string }`, 성공 시 204 + `Set-Cookie: admin_exhibition_id=...`,
  `requireAdmin()` 실패 시 401. Task 3의 `ExhibitionSwitcher`가 이 엔드포인트를
  호출한다.

- [ ] **Step 1: 라우트 작성**

`src/app/api/admin/exhibition-selection/route.ts` 전체 내용:

```ts
import { z } from "zod";
import { cookies } from "next/headers";
import { noContent, parseBody, requireAdmin } from "@/lib/api/http";

const bodySchema = z.object({ exhibitionId: z.string().min(1) });

/**
 * 운영자가 admin 전시 선택기로 고른 전시를 쿠키에 저장한다. 존재하지 않는
 * exhibitionId를 형식만 통과해 저장해도 안전 — 각 소비처의 resolveAdminExhibition이
 * 목록에 없으면 자동 선택으로 폴백한다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;

  const store = await cookies();
  store.set("admin_exhibition_id", parsed.data.exhibitionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return noContent();
}
```

- [ ] **Step 2: 타입체크로 확인(이 파일은 단순 라우트라 유닛테스트 없이 tsc로 확인)**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/admin/exhibition-selection/route.ts
git commit -m "feat(admin): POST /api/admin/exhibition-selection — 전시 선택 쿠키 저장"
```

---

## Task 3: `ExhibitionSwitcher` 컴포넌트 + 레이아웃 배치

**Files:**
- Create: `src/components/admin/exhibition-switcher.tsx`
- Modify: `src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `POST /api/admin/exhibition-selection`(Task 2), `Exhibition` 타입
  (`@/lib/types`), 기존 `Select`/`SelectTrigger`/`SelectValue`/`SelectContent`/
  `SelectItem`(`@/components/ui/select`), `api.post`(`@/lib/api/client`).
- Produces: `<ExhibitionSwitcher exhibitions={Exhibition[]} selectedId={string | undefined} />`
  — admin 레이아웃 전용, 다른 태스크가 소비하지 않음.

- [ ] **Step 1: 컴포넌트 작성**

`src/components/admin/exhibition-switcher.tsx` 전체 내용:

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/api/client";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Exhibition } from "@/lib/types";

export function ExhibitionSwitcher({
  exhibitions,
  selectedId,
}: {
  exhibitions: Exhibition[];
  selectedId: string | undefined;
}) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  if (exhibitions.length === 0) return null;

  const sorted = [...exhibitions].sort((a, b) =>
    b.startDate.localeCompare(a.startDate),
  );

  async function onChange(exhibitionId: string) {
    setPending(true);
    try {
      await api.post("/api/admin/exhibition-selection", { exhibitionId });
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <Select value={selectedId} onValueChange={onChange} disabled={pending}>
      <SelectTrigger className="w-full max-w-xs">
        <SelectValue placeholder="전시 선택" />
      </SelectTrigger>
      <SelectContent>
        {sorted.map((e) => (
          <SelectItem key={e.id} value={e.id}>
            {e.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
```

- [ ] **Step 2: 레이아웃에 배치**

`src/app/admin/layout.tsx` 전체를 아래로 교체(기존 내용 + 전시 목록 조회 +
스위처 삽입):

```tsx
import { cookies } from "next/headers";
import { AdminSidebar, AdminTopNav } from "@/components/admin/admin-nav";
import { AdminUnlock } from "@/components/admin/admin-unlock";
import { ExhibitionSwitcher } from "@/components/admin/exhibition-switcher";
import { isAdminAuthed } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Organizer gate: when ORGANIZER_CODE is set, require the code (cookie) first.
  if (!(await isAdminAuthed())) return <AdminUnlock />;

  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const selectedId = (await cookies()).get("admin_exhibition_id")?.value;

  return (
    <div className="flex min-h-dvh">
      <AdminSidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <AdminTopNav />
        <main
          id="main"
          className="mx-auto w-full max-w-5xl flex-1 px-[var(--spacing-global-gutter)] py-6 md:px-8"
        >
          <div className="mb-5">
            <ExhibitionSwitcher exhibitions={exhibitions} selectedId={selectedId} />
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 타입체크로 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 4: 커밋**

```bash
git add src/components/admin/exhibition-switcher.tsx src/app/admin/layout.tsx
git commit -m "feat(admin): ExhibitionSwitcher — admin 레이아웃에 전시 선택 드롭다운 배치"
```

---

## Task 4: 소비처 4곳을 `resolveAdminExhibition` + 쿠키로 교체

**Files:**
- Modify: `src/app/admin/booths/page.tsx`
- Modify: `src/app/admin/events/page.tsx`
- Modify: `src/app/admin/analytics/page.tsx`
- Modify: `src/app/api/admin/timeline/route.ts`

**Interfaces:**
- Consumes: `resolveAdminExhibition`(Task 1), `admin_exhibition_id` 쿠키 이름
  (Task 2에서 이미 이 이름으로 쓰기 시작함 — 여기선 같은 이름으로 읽기만 한다).

- [ ] **Step 1: `src/app/admin/booths/page.tsx` 수정**

전체를 아래로 교체:

```tsx
import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { BoothManager } from "@/components/admin/booth-manager";

export const metadata = { title: "부스 관리" };

export default async function AdminBoothsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const cookieId = (await cookies()).get("admin_exhibition_id")?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());
  if (!exhibition) return <p className="text-muted-foreground">전시가 없습니다.</p>;

  const detail = await repo.getExhibition(exhibition.slug);
  const booths = await repo.listBoothsByExhibitionId(exhibition.id);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">부스 관리</h1>
        <p className="text-sm text-muted-foreground">{exhibition.name}</p>
      </header>
      <BoothManager
        exhibitionId={exhibition.id}
        booths={booths}
        categories={detail?.categories ?? []}
        halls={detail?.halls ?? []}
      />
    </div>
  );
}
```

- [ ] **Step 2: `src/app/admin/events/page.tsx` 수정**

전체를 아래로 교체:

```tsx
import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { EventManager } from "@/components/admin/event-manager";

export const metadata = { title: "이벤트 관리" };

export default async function AdminEventsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const cookieId = (await cookies()).get("admin_exhibition_id")?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());
  if (!exhibition) return <p className="text-muted-foreground">전시가 없습니다.</p>;

  const booths = await repo.listBoothsByExhibitionId(exhibition.id);
  const events = await repo.listEvents(exhibition.slug);

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">이벤트 관리</h1>
        <p className="text-sm text-muted-foreground">{exhibition.name}</p>
      </header>
      <EventManager events={events} booths={booths} />
    </div>
  );
}
```

- [ ] **Step 3: `src/app/admin/analytics/page.tsx` 수정**

전체를 아래로 교체(바뀌는 건 상단 import와 exhibition 계산부뿐, `Promise.all`
이하는 기존과 동일):

```tsx
import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { AdminSection } from "@/components/admin/section";
import { PopularChart } from "@/components/charts/popular-chart";
import { ConversionFunnel } from "@/components/charts/conversion-funnel";
import { FlowList } from "@/components/charts/flow-list";
import { Heatmap } from "@/components/charts/heatmap";

export const metadata = { title: "분석" };

export default async function AnalyticsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const cookieId = (await cookies()).get("admin_exhibition_id")?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());

  if (!exhibition) {
    return <p className="text-muted-foreground">전시가 없습니다.</p>;
  }

  const [points, popular, edges, funnel, booths] = await Promise.all([
    repo.analyticsHeatmap(exhibition.id),
    repo.analyticsPopular(exhibition.id, 8),
    repo.analyticsFlow(exhibition.id),
    repo.analyticsConversion(exhibition.id),
    repo.listBoothsByExhibitionId(exhibition.id),
  ]);
  const names = Object.fromEntries(booths.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">분석</h1>
        <p className="text-sm text-muted-foreground">{exhibition.name}</p>
      </header>

      <AdminSection title="방문 밀집도 히트맵" description="부스별 방문·체류 밀집도">
        <Heatmap width={exhibition.mapWidth} height={exhibition.mapHeight} points={points} />
      </AdminSection>

      <AdminSection title="인기 부스" description="조회수 기준 상위 부스">
        <PopularChart data={popular} />
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection title="방문 흐름" description="부스 간 이동이 많은 경로">
          <FlowList edges={edges} names={names} />
        </AdminSection>
        <AdminSection title="전환율" description="세션 → 온보딩 → 경로 → 완료">
          <ConversionFunnel funnel={funnel} />
        </AdminSection>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: `src/app/api/admin/timeline/route.ts` 수정**

전체를 아래로 교체(기존 `pickAdminExhibition` import·호출을
`resolveAdminExhibition` + 쿠키 읽기로 교체, 나머지는 그대로):

```ts
import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ok, requireAdmin } from "@/lib/api/http";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const cookieId = (await cookies()).get("admin_exhibition_id")?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());
  if (!exhibition) {
    return ok({ exhibition: null, signals: [], analytics: [], booths: [], nicknames: {} });
  }
  const [signals, analytics, booths, users] = await Promise.all([
    repo.listExhibitionSignals(exhibition.id),
    repo._allAnalytics?.(exhibition.id) ?? Promise.resolve([]),
    repo.listBoothsByExhibitionId(exhibition.id),
    repo.listUsers(),
  ]);
  const nicknames = Object.fromEntries(users.map((u) => [u.id, u.nickname]));
  return ok({ exhibition, signals, analytics, booths, nicknames });
}
```

- [ ] **Step 5: 회귀 확인**

Run: `npx tsc --noEmit && npx vitest run`
Expected: tsc 에러 없음, 전체 vitest 그린(신규 테스트 포함, Task 1의 4개 추가로
총 기존 239 + 4 = 243 통과 — 정확한 총합은 이 태스크 시점 실제 스위트 크기에
따라 달라질 수 있으니 "실패 0"만 확인)

- [ ] **Step 6: 커밋**

```bash
git add src/app/admin/booths/page.tsx src/app/admin/events/page.tsx src/app/admin/analytics/page.tsx src/app/api/admin/timeline/route.ts
git commit -m "feat(admin): 부스·이벤트·분석·타임라인이 전시 선택기 쿠키를 따르도록 교체"
```
