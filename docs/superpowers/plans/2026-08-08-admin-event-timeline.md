# 관리자 이벤트 타임라인 + 계정 관리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 원시 이벤트(반응+조회)를 시간순으로 보는 `/admin/timeline`과, 계정 조회+삭제
+드릴다운(그 사람의 반응·북마크)을 보는 `/admin/accounts`(+`/admin/accounts/[id]`)를
만든다.

**Architecture:** `Repository` 인터페이스에 새 메서드 3개(`listExhibitionSignals`/
`listUsers`/`deleteUser`)를 추가하고 `MockRepository`·`SupabaseRepository` 양쪽에
구현한다. 새 API 라우트 3개(`isAdminAuthed()` 게이트 포함)를 추가하고, 순수 함수로
분리한 타임라인 병합 로직(`src/lib/admin/timeline.ts`) 위에 UI를 얹는다.

**Tech Stack:** Next.js App Router, 기존 `Repository` 패턴, 기존 `AdminSection`/
`Card`/`EmptyState`/`AlertDialog`/`Chip`.

## Global Constraints

- 새로 만드는 API 라우트 3개는 전부 `requireAdmin()`(`src/lib/api/http.ts`, 이미
  존재) 체크 필수.
- 커뮤니티 포스트 관리는 이번 스코프에서 제외(`CommunityPost`가 `sessionId`만 갖고
  `userId`가 없어 계정에 못 붙음).
- 북마크는 전체 목록 화면 없음 — 계정 드릴다운 안에서만(기존 `listBookmarks`/
  `removeBookmark` 재사용, 신규 메서드 없음).
- `/admin/timeline`은 `pickAdminExhibition`으로 전시 자동 선택(선택 UI 없음).
- `AnalyticsEvent`는 `sessionId`(익명) 기반이라 계정 드릴다운엔 안 보임 — 전시 전체
  타임라인에서만 보임.
- 새로고침 버튼 기반 — 실시간 갱신 없음.
- 조회+삭제만, 수정 없음.
- 새 UI 컴포넌트 안 만듦 — `AlertDialog`(삭제 확인)·`Chip`(필터) 재사용.
- Roam은 라이트 모드만 지원 — 다크모드 검증 불필요.

---

### Task 1: Repository — 신규 메서드(interface + mock + supabase)

**Files:**
- Modify: `src/lib/repositories/types.ts`
- Modify: `src/lib/mock/repository.ts`
- Modify: `src/lib/supabase/repository.ts`
- Test: `src/lib/mock/repository.test.ts`(기존 파일에 추가)

**Interfaces:**
- Produces: `listExhibitionSignals(exhibitionId: string, opts?: { limit?: number }): Promise<UserSignal[]>`, `listUsers(opts?: { limit?: number; offset?: number }): Promise<User[]>`, `deleteUser(id: string): Promise<boolean>` — `Repository` 인터페이스에 추가, 이후 태스크가 `getRepository()`로 가져온 인스턴스에서 그대로 호출.

- [ ] **Step 1: `Repository` 인터페이스에 시그니처 추가**

`src/lib/repositories/types.ts`, `listUserSignals` 정의(143~146행) 바로 다음에 추가:

```ts
  /** 전시 전체 사용자 신호 조회(관리자 타임라인용) — userId로 안 좁힘. */
  listExhibitionSignals(
    exhibitionId: string,
    opts?: { limit?: number },
  ): Promise<UserSignal[]>;
```

`createUser` 정의(153행) 바로 다음에 추가:

```ts
  /** 계정 목록(관리자용, 최신 가입순). */
  listUsers(opts?: { limit?: number; offset?: number }): Promise<User[]>;
  /** 계정 삭제(관리자용). 존재 안 하면 false. */
  deleteUser(id: string): Promise<boolean>;
```

- [ ] **Step 2: `MockRepository`에 구현**

`src/lib/mock/repository.ts`, `listUserSignals` 메서드(874~885행) 바로 다음에 추가:

```ts
  async listExhibitionSignals(
    exhibitionId: string,
    opts?: { limit?: number },
  ): Promise<UserSignal[]> {
    const rows = store()
      .userSignals.filter((s) => s.exhibitionId === exhibitionId)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return opts?.limit ? rows.slice(0, opts.limit) : rows;
  }
```

`createUser` 메서드(645~649행) 바로 다음에 추가:

```ts
  async listUsers(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<User[]> {
    const rows = [...store().users].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    );
    const offset = opts?.offset ?? 0;
    const sliced = rows.slice(offset);
    return opts?.limit ? sliced.slice(0, opts.limit) : sliced;
  }

  async deleteUser(id: string): Promise<boolean> {
    const s = store();
    const i = s.users.findIndex((u) => u.id === id);
    if (i < 0) return false;
    s.users.splice(i, 1);
    return true;
  }
```

- [ ] **Step 3: `SupabaseRepository`에 구현**

`src/lib/supabase/repository.ts`, `listUserSignals` 메서드(1612~1637행) 바로 다음에
추가:

```ts
  async listExhibitionSignals(
    exhibitionId: string,
    opts?: { limit?: number },
  ): Promise<UserSignal[]> {
    const db = await this.db();
    let q = db
      .from("user_signal_log")
      .select("*")
      .eq("exhibition_id", exhibitionId)
      .order("created_at", { ascending: false });
    if (opts?.limit) q = q.limit(opts.limit);
    const { data } = await q;
    return (data ?? []).map((row) => {
      const r = row as Row;
      return {
        id: String(r.id),
        userId: String(r.user_id),
        exhibitionId: String(r.exhibition_id),
        kind: String(r.kind) as SignalKind,
        boothCode: r.booth_code == null ? undefined : String(r.booth_code),
        slugs: strArr(r.slugs),
        createdAt: String(r.created_at),
      };
    });
  }
```

`createUser` 메서드(1118~1123행) 바로 다음에 추가:

```ts
  async listUsers(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<User[]> {
    const db = await this.db();
    let q = db
      .from("app_user")
      .select("*")
      .order("created_at", { ascending: false });
    if (opts?.limit) {
      const offset = opts.offset ?? 0;
      q = q.range(offset, offset + opts.limit - 1);
    }
    const { data } = await q;
    return (data ?? []).map((row) => mapUser(row as Row));
  }

  async deleteUser(id: string): Promise<boolean> {
    const db = await this.db();
    const { error, count } = await db
      .from("app_user")
      .delete({ count: "exact" })
      .eq("id", id);
    return !error && (count ?? 0) > 0;
  }
```

- [ ] **Step 4: 빌드 확인**

Run: `npx tsc --noEmit`
Expected: 에러 없음(두 구현체 모두 인터페이스를 만족해야 함).

- [ ] **Step 5: `MockRepository`용 유닛 테스트 추가**

`src/lib/mock/repository.test.ts`는 `describe("MockRepository", ...)` 블록 최상단에
공유 `const repo = new MockRepository();`를 이미 두고 매 테스트가 이걸 재사용한다
(스토어는 `beforeEach`가 전역으로 리셋). 새 테스트도 같은 관례를 따라 이 공유 `repo`를
쓴다 — 새 인스턴스를 만들지 않는다. 기존 `listUserSignals`나 `createUser` 관련
테스트 근처에 추가:

```ts
  it("listExhibitionSignals: 전시 단위로 전체 사용자 신호를 최신순 반환한다", async () => {
    await repo.appendUserSignal({
      userId: "u1",
      exhibitionId: "ex1",
      kind: "reaction_interested",
      slugs: [],
    });
    await repo.appendUserSignal({
      userId: "u2",
      exhibitionId: "ex1",
      kind: "reaction_later",
      slugs: [],
    });
    await repo.appendUserSignal({
      userId: "u1",
      exhibitionId: "ex2",
      kind: "reaction_interested",
      slugs: [],
    });
    const rows = await repo.listExhibitionSignals("ex1");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.exhibitionId === "ex1")).toBe(true);
  });

  it("listUsers: 전체를 반환하고 limit을 적용한다", async () => {
    // 주의: createdAt은 밀리초 단위(new Date().toISOString())라 빠르게 연속 생성하면
    // 같은 타임스탬프가 나올 수 있다 — 정렬 순서(어느 게 "가장 최근"인지)는 단언하지
    // 않고, 전체 개수와 limit 동작만 확인한다.
    await repo.createUser("a");
    await repo.createUser("b");
    await repo.createUser("c");
    const all = await repo.listUsers();
    expect(all).toHaveLength(3);
    expect(all.map((u) => u.nickname).sort()).toEqual(["a", "b", "c"]);
    const limited = await repo.listUsers({ limit: 2 });
    expect(limited).toHaveLength(2);
  });

  it("deleteUser: 존재하는 계정을 지우고 true를 반환, 없으면 false", async () => {
    const u = await repo.createUser("temp");
    expect(await repo.deleteUser(u.id)).toBe(true);
    expect(await repo.getUser(u.id)).toBeNull();
    expect(await repo.deleteUser("no-such-id")).toBe(false);
  });
```

- [ ] **Step 6: 테스트 실행**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: 새 테스트 3개 포함 전체 통과.

- [ ] **Step 7: 커밋**

```bash
git add src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/supabase/repository.ts src/lib/mock/repository.test.ts
git commit -m "feat(repo): 전시 단위 신호 조회·계정 목록·계정 삭제 메서드 추가"
```

---

### Task 2: API 라우트

**Files:**
- Create: `src/app/api/admin/timeline/route.ts`
- Create: `src/app/api/admin/users/route.ts`
- Create: `src/app/api/admin/users/[id]/route.ts`
- Create: `src/app/api/admin/users/[id]/bookmarks/route.ts`

**Interfaces:**
- Consumes: Task 1의 `listExhibitionSignals`/`_allAnalytics`(기존)/`listUsers`/
  `deleteUser`/`getUser`(기존)/`listBookmarks`(기존)/`removeBookmark`(기존)/
  `listExhibitions`(기존)/`listBoothsByExhibitionId`(기존)/`pickAdminExhibition`+
  `todayISO`(기존, `src/lib/exhibition/current.ts`).
- Produces: `GET /api/admin/timeline`(쿼리 파라미터 없음 — 서버가 `pickAdminExhibition`으로
  전시를 직접 고름) → `{ exhibition: Exhibition | null, signals: UserSignal[], analytics: AnalyticsEvent[], booths: Booth[] }`. `GET /api/admin/users` → `{ users: User[] }`. `GET /api/admin/users/[id]` → `{ user: User, signals: UserSignal[], bookmarks: Bookmark[] }`. `DELETE /api/admin/users/[id]` → 204. `DELETE /api/admin/users/[id]/bookmarks`(body: `{targetType, targetId}`) → 204.

- [ ] **Step 1: `src/app/api/admin/timeline/route.ts` 신규 작성**

전시 선택은 클라이언트가 아니라 이 라우트 안에서 서버 쪽으로 한다 —
`/admin/analytics/page.tsx`가 서버 컴포넌트에서 `pickAdminExhibition`을 쓰는 것과
같은 관례(선택 UI 없음). 부스 이름 조회(`listBoothsByExhibitionId`)도 같은 요청
안에서 처리해 클라이언트가 별도 API를 안 타게 한다.

```ts
import { getRepository } from "@/lib/repositories";
import { pickAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ok, requireAdmin } from "@/lib/api/http";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const exhibition = pickAdminExhibition(exhibitions, todayISO());
  if (!exhibition) {
    return ok({ exhibition: null, signals: [], analytics: [], booths: [] });
  }
  const [signals, analytics, booths] = await Promise.all([
    repo.listExhibitionSignals(exhibition.id),
    repo._allAnalytics?.(exhibition.id) ?? Promise.resolve([]),
    repo.listBoothsByExhibitionId(exhibition.id),
  ]);
  return ok({ exhibition, signals, analytics, booths });
}
```

- [ ] **Step 2: `src/app/api/admin/users/route.ts` 신규 작성**

```ts
import { getRepository } from "@/lib/repositories";
import { ok, requireAdmin } from "@/lib/api/http";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  const users = await repo.listUsers({ limit: 200 });
  return ok({ users });
}
```

- [ ] **Step 3: `src/app/api/admin/users/[id]/route.ts` 신규 작성**

```ts
import { getRepository } from "@/lib/repositories";
import { noContent, notFound, ok, requireAdmin } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const repo = await getRepository();
  const user = await repo.getUser(id);
  if (!user) return notFound("계정을 찾을 수 없습니다");
  const [signals, bookmarks] = await Promise.all([
    repo.listUserSignals(id),
    repo.listBookmarks(id),
  ]);
  return ok({ user, signals, bookmarks });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const repo = await getRepository();
  const deleted = await repo.deleteUser(id);
  if (!deleted) return notFound("계정을 찾을 수 없습니다");
  return noContent();
}
```

- [ ] **Step 4: `src/app/api/admin/users/[id]/bookmarks/route.ts` 신규 작성**

기존 `/api/bookmarks` DELETE는 `getCurrentUser()`(로그인한 본인)만 지울 수 있어 관리자가
다른 계정의 북마크를 못 지운다 — URL의 `[id]`를 대상 계정으로 쓰는 별도 라우트가 필요.

```ts
import { getRepository } from "@/lib/repositories";
import { noContent, parseBody, requireAdmin } from "@/lib/api/http";
import { bookmarkInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, bookmarkInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  await repo.removeBookmark(id, parsed.data);
  return noContent();
}
```

- [ ] **Step 5: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/app/api/admin/timeline/route.ts src/app/api/admin/users/route.ts "src/app/api/admin/users/[id]/route.ts" "src/app/api/admin/users/[id]/bookmarks/route.ts"`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과.

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/admin/timeline src/app/api/admin/users
git commit -m "feat(api): 관리자 타임라인·계정 목록/상세/삭제·북마크 삭제 라우트 추가(requireAdmin 게이트)"
```

---

### Task 3: `/admin/timeline` 페이지

**Files:**
- Create: `src/lib/admin/timeline.ts`
- Create: `src/lib/admin/timeline.test.ts`
- Create: `src/components/admin/timeline-row.tsx`
- Create: `src/app/admin/timeline/page.tsx`
- Modify: `src/components/admin/admin-nav.tsx`

**Interfaces:**
- Produces: `TimelineEvent { id, createdAt, source: "signal" | "analytics", label, userId?, userLabel, boothLabel? }`, `buildTimeline(signals, analytics, userNicknames, boothNamesByCode, boothNamesById): TimelineEvent[]` — `src/lib/admin/timeline.ts`에서 export. Task 4가 드릴다운에서 `TimelineEvent`/`TimelineRow`를 재사용.

- [ ] **Step 1: `src/lib/admin/timeline.ts` 신규 작성(순수 함수)**

```ts
import type { AnalyticsEvent, UserSignal } from "@/lib/types";

export interface TimelineEvent {
  id: string;
  createdAt: string;
  source: "signal" | "analytics";
  label: string;
  userId?: string;
  userLabel: string;
  boothLabel?: string;
}

const SIGNAL_LABELS: Record<string, string> = {
  booth_visited: "가봄",
  booth_skipped: "별로",
  booth_bookmarked: "북마크",
  route_saved: "동선 저장",
  feed_click: "피드 클릭",
  reaction_interested: "끌림",
  reaction_later: "나중에",
  search_query: "검색",
};

const ANALYTICS_LABELS: Record<string, string> = {
  view: "조회",
  dwell: "체류",
  route_start: "동선 시작",
  route_complete: "동선 완료",
  booth_arrive: "부스 도착",
  event_bookmark: "이벤트 북마크",
};

/**
 * UserSignal·AnalyticsEvent를 하나의 타임라인으로 병합(최신순). AnalyticsEvent는
 * sessionId 기반(익명)이라 userId/userLabel이 항상 "익명 세션"으로 고정된다.
 */
export function buildTimeline(
  signals: UserSignal[],
  analytics: AnalyticsEvent[],
  userNicknames: Map<string, string>,
  boothNamesByCode: Map<string, string>,
  boothNamesById: Map<string, string>,
): TimelineEvent[] {
  const fromSignals: TimelineEvent[] = signals.map((s) => ({
    id: s.id,
    createdAt: s.createdAt,
    source: "signal",
    label: SIGNAL_LABELS[s.kind] ?? s.kind,
    userId: s.userId,
    userLabel: userNicknames.get(s.userId) ?? "알 수 없음",
    boothLabel: s.boothCode
      ? (boothNamesByCode.get(s.boothCode) ?? s.boothCode)
      : undefined,
  }));
  const fromAnalytics: TimelineEvent[] = analytics.map((a) => ({
    id: a.id,
    createdAt: a.createdAt,
    source: "analytics",
    label: ANALYTICS_LABELS[a.type] ?? a.type,
    userLabel: "익명 세션",
    boothLabel: a.boothId
      ? (boothNamesById.get(a.boothId) ?? a.boothId)
      : undefined,
  }));
  return [...fromSignals, ...fromAnalytics].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  );
}
```

- [ ] **Step 2: 실패하는 테스트 먼저 확인 — 아니, 순수 함수라 구현·테스트 동시 작성. `src/lib/admin/timeline.test.ts` 작성**

```ts
import { describe, expect, it } from "vitest";
import { buildTimeline } from "./timeline";

describe("buildTimeline", () => {
  it("signal과 analytics를 최신순으로 병합한다", () => {
    const signals = [
      {
        id: "s1",
        userId: "u1",
        exhibitionId: "ex1",
        kind: "reaction_interested" as const,
        boothCode: "A01",
        slugs: [],
        createdAt: "2026-08-08T10:00:00.000Z",
      },
    ];
    const analytics = [
      {
        id: "a1",
        sessionId: "sess1",
        exhibitionId: "ex1",
        type: "view" as const,
        boothId: "booth-1",
        createdAt: "2026-08-08T11:00:00.000Z",
      },
    ];
    const result = buildTimeline(
      signals,
      analytics,
      new Map([["u1", "닉네임1"]]),
      new Map([["A01", "부스A"]]),
      new Map([["booth-1", "부스B"]]),
    );
    expect(result).toHaveLength(2);
    expect(result[0].id).toBe("a1"); // 더 최신
    expect(result[0].userLabel).toBe("익명 세션");
    expect(result[0].boothLabel).toBe("부스B");
    expect(result[1].id).toBe("s1");
    expect(result[1].label).toBe("끌림");
    expect(result[1].userLabel).toBe("닉네임1");
    expect(result[1].boothLabel).toBe("부스A");
  });

  it("알 수 없는 kind/type은 원래 값을 그대로 라벨로 쓴다", () => {
    const result = buildTimeline(
      [
        {
          id: "s1",
          userId: "u1",
          exhibitionId: "ex1",
          // @ts-expect-error -- 미래에 추가될 수 있는 미지원 kind를 방어하는지 확인
          kind: "unknown_kind",
          slugs: [],
          createdAt: "2026-08-08T10:00:00.000Z",
        },
      ],
      [],
      new Map(),
      new Map(),
      new Map(),
    );
    expect(result[0].label).toBe("unknown_kind");
  });
});
```

- [ ] **Step 3: 테스트 실행**

Run: `npx vitest run src/lib/admin/timeline.test.ts`
Expected: 2개 테스트 통과.

- [ ] **Step 4: `src/components/admin/timeline-row.tsx` 신규 작성**

```tsx
import Link from "next/link";
import { format } from "date-fns";
import type { TimelineEvent } from "@/lib/admin/timeline";
import { Chip } from "@/components/ui/chip";

export function TimelineRow({ event }: { event: TimelineEvent }) {
  return (
    <div className="flex items-center gap-3 border-b border-border py-2.5 text-sm last:border-0">
      <span className="w-16 shrink-0 text-xs text-muted-foreground">
        {format(new Date(event.createdAt), "M.d HH:mm")}
      </span>
      <Chip variant="outline" size="sm" className="shrink-0">
        {event.label}
      </Chip>
      <span className="min-w-0 flex-1 truncate">
        {event.userId ? (
          <Link
            href={`/admin/accounts/${event.userId}`}
            className="font-semibold text-primary hover:underline"
          >
            {event.userLabel}
          </Link>
        ) : (
          <span className="text-muted-foreground">{event.userLabel}</span>
        )}
        {event.boothLabel && (
          <span className="text-muted-foreground"> · {event.boothLabel}</span>
        )}
      </span>
    </div>
  );
}
```

- [ ] **Step 5: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/components/admin/timeline-row.tsx`
Expected: 에러 없음.

- [ ] **Step 6: `src/app/admin/timeline/page.tsx` 신규 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import { RefreshCw } from "lucide-react";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { EmptyState } from "@/components/common/states";
import { TimelineRow } from "@/components/admin/timeline-row";
import { buildTimeline, type TimelineEvent } from "@/lib/admin/timeline";
import type { AnalyticsEvent, Booth, Exhibition, User, UserSignal } from "@/lib/types";

export default function AdminTimelinePage() {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [exhibitionId, setExhibitionId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const [{ exhibition, signals, analytics, booths }, { users }] = await Promise.all([
      api.get<{
        exhibition: Exhibition | null;
        signals: UserSignal[];
        analytics: AnalyticsEvent[];
        booths: Booth[];
      }>("/api/admin/timeline"),
      api.get<{ users: User[] }>("/api/admin/users"),
    ]);
    if (!exhibition) {
      setExhibitionId(null);
      setLoading(false);
      return;
    }
    setExhibitionId(exhibition.id);
    const nicknames = new Map(users.map((u) => [u.id, u.nickname]));
    const byCode = new Map(
      booths.filter((b) => b.code).map((b) => [b.code as string, b.name]),
    );
    const byId = new Map(booths.map((b) => [b.id, b.name]));
    setEvents(buildTimeline(signals, analytics, nicknames, byCode, byId));
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  const labels = [...new Set(events.map((e) => e.label))];
  const filtered = events.filter(
    (e) => selected.size === 0 || selected.has(e.label),
  );

  function toggle(label: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }

  return (
    <div className="space-y-6">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">타임라인</h1>
          <p className="text-sm text-muted-foreground">
            부스 반응·페이지 조회 원시 이벤트(최신순)
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()}>
          <RefreshCw className="size-4" /> 새로고침
        </Button>
      </header>

      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {labels.map((label) => (
            <button key={label} type="button" onClick={() => toggle(label)}>
              <Chip variant={selected.has(label) ? "tint" : "outline"} size="sm">
                {label}
              </Chip>
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : !exhibitionId ? (
        <EmptyState title="전시가 없어요" />
      ) : filtered.length === 0 ? (
        <EmptyState title="이벤트가 없어요" />
      ) : (
        <div className="rounded-xl border border-border bg-card px-4">
          {filtered.map((e) => (
            <TimelineRow key={`${e.source}-${e.id}`} event={e} />
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 7: `admin-nav.tsx`에 "타임라인" 항목 추가**

`src/components/admin/admin-nav.tsx`, import에 `History` 추가:

```tsx
import {
  LayoutDashboard,
  Building2,
  Store,
  CalendarClock,
  BarChart3,
  Compass,
  Palette,
  History,
} from "lucide-react";
```

`ITEMS` 배열의 "분석" 다음(디자인 시스템 앞)에 추가:

```tsx
const ITEMS = [
  { href: "/admin", label: "개요", icon: LayoutDashboard, exact: true },
  { href: "/admin/exhibitions", label: "전시", icon: Building2 },
  { href: "/admin/booths", label: "부스", icon: Store },
  { href: "/admin/events", label: "이벤트", icon: CalendarClock },
  { href: "/admin/analytics", label: "분석", icon: BarChart3 },
  { href: "/admin/timeline", label: "타임라인", icon: History },
  { href: "/admin/design-system", label: "디자인 시스템", icon: Palette },
];
```

- [ ] **Step 8: 빌드 + 회귀 확인**

Run: `npx tsc --noEmit && npx eslint src/app/admin/timeline/page.tsx src/components/admin/admin-nav.tsx`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과.

- [ ] **Step 9: 수동 확인 (라이트 모드만)**

`npm run dev`(mock 모드) 후 `/admin/timeline`에서 이벤트 목록이 보이는지, 필터 칩을
누르면 해당 종류만 남는지(다시 누르면 해제), 새로고침 버튼이 동작하는지, 로그인
사용자 신호의 닉네임을 클릭하면 `/admin/accounts/[id]`로 이동하는지(아직 페이지 없어
404 나는 게 정상 — Task 4에서 만듦) 확인.

- [ ] **Step 10: 커밋**

```bash
git add src/lib/admin/timeline.ts src/lib/admin/timeline.test.ts src/components/admin/timeline-row.tsx src/app/admin/timeline/page.tsx src/components/admin/admin-nav.tsx
git commit -m "feat(admin): /admin/timeline 페이지 추가 — 원시 이벤트 타임라인"
```

---

### Task 4: `/admin/accounts` 목록 + 드릴다운

**Files:**
- Create: `src/app/admin/accounts/page.tsx`
- Create: `src/app/admin/accounts/[id]/page.tsx`
- Modify: `src/components/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: Task 2의 API 라우트(`GET /api/admin/users`, `GET/DELETE /api/admin/users/[id]`), Task 3의 `TimelineRow`/`buildTimeline`(`TimelineEvent`), `AlertDialog`(기존, 3단계).

- [ ] **Step 1: `src/app/admin/accounts/page.tsx` 신규 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { format } from "date-fns";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/common/states";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import type { User } from "@/lib/types";

export default function AdminAccountsPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const { users } = await api.get<{ users: User[] }>("/api/admin/users");
    setUsers(users);
    setLoading(false);
  }

  useEffect(() => {
    void load();
  }, []);

  async function remove(u: User) {
    try {
      await api.del(`/api/admin/users/${u.id}`);
      toast.success("삭제했어요");
      setUsers((prev) => prev.filter((x) => x.id !== u.id));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "삭제 실패");
    }
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-extrabold">계정</h1>
        <p className="text-sm text-muted-foreground">{users.length}개 계정</p>
      </header>

      {loading ? (
        <p className="text-sm text-muted-foreground">불러오는 중…</p>
      ) : users.length === 0 ? (
        <EmptyState title="계정이 없어요" />
      ) : (
        <div className="space-y-2">
          {users.map((u) => (
            <Card key={u.id} className="flex items-center gap-3 p-3.5">
              <div className="min-w-0 flex-1">
                <Link
                  href={`/admin/accounts/${u.id}`}
                  className="truncate font-bold text-primary hover:underline"
                >
                  {u.nickname}
                </Link>
                <p className="text-xs text-muted-foreground">
                  {u.provider ? `구글 연동` : "닉네임"} ·{" "}
                  {format(new Date(u.createdAt), "yyyy.M.d")} 가입
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="삭제">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>계정 삭제</AlertDialogTitle>
                    <AlertDialogDescription>
                      '{u.nickname}' 계정을 삭제할까요?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => remove(u)}>
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/app/admin/accounts/page.tsx`
Expected: 에러 없음.

- [ ] **Step 3: `src/app/admin/accounts/[id]/page.tsx`(드릴다운) 신규 작성**

```tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiClientError } from "@/lib/api/client";
import { AdminSection } from "@/components/admin/section";
import { EmptyState } from "@/components/common/states";
import { Button } from "@/components/ui/button";
import { TimelineRow } from "@/components/admin/timeline-row";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { buildTimeline, type TimelineEvent } from "@/lib/admin/timeline";
import type { Bookmark, User, UserSignal } from "@/lib/types";

export default function AdminAccountDrilldownPage() {
  const { id } = useParams<{ id: string }>();
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{
          user: User;
          signals: UserSignal[];
          bookmarks: Bookmark[];
        }>(`/api/admin/users/${id}`);
        setUser(data.user);
        setBookmarks(data.bookmarks);
        const nicknames = new Map([[data.user.id, data.user.nickname]]);
        setEvents(buildTimeline(data.signals, [], nicknames, new Map(), new Map()));
      } catch {
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [id]);

  async function removeBookmark(b: Bookmark) {
    try {
      await api.del(`/api/admin/users/${id}/bookmarks`, {
        targetType: b.targetType,
        targetId: b.targetId,
      });
      toast.success("삭제했어요");
      setBookmarks((prev) => prev.filter((x) => x.id !== b.id));
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "삭제 실패");
    }
  }

  if (loading) return <p className="text-sm text-muted-foreground">불러오는 중…</p>;

  if (notFound || !user) {
    return (
      <EmptyState
        title="계정을 찾을 수 없어요"
        action={
          <Link href="/admin/accounts" className="text-sm text-primary hover:underline">
            계정 목록으로
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <Link
          href="/admin/accounts"
          className="mb-2 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> 계정 목록
        </Link>
        <h1 className="text-2xl font-extrabold">{user.nickname}</h1>
      </header>

      <AdminSection title="반응 타임라인" description={`${events.length}건`}>
        {events.length === 0 ? (
          <EmptyState title="반응 기록이 없어요" />
        ) : (
          events.map((e) => <TimelineRow key={e.id} event={e} />)
        )}
      </AdminSection>

      <AdminSection title="북마크" description={`${bookmarks.length}개`}>
        {bookmarks.length === 0 ? (
          <EmptyState title="북마크가 없어요" />
        ) : (
          <ul className="space-y-1.5 text-sm">
            {bookmarks.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-2">
                <span className="min-w-0 flex-1 truncate">
                  {b.targetType} · {b.targetId}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {new Date(b.createdAt).toLocaleDateString("ko-KR")}
                  </span>
                </span>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="icon" aria-label="북마크 삭제">
                      <Trash2 className="size-4 text-destructive" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>북마크 삭제</AlertDialogTitle>
                      <AlertDialogDescription>
                        이 북마크를 삭제할까요?
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>취소</AlertDialogCancel>
                      <AlertDialogAction
                        variant="destructive"
                        onClick={() => removeBookmark(b)}
                      >
                        삭제
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </li>
            ))}
          </ul>
        )}
      </AdminSection>
    </div>
  );
}
```

- [ ] **Step 4: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint "src/app/admin/accounts/[id]/page.tsx"`
Expected: 에러 없음.

- [ ] **Step 5: `admin-nav.tsx`에 "계정" 항목 추가**

`src/components/admin/admin-nav.tsx`, import에 `Users` 추가(기존 `History` 다음):

```tsx
import {
  LayoutDashboard,
  Building2,
  Store,
  CalendarClock,
  BarChart3,
  Compass,
  Palette,
  History,
  Users,
} from "lucide-react";
```

`ITEMS` 배열의 "타임라인" 다음(디자인 시스템 앞)에 추가:

```tsx
  { href: "/admin/timeline", label: "타임라인", icon: History },
  { href: "/admin/accounts", label: "계정", icon: Users },
  { href: "/admin/design-system", label: "디자인 시스템", icon: Palette },
```

- [ ] **Step 6: 빌드 + 회귀 확인**

Run: `npx tsc --noEmit && npx eslint src/app/admin/accounts/page.tsx "src/app/admin/accounts/[id]/page.tsx" src/components/admin/admin-nav.tsx`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과.

- [ ] **Step 7: 수동 확인 (라이트 모드만)**

`npm run dev` 후 `/admin/accounts`에서 계정 목록이 보이는지, 닉네임 클릭하면 드릴다운
으로 이동하는지, 드릴다운에서 그 사람의 반응 타임라인·북마크가 보이는지, 계정 삭제
버튼과 북마크 각각의 삭제 버튼 둘 다 → `AlertDialog`가 뜨고 취소·삭제 둘 다 정상
동작하는지(북마크는 삭제 시 목록에서 실제로 빠지는지) 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/app/admin/accounts src/components/admin/admin-nav.tsx
git commit -m "feat(admin): /admin/accounts 계정 목록·삭제·드릴다운 페이지 추가"
```

---

## 최종 검증 (전체 태스크 완료 후)

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/supabase/repository.ts src/app/api/admin/timeline/route.ts src/app/api/admin/users/route.ts "src/app/api/admin/users/[id]/route.ts" "src/app/api/admin/users/[id]/bookmarks/route.ts" src/lib/admin/timeline.ts src/components/admin/timeline-row.tsx src/app/admin/timeline/page.tsx src/app/admin/accounts/page.tsx "src/app/admin/accounts/[id]/page.tsx" src/components/admin/admin-nav.tsx
```

브라우저로 `/admin/timeline`·`/admin/accounts`·드릴다운을 라이트 모드로 한 번씩
훑어 최종 확인 — 특히 삭제 흐름(목록에서 삭제, 드릴다운 진입, 필터 칩 토글)을
실제로 클릭해서 확인한다.
