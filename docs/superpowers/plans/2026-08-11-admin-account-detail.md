# admin 계정 상세 확장 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin 계정 상세 페이지(`/admin/accounts/[id]`)에 사용자의 취향 레이더와 날짜별로 묶인 반응 타임라인을 보여준다.

**Architecture:** 기존 `GET /api/admin/users/[id]` 응답에 `values` 필드 하나를 추가하고(방문객 자신의 "내 취향" 화면과 같은 파생 로직 재사용), 기존 `TasteRadar` 컴포넌트를 그대로 재사용해 새 섹션을 추가한다. 타임라인 날짜 그루핑은 순수 함수로 뽑아 `src/lib/admin/timeline.ts`에 추가(테스트 가능하게), 페이지는 그 결과를 렌더만 한다.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · date-fns · vitest

## Global Constraints

- 취향 파생 로직은 `brain-sheet.tsx`가 이미 쓰는 것과 완전히 동일해야 한다: `brain.interests` 중 `valueDef(n.key)`가 존재하는(8가치 축인) 노드만 `{slug: confidence}`로 뽑는다 — 분야(카테고리) slug 노드는 제외.
- 새 시각화 컴포넌트를 만들지 않는다 — `TasteRadar`(`src/components/me/taste-radar.tsx`) 재사용.
- 날짜 포맷은 `date-fns`의 `format`, `"yyyy년 M월 d일"` 패턴(기존 `TimelineRow`가 같은 라이브러리를 이미 쓴다).
- `GET /api/admin/users/[id]`는 이미 `requireAdmin()`으로 보호돼 있다 — 그대로 유지, 추가 인가 로직 불필요.
- 주석은 한국어, 무엇을 하는지가 아니라 왜 그런지를 쓴다.
- 새 npm 의존성을 추가하지 않는다.
- 검증 3종은 매 태스크 끝에 돌린다: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.

---

### Task 1: API — 계정 상세 응답에 취향 값 추가

**Files:**
- Modify: `src/app/api/admin/users/[id]/route.ts`

**Interfaces:**
- Consumes: `readBrain(userId: string): Promise<UserBrain>`(`src/lib/memory/service.ts`, 이미 구현됨, 브레인 없으면 빈 브레인 반환). `valueDef(slug: string): ValueTagDef | undefined`(`src/lib/values/index.ts`, 이미 구현됨).
- Produces: `GET /api/admin/users/[id]` 응답 형태가 `{ user, signals, bookmarks }`에서 `{ user, signals, bookmarks, values }`로 확장된다. `values: Record<string, number>`.

- [ ] **Step 1: 구현**

`src/app/api/admin/users/[id]/route.ts` 전체를 다음으로 교체:

```ts
import { getRepository } from "@/lib/repositories";
import { noContent, notFound, ok, requireAdmin } from "@/lib/api/http";
import { readBrain } from "@/lib/memory/service";
import { valueDef } from "@/lib/values";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const repo = await getRepository();
  const user = await repo.getUser(id);
  if (!user) return notFound("계정을 찾을 수 없습니다");
  const [signals, bookmarks, brain] = await Promise.all([
    repo.listUserSignals(id),
    repo.listBookmarks(id),
    readBrain(id),
  ]);
  // 방문객 자신의 "내 취향" 화면(brain-sheet.tsx)과 완전히 같은 파생 로직 —
  // 8가치 축 노드만 뽑는다(분야 slug 노드는 취향 레이더 축이 아니라서 제외).
  // 로직이 갈리면 관리자가 보는 취향과 사용자 자신이 보는 취향이 달라진다.
  const values: Record<string, number> = {};
  for (const n of brain.interests) {
    if (valueDef(n.key)) values[n.key] = n.confidence;
  }
  return ok({ user, signals, bookmarks, values });
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

- [ ] **Step 2: 검증 + 커밋**

이 라우트 파일엔 기존에도 테스트가 없다(admin API 라우트 전반이 이 레포에서 유닛테스트 대상이 아니다) — 새로 만들지 않는다. tsc/eslint로 충분하다.

```bash
npx tsc --noEmit 2>&1 | grep "api/admin/users"
npx eslint "src/app/api/admin/users/[id]/route.ts"
git add "src/app/api/admin/users/[id]/route.ts"
git commit -m "feat(admin): 계정 상세 API가 취향 값도 같이 내려줌

날짜별 타임라인과 별개로, 그 사용자가 어느 취향 쪽으로 치우쳤는지 관리자가
볼 방법이 없었다. 방문객 자신의 '내 취향' 화면과 같은 파생 로직(8가치 축
confidence)을 재사용해 응답에 values를 추가한다."
```

---

### Task 2: 타임라인 날짜 그루핑 — 순수 함수

**Files:**
- Modify: `src/lib/admin/timeline.ts`
- Test: `src/lib/admin/timeline.test.ts`(기존 파일에 테스트 추가)

**Interfaces:**
- Consumes: `TimelineEvent`(같은 파일에 이미 정의됨, `{id, createdAt, source, label, userId?, userLabel, boothLabel?}`).
- Produces: `groupEventsByDay(events: TimelineEvent[]): { dateLabel: string; events: TimelineEvent[] }[]` — 날짜(로컬 자정 기준) 별로 묶은 그룹 배열. 입력이 이미 최신순 정렬돼 있다고 가정(기존 `buildTimeline`이 정렬해서 반환한다 — 이 함수는 재정렬하지 않는다).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/admin/timeline.test.ts`의 기존 내용 끝에 추가(기존 `buildTimeline` 테스트는 그대로 둔다 — import 문에 `groupEventsByDay`만 추가):

```ts
import { buildTimeline, groupEventsByDay, type TimelineEvent } from "./timeline";
```

파일 끝에 추가:

```ts
describe("groupEventsByDay", () => {
  function ev(id: string, createdAt: string): TimelineEvent {
    return {
      id,
      createdAt,
      source: "signal",
      label: "테스트",
      userLabel: "사용자",
    };
  }

  it("같은 날 이벤트는 한 그룹으로 묶인다", () => {
    const groups = groupEventsByDay([
      ev("a", "2026-08-11T09:00:00Z"),
      ev("b", "2026-08-11T15:00:00Z"),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0].events).toHaveLength(2);
  });

  it("날짜가 바뀌면 새 그룹이 생긴다", () => {
    const groups = groupEventsByDay([
      ev("a", "2026-08-11T09:00:00Z"),
      ev("b", "2026-08-10T09:00:00Z"),
    ]);
    expect(groups).toHaveLength(2);
    expect(groups[0].events.map((e) => e.id)).toEqual(["a"]);
    expect(groups[1].events.map((e) => e.id)).toEqual(["b"]);
  });

  it("그룹 순서는 입력 순서를 그대로 따른다(재정렬 안 함)", () => {
    const groups = groupEventsByDay([
      ev("a", "2026-08-11T09:00:00Z"),
      ev("b", "2026-08-09T09:00:00Z"),
      ev("c", "2026-08-11T18:00:00Z"),
    ]);
    // b가 a보다 이전 날짜지만, 입력에서 a 다음에 나오는 c는 a와 같은 8/11 그룹으로
    // 다시 합쳐지지 않는다 — 인접한 같은 날짜만 묶는다(연속 구간 그루핑).
    expect(groups).toHaveLength(3);
  });

  it("빈 배열이면 빈 배열을 반환한다", () => {
    expect(groupEventsByDay([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/admin/timeline.test.ts`
Expected: FAIL — `groupEventsByDay`가 아직 없음(`Module has no exported member`).

- [ ] **Step 3: 구현**

`src/lib/admin/timeline.ts` 파일 상단 import에 `format`을 추가하고(이미 `date-fns`가 프로젝트 의존성이다 — `timeline-row.tsx`가 이미 쓴다), 파일 끝에 함수를 추가한다:

```ts
import { format } from "date-fns";
```

파일 끝(마지막 export 다음)에 추가:

```ts
/**
 * 최신순으로 정렬된 이벤트를 날짜(로컬 자정 기준) 그룹으로 묶는다 — 연속된
 * 같은 날짜만 한 그룹으로 합친다(재정렬하지 않는다). buildTimeline이 이미
 * 최신순으로 정렬해 반환하므로 여기선 그 순서를 그대로 신뢰한다.
 */
export function groupEventsByDay(
  events: TimelineEvent[],
): { dateLabel: string; events: TimelineEvent[] }[] {
  const groups: { dateLabel: string; events: TimelineEvent[] }[] = [];
  for (const event of events) {
    const dateLabel = format(new Date(event.createdAt), "yyyy년 M월 d일");
    const last = groups[groups.length - 1];
    if (last && last.dateLabel === dateLabel) {
      last.events.push(event);
    } else {
      groups.push({ dateLabel, events: [event] });
    }
  }
  return groups;
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/admin/timeline.test.ts`
Expected: PASS (전체 — 기존 `buildTimeline` 테스트 + 새 4개)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "admin/timeline"
npx vitest run src/lib/admin/timeline.test.ts
npx eslint src/lib/admin/timeline.ts src/lib/admin/timeline.test.ts
git add src/lib/admin/timeline.ts src/lib/admin/timeline.test.ts
git commit -m "feat(admin): 타임라인 이벤트를 날짜별로 묶는 순수 함수 추가

계정 상세 페이지의 반응 타임라인이 그냥 최신순 나열이라 어느 날 뭘 했는지
한눈에 안 들어왔다. groupEventsByDay를 순수 함수로 분리해 테스트 가능하게
하고, 페이지는 다음 태스크에서 이 결과를 렌더만 한다."
```

---

### Task 3: 계정 상세 페이지 — 취향 레이더 + 날짜별 타임라인 렌더

**Files:**
- Modify: `src/app/admin/accounts/[id]/page.tsx`

**Interfaces:**
- Consumes: `groupEventsByDay`(Task 2), `TasteRadar({values, label}): JSX.Element`(`src/components/me/taste-radar.tsx`, 이미 구현됨), `useT()`(`src/lib/i18n/provider`, 이미 구현됨 — `values.${slug}` 키가 이미 양쪽 사전에 있다, judgment-vocabulary 이전부터 존재).
- Produces: 없음(화면 최종 소비 지점)

- [ ] **Step 1: 구현**

`src/app/admin/accounts/[id]/page.tsx` 전체를 다음으로 교체:

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
import { TasteRadar } from "@/components/me/taste-radar";
import { useT } from "@/lib/i18n/provider";
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
import { buildTimeline, groupEventsByDay, type TimelineEvent } from "@/lib/admin/timeline";
import type { Bookmark, User, UserSignal } from "@/lib/types";

export default function AdminAccountDrilldownPage() {
  const { id } = useParams<{ id: string }>();
  const t = useT();
  const [user, setUser] = useState<User | null>(null);
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [values, setValues] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const data = await api.get<{
          user: User;
          signals: UserSignal[];
          bookmarks: Bookmark[];
          values: Record<string, number>;
        }>(`/api/admin/users/${id}`);
        setUser(data.user);
        setBookmarks(data.bookmarks);
        setValues(data.values);
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

  const dayGroups = groupEventsByDay(events);

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

      <AdminSection title="취향" description="8가치 축 확신도">
        <TasteRadar values={values} label={(s) => t(`values.${s}`)} />
      </AdminSection>

      <AdminSection title="반응 타임라인" description={`${events.length}건`}>
        {events.length === 0 ? (
          <EmptyState title="반응 기록이 없어요" />
        ) : (
          dayGroups.map((group) => (
            <div key={group.dateLabel}>
              <p className="mb-1 mt-3 text-xs font-bold text-muted-foreground first:mt-0">
                {group.dateLabel}
              </p>
              {group.events.map((e) => (
                <TimelineRow key={e.id} event={e} />
              ))}
            </div>
          ))
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

- [ ] **Step 2: 검증**

이 페이지 컴포넌트엔 기존에도 테스트가 없다 — 새로 만들지 않는다(다른 admin 페이지 컴포넌트들과 같은 관례).

```bash
npx tsc --noEmit 2>&1 | grep "accounts/\[id\]"
npx vitest run
npx eslint "src/app/admin/accounts/[id]/page.tsx"
```

- [ ] **Step 3: 수동 확인(선택, 가능하면)**

`npx next dev`로 mock 모드 실행 후 `/admin/accounts`에서 신호가 있는 계정 하나를 열어 취향 레이더가 그려지는지, 타임라인에 날짜 헤더가 보이는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add "src/app/admin/accounts/[id]/page.tsx"
git commit -m "feat(admin): 계정 상세에 취향 레이더 + 날짜별 타임라인 렌더

취향 레이더는 반응 타임라인 바로 위에, 타임라인은 날짜 바뀌는 지점마다
헤더로 묶어서 보여준다. 새 시각화를 만들지 않고 기존 TasteRadar를 그대로
재사용 — 방문객이 자기 화면에서 보는 것과 관리자가 보는 것이 같은 모양이다."
```

---

## 자기 점검 결과

- **스펙 커버리지**: 스펙의 두 요구사항(취향 레이더, 날짜별 타임라인) 모두 Task 1(API)+Task 2(순수 함수)+Task 3(렌더)로 구현. "레이더 위치는 타임라인 바로 위"(사용자 확인) — Task 3의 JSX 순서에 반영. "날짜 헤더 방식"(사용자 확인, 캘린더/히트맵 아님) — Task 2의 `groupEventsByDay` + Task 3의 렌더가 정확히 그 형태.
- **플레이스홀더 스캔**: 없음 — 모든 코드가 실제 파일 경로·실제 함수 시그니처를 정확히 참조.
- **타입 일관성**: `values: Record<string, number>` 타입이 Task 1(API 응답)과 Task 3(컴포넌트 state·TasteRadar props)에서 동일하게 쓰인다. `TimelineEvent`/`groupEventsByDay`의 반환 타입이 Task 2(정의)와 Task 3(소비) 사이에 일치.
- **범위 점검**: 3태스크 모두 단일 파일 변경으로 끝나는 크기 — 추가 분해 불필요. Task 순서(API → 순수 함수 → 렌더)가 각 태스크를 독립적으로 테스트 가능하게 한다.
