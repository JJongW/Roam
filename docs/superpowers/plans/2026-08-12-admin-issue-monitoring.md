# admin 오류/이슈 모니터링(D2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 서버 오류·클라이언트 오류·데이터 이슈(부스 결측, 판단 레코드 정합성) 세 가지를 `/admin/errors`에서 확인할 수 있게 한다.

**Architecture:** 서버·클라이언트 오류는 `issue_log` 단일 테이블에 `source` 컬럼으로만 구분해 담는다. 서버 오류는 `src/instrumentation.ts`의 `onRequestError` 훅 하나로 기존 route 파일을 건드리지 않고 전부 잡는다. 클라이언트 오류는 기존 `error.tsx`/`global-error.tsx` + 새 전역 `window.onerror`/`unhandledrejection` 리스너가 `POST /api/errors`로 보낸다. 데이터 이슈는 저장하지 않고 admin이 탭을 열 때마다 순수 함수로 즉시 계산한다.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · Zod · Supabase(Postgres) · vitest

## Global Constraints

- 알림(Slack/이메일) 없음 — admin 대시보드에서 조회하는 것만 이번 범위.
- 데이터 이슈는 절대 저장하지 않는다 — 조회 시점 실시간 계산만.
- 서버 오류·클라이언트 오류는 같은 `issue_log` 테이블에 `source` 컬럼으로만 구분한다 — 별개 테이블로 쪼개지 않는다.
- 로깅 자체의 실패가 원래 요청·화면에 절대 영향을 주면 안 된다 — `logIssue`는 내부에서 실패를 삼키고 절대 throw하지 않는다(`loggedWrite` 철학과 동일).
- 기존 API route 51개는 건드리지 않는다 — 서버 오류 캡처는 `instrumentation.ts` 하나로 끝낸다.
- `issue_log`는 RLS는 켜두되 정책은 두지 않는다(anon/authenticated 전면 차단) — 쓰기·읽기 모두 `createServiceClient()`(service-role)로만 접근한다.
- 주석은 한국어, 무엇을 하는지가 아니라 왜 그런지를 쓴다.
- 새 npm 의존성을 추가하지 않는다(Radix Tabs·date-fns 등 기존 의존성만 사용).
- 검증 3종은 매 태스크 끝에: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.

---

### Task 1: `issue_log` 스키마 + 타입 + Repository 인터페이스 + Mock 구현

**Files:**
- Create: `supabase/migrations/0036_issue_log.sql`
- Modify: `src/lib/types/index.ts` (AiQueryLog 인터페이스 바로 아래, 344번째 줄 근처에 추가)
- Modify: `src/lib/repositories/types.ts` (`logAiQuery`/`topQueryKeywords` 바로 아래, 128-135번째 줄 근처에 추가; `listNotes` 바로 아래, 174번째 줄 근처에 `listNotesByBoothIds` 추가)
- Modify: `src/lib/mock/repository.ts` (Store 인터페이스에 `issueLogs: IssueLog[]` 필드 추가, `buildStore()`에 `issueLogs: []` 추가, `logAiQuery`/`topQueryKeywords` 구현 바로 아래에 `logIssue`/`listIssues` 추가, `listNotes` 바로 아래에 `listNotesByBoothIds` 추가)
- Test: `src/lib/mock/repository.test.ts` (기존 파일에 추가)

**Interfaces:**
- Produces: `IssueLog` 타입(`src/lib/types/index.ts`) — `{id, source: "server"|"client", message, stack?, path?, digest?, userId?, sessionId?, context?: Record<string, unknown>, createdAt}`.
- Produces: `Repository.logIssue(input: {source: "server"|"client"; message: string; stack?: string; path?: string; digest?: string; userId?: string; sessionId?: string; context?: Record<string, unknown>}): Promise<void>`.
- Produces: `Repository.listIssues(opts?: {source?: "server"|"client"; limit?: number}): Promise<IssueLog[]>` — 최신순.
- Produces: `Repository.listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]>`.

- [ ] **Step 1: 마이그레이션 작성**

`supabase/migrations/0036_issue_log.sql` 전체 내용:

```sql
-- 0036: issue_log — 서버/클라이언트 오류 이벤트. source 컬럼 하나로 서버·클라이언트를
-- 구분한다(둘 다 "언제·어디서·무슨 메시지·스택"이라는 같은 모양의 사건 기록이라 테이블을
-- 나눌 이유가 없다). 쓰기·읽기 모두 service-role로만 접근(POST /api/errors,
-- instrumentation.ts onRequestError, /admin/errors) — anon/authenticated용 정책을
-- 두지 않아 RLS가 그 두 role은 전면 차단한다.

create table if not exists issue_log (
  id          text primary key,
  source      text not null check (source in ('server', 'client')),
  message     text not null,
  stack       text,
  path        text,
  digest      text,
  user_id     text,
  session_id  text,
  context     jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists issue_log_created_idx
  on issue_log (created_at desc);
create index if not exists issue_log_source_created_idx
  on issue_log (source, created_at desc);

alter table issue_log enable row level security;
```

- [ ] **Step 2: 타입 추가**

`src/lib/types/index.ts`의 `AiQueryLog` 인터페이스(344번째 줄 근처) 바로 뒤에 추가:

```ts
/**
 * 서버·클라이언트 오류 이벤트. source로만 구분 — 구조가 같은 하나의 로그 스트림이다.
 * 데이터 이슈(부스 결측 등)는 여기 안 담는다. "사건"이 아니라 "지금 상태"라서 별도로
 * 조회 시점에 계산한다(src/lib/admin/data-issues.ts).
 */
export interface IssueLog {
  id: string;
  source: "server" | "client";
  message: string;
  stack?: string;
  path?: string;
  digest?: string;
  userId?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
  createdAt: string;
}
```

- [ ] **Step 3: Repository 인터페이스에 메서드 추가**

`src/lib/repositories/types.ts`의 `topQueryKeywords` 선언 바로 뒤(135번째 줄 근처)에 추가:

```ts
  // 오류/이슈 로그 (admin 모니터링)
  /** 서버 또는 클라이언트에서 발생한 오류 이벤트를 적재. 절대 throw하지 않는다 —
   *  로깅 실패가 원래 요청에 영향을 주면 안 된다. */
  logIssue(input: {
    source: "server" | "client";
    message: string;
    stack?: string;
    path?: string;
    digest?: string;
    userId?: string;
    sessionId?: string;
    context?: Record<string, unknown>;
  }): Promise<void>;
  /** 오류 이벤트 최신순 조회(admin 전용). */
  listIssues(opts?: {
    source?: "server" | "client";
    limit?: number;
  }): Promise<IssueLog[]>;
```

같은 파일의 `listNotes` 선언(174번째 줄 근처) 바로 뒤에 추가:

```ts
  /** 특정 부스 id 목록에 해당하는 모든 사용자의 노트(admin 데이터 이슈 계산용). */
  listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]>;
```

파일 상단 import에 `IssueLog`가 없으면 추가(다른 타입들과 함께 `@/lib/types`에서 import).

- [ ] **Step 4: 실패하는 테스트 작성**

`src/lib/mock/repository.test.ts` 파일 끝에 추가:

```ts
describe("logIssue / listIssues", () => {
  it("적재한 이슈를 최신순으로 돌려준다", async () => {
    const repo = new MockRepository();
    await repo.logIssue({ source: "server", message: "첫 번째 오류" });
    await repo.logIssue({ source: "client", message: "두 번째 오류" });
    const issues = await repo.listIssues();
    expect(issues.map((i) => i.message)).toEqual(["두 번째 오류", "첫 번째 오류"]);
  });

  it("source로 필터링한다", async () => {
    const repo = new MockRepository();
    await repo.logIssue({ source: "server", message: "서버 오류" });
    await repo.logIssue({ source: "client", message: "클라 오류" });
    const serverOnly = await repo.listIssues({ source: "server" });
    expect(serverOnly).toHaveLength(1);
    expect(serverOnly[0].message).toBe("서버 오류");
  });

  it("limit을 적용한다", async () => {
    const repo = new MockRepository();
    for (let i = 0; i < 5; i++) {
      await repo.logIssue({ source: "server", message: `오류 ${i}` });
    }
    const limited = await repo.listIssues({ limit: 2 });
    expect(limited).toHaveLength(2);
  });
});

describe("listNotesByBoothIds", () => {
  it("주어진 부스 id에 해당하는 노트만 반환한다", async () => {
    const repo = new MockRepository();
    const all = await repo.listBooths("sibf-2026", { limit: 5 });
    const [a, b] = all.data;
    await repo.upsertNote("user-1", a.id, { interest: "must" }, "confident");
    await repo.upsertNote("user-2", b.id, { interest: "curious" }, "confident");
    const notes = await repo.listNotesByBoothIds([a.id]);
    expect(notes).toHaveLength(1);
    expect(notes[0].boothId).toBe(a.id);
  });
});
```

- [ ] **Step 5: 테스트 실패 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: FAIL — `logIssue`/`listIssues`/`listNotesByBoothIds`가 아직 없음(타입 에러 또는 `is not a function`).

- [ ] **Step 6: Mock 구현**

`src/lib/mock/repository.ts`의 `Store` 인터페이스(`userBrains: Map<string, UserBrain>;` 다음 줄)에 추가:

```ts
  issueLogs: IssueLog[];
```

`buildStore()`의 반환 객체에서 `userBrains: new Map(),` 다음 줄에 추가:

```ts
    issueLogs: [],
```

파일 상단 import에 `IssueLog`를 `@/lib/types`에서 가져오는 목록에 추가.

`logAiQuery`/`topQueryKeywords` 구현(888-910번째 줄 근처) 바로 뒤에 추가:

```ts
  async logIssue(input: {
    source: "server" | "client";
    message: string;
    stack?: string;
    path?: string;
    digest?: string;
    userId?: string;
    sessionId?: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    store().issueLogs.push({
      id: uid("issue"),
      source: input.source,
      message: input.message,
      stack: input.stack,
      path: input.path,
      digest: input.digest,
      userId: input.userId,
      sessionId: input.sessionId,
      context: input.context,
      createdAt: now(),
    });
  }

  async listIssues(opts?: {
    source?: "server" | "client";
    limit?: number;
  }): Promise<IssueLog[]> {
    let list = [...store().issueLogs].reverse();
    if (opts?.source) list = list.filter((i) => i.source === opts.source);
    return list.slice(0, opts?.limit ?? 100);
  }
```

`listNotes` 구현(726-728번째 줄 근처) 바로 뒤에 추가:

```ts
  async listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]> {
    const ids = new Set(boothIds);
    return store().notes.filter((n) => ids.has(n.boothId));
  }
```

- [ ] **Step 7: 테스트 통과 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: PASS(전체 — 기존 테스트 + 새 4개)

- [ ] **Step 8: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep -E "types/index|repositories/types|mock/repository"
npx vitest run
npx eslint src/lib/types/index.ts src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/mock/repository.test.ts
git add supabase/migrations/0036_issue_log.sql src/lib/types/index.ts src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/mock/repository.test.ts
git commit -m "feat(admin): issue_log 스키마 + Repository 인터페이스 + Mock 구현

서버/클라이언트 오류를 admin에서 볼 방법이 없었다. 저장 형태부터 만든다 —
이번 태스크는 mock 모드에서 동작을 검증하고, 다음 태스크에서 Supabase
구현을 채운다."
```

---

### Task 2: Supabase 구현

**Files:**
- Modify: `src/lib/supabase/repository.ts` (`logAiQuery`/`topQueryKeywords` 바로 아래에 `logIssue`/`listIssues` 추가, `listNotes` 바로 아래에 `listNotesByBoothIds` 추가, 파일 하단 매퍼 구역에 `mapIssueLog` 추가)

**Interfaces:**
- Consumes: Task 1의 `IssueLog` 타입, `issue_log` 테이블 스키마.
- Produces: 없음(Repository 인터페이스는 이미 Task 1에서 정의됨) — 이 태스크는 그 인터페이스의 Supabase 쪽 구현만 채운다.

- [ ] **Step 1: 구현**

`src/lib/supabase/repository.ts`의 `logAiQuery`/`topQueryKeywords` 구현(1631-1665번째 줄 근처) 바로 뒤에 추가:

```ts
  // --- 오류/이슈 로그 --------------------------------------------------------

  async logIssue(input: {
    source: "server" | "client";
    message: string;
    stack?: string;
    path?: string;
    digest?: string;
    userId?: string;
    sessionId?: string;
    context?: Record<string, unknown>;
  }): Promise<void> {
    // 로깅 자체가 실패해도 원래 요청·화면엔 절대 영향을 주면 안 된다 — service-role
    // 키가 없는 환경(로컬 개발 등)에서도 조용히 넘어간다.
    try {
      const db = createServiceClient();
      const res = await db.from("issue_log").insert({
        id: uid("issue"),
        source: input.source,
        message: input.message,
        stack: input.stack ?? null,
        path: input.path ?? null,
        digest: input.digest ?? null,
        user_id: input.userId ?? null,
        session_id: input.sessionId ?? null,
        context: input.context ?? null,
        created_at: now(),
      });
      loggedWrite(res, "이슈 로그 적재");
    } catch (e) {
      console.error("[repo] 이슈 로그 적재 실패:", e);
    }
  }

  async listIssues(opts?: {
    source?: "server" | "client";
    limit?: number;
  }): Promise<IssueLog[]> {
    const db = createServiceClient();
    let q = db
      .from("issue_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 100);
    if (opts?.source) q = q.eq("source", opts.source);
    const { data } = await q;
    return (data ?? []).map((r) => mapIssueLog(r as Row));
  }
```

`listNotes` 구현(1219-1226번째 줄 근처) 바로 뒤에 추가:

```ts
  async listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]> {
    if (boothIds.length === 0) return [];
    const db = await this.db();
    const { data } = await db
      .from("booth_note")
      .select("*")
      .in("booth_id", boothIds);
    return (data ?? []).map(mapNote);
  }
```

`mapNote` 함수(351번째 줄 근처) 바로 위에 매퍼 추가:

```ts
function mapIssueLog(r: Row): IssueLog {
  return {
    id: str(r.id),
    source: String(r.source) as IssueLog["source"],
    message: str(r.message),
    stack: r.stack == null ? undefined : str(r.stack),
    path: r.path == null ? undefined : str(r.path),
    digest: r.digest == null ? undefined : str(r.digest),
    userId: r.user_id == null ? undefined : str(r.user_id),
    sessionId: r.session_id == null ? undefined : str(r.session_id),
    context: (r.context as Record<string, unknown> | null) ?? undefined,
    createdAt: str(r.created_at),
  };
}
```

파일 상단 import 목록에 `IssueLog`가 없으면 `@/lib/types`에서 가져오는 타입 목록에 추가.

- [ ] **Step 2: 검증 + 커밋**

이 파일은 기존에도 유닛테스트가 없다(Supabase 구현 전반이 이 프로젝트에서 테스트 대상이 아니다) — 새로 만들지 않는다.

```bash
npx tsc --noEmit 2>&1 | grep "supabase/repository"
npx eslint src/lib/supabase/repository.ts
git add src/lib/supabase/repository.ts
git commit -m "feat(admin): issue_log Supabase 구현

Task 1의 Repository 인터페이스를 Supabase 쪽에서 채운다. 쓰기·읽기 모두
service-role 클라이언트로 RLS를 우회한다 — anon/authenticated용 정책을
두지 않았기 때문."
```

---

### Task 3: 클라이언트 오류 캡처

**Files:**
- Modify: `src/lib/schemas/index.ts` (zod 스키마 추가)
- Create: `src/app/api/errors/route.ts`
- Modify: `src/app/error.tsx`
- Modify: `src/app/global-error.tsx`
- Create: `src/components/monitoring/error-reporter.tsx`
- Modify: `src/components/providers.tsx`

**Interfaces:**
- Consumes: Task 1의 `Repository.logIssue()`, `getRepository()`(`@/lib/repositories`), `getUserId()`/`getSessionId()`(`@/lib/api/http`), `api.post()`(`@/lib/api/client`).
- Produces: `POST /api/errors` — body `{message: string; stack?: string; path?: string; digest?: string; context?: Record<string, unknown>}`, 응답 `{data: null}`(204 대신 200으로 빈 데이터 — 클라이언트가 실패해도 신경 안 쓰므로 단순하게).

- [ ] **Step 1: zod 스키마 추가**

`src/lib/schemas/index.ts` 파일 끝에 추가:

```ts
export const errorReportSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(500).optional(),
  digest: z.string().max(200).optional(),
  context: z.record(z.string(), z.unknown()).optional(),
});
```

- [ ] **Step 2: `POST /api/errors` 라우트 작성**

`src/app/api/errors/route.ts` 전체 내용:

```ts
import { getRepository } from "@/lib/repositories";
import { ok, parseBody, getUserId, getSessionId } from "@/lib/api/http";
import { errorReportSchema } from "@/lib/schemas";

// 로그인 게이트 뒤에 있는 앱이라 오남용 위험이 낮다 — 별도 인증 없이 열어둔다.
// (CLAUDE.md: 방문객 앱 전체가 인증 게이트 뒤에 있다)
export async function POST(req: Request) {
  const parsed = await parseBody(req, errorReportSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const [userId, sessionId] = await Promise.all([getUserId(), getSessionId()]);
  await repo.logIssue({
    source: "client",
    message: parsed.data.message,
    stack: parsed.data.stack,
    path: parsed.data.path,
    digest: parsed.data.digest,
    userId: userId ?? undefined,
    sessionId: sessionId ?? undefined,
    context: parsed.data.context,
  });
  return ok(null);
}
```

- [ ] **Step 3: `error.tsx` 연결**

`src/app/error.tsx`에서 기존:

```tsx
  useEffect(() => {
    // monitoring hook — forward to a service in production
    console.error("[app:error]", error);
  }, [error]);
```

를 다음으로 교체:

```tsx
  useEffect(() => {
    console.error("[app:error]", error);
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        path: typeof window !== "undefined" ? window.location.pathname : undefined,
        digest: error.digest,
      }),
    }).catch(() => {
      /* 오류 보고 자체가 실패해도 사용자에게 보여줄 화면엔 영향 없음 */
    });
  }, [error]);
```

(`api.post` 대신 raw `fetch`를 쓴다 — `api.post`는 실패 시 throw하는 `ApiClientError`라, 오류 화면에서 오류 보고까지 또 실패해 예외가 나면 안 된다.)

- [ ] **Step 4: `global-error.tsx` 연결**

`src/app/global-error.tsx`는 `<html>`을 통째로 감싸는 최상위 바운더리라 `useEffect`를 못 쓴다(함수 컴포넌트 바디에서 직접 실행). 파일 상단에 `"use client"` 아래, import 없이 컴포넌트 함수 시작 부분에 fire-and-forget 호출을 추가한다:

```tsx
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 렌더 중 부수효과지만 이 바운더리는 useEffect를 쓸 수 없는 최상위 컴포넌트다
  // (에러 화면조차 못 띄울 만큼 심각한 오류라 리포트만 최선을 다해 보낸다).
  if (typeof window !== "undefined") {
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        path: window.location.pathname,
        digest: error.digest,
      }),
    }).catch(() => {});
  }

  return (
```

(이 블록을 기존 `return (` 바로 위에 삽입 — 이후 JSX는 그대로 둔다.)

- [ ] **Step 5: 전역 리스너 컴포넌트 작성**

`src/components/monitoring/error-reporter.tsx` 전체 내용(`src/components/common/web-vitals.tsx`와 같은 관례 — mount-only, render null):

```tsx
"use client";

import { useEffect } from "react";

/**
 * React 렌더 트리 밖 오류(이벤트 핸들러·비동기 코드)는 error.tsx가 못 잡는다
 * — window.onerror/unhandledrejection으로 따로 잡아 서버에 보고한다.
 */
export function ErrorReporter() {
  useEffect(() => {
    function report(message: string, stack?: string) {
      fetch("/api/errors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          stack,
          path: window.location.pathname,
        }),
      }).catch(() => {});
    }

    function onError(event: ErrorEvent) {
      report(event.message, event.error?.stack);
    }
    function onRejection(event: PromiseRejectionEvent) {
      const reason = event.reason;
      const message =
        reason instanceof Error ? reason.message : String(reason);
      const stack = reason instanceof Error ? reason.stack : undefined;
      report(message, stack);
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
```

- [ ] **Step 6: 루트에 마운트**

`src/components/providers.tsx`에서 import 목록에 추가:

```tsx
import { ErrorReporter } from "@/components/monitoring/error-reporter";
```

`<WebVitals />` 바로 뒤에 추가:

```tsx
        <WebVitals />
        <ErrorReporter />
```

- [ ] **Step 7: 검증 + 커밋**

이 태스크가 만든 라우트·컴포넌트는 이 프로젝트의 다른 error boundary·모니터링 컴포넌트(`WebVitals`)와 마찬가지로 유닛테스트가 없다 — 새로 만들지 않는다.

```bash
npx tsc --noEmit 2>&1 | grep -E "api/errors|app/error|global-error|monitoring/error-reporter|providers"
npx vitest run
npx eslint src/lib/schemas/index.ts src/app/api/errors/route.ts src/app/error.tsx src/app/global-error.tsx src/components/monitoring/error-reporter.tsx src/components/providers.tsx
git add src/lib/schemas/index.ts src/app/api/errors/route.ts src/app/error.tsx src/app/global-error.tsx src/components/monitoring/error-reporter.tsx src/components/providers.tsx
git commit -m "feat(admin): 클라이언트 오류를 issue_log로 수집

React 렌더 오류(error.tsx/global-error.tsx)는 콘솔에만 찍히고 사라졌고,
이벤트 핸들러·비동기 코드의 오류는 아예 안 잡히고 있었다. 둘 다
POST /api/errors로 모아 issue_log에 적재한다."
```

---

### Task 4: 서버 오류 캡처 — `instrumentation.ts`

**Files:**
- Create: `src/instrumentation.ts`

**Interfaces:**
- Consumes: Task 1의 `Repository.logIssue()`, `getRepository()`(`@/lib/repositories`).
- Produces: 없음(Next.js가 자동으로 호출하는 프레임워크 훅)

- [ ] **Step 1: 구현**

`src/instrumentation.ts` 전체 내용:

```ts
/**
 * Next.js가 API route·RSC에서 발생하는 모든 서버 예외를 여기로 보낸다(App
 * Router 표준 훅 — Sentry 같은 도구가 쓰는 바로 그 메커니즘). 기존 route 51개를
 * 일일이 try/catch로 감싸는 대신 이 파일 하나로 전부 잡는다.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
) {
  try {
    const { getRepository } = await import("@/lib/repositories");
    const repo = await getRepository();
    const err = error instanceof Error ? error : new Error(String(error));
    await repo.logIssue({
      source: "server",
      message: err.message,
      stack: err.stack,
      path: request.path,
      digest: (err as Error & { digest?: string }).digest,
      context: { method: request.method },
    });
  } catch (e) {
    // 로깅 자체가 실패해도 원래 요청엔 이미 응답이 나갔다 — 콘솔에만 남긴다.
    console.error("[instrumentation] 오류 로깅 실패:", e);
  }
}
```

(`register()`는 정의하지 않는다 — OpenTelemetry 등 별도 계측 설정이 필요 없다. `onRequestError`만 export하면 Next.js가 인식한다.)

- [ ] **Step 2: 수동 확인**

이 파일은 프레임워크가 요청 처리 중 예외 발생 시 자동으로 호출하는 훅이라 유닛테스트 대상이 아니다(다른 프레임워크 훅 파일과 동일 관례). `npx next dev`로 실행 후, 의도적으로 예외를 던지는 임시 API route를 하나 만들어 호출해보고 `issue_log`에 행이 쌓이는지 확인한다(mock 모드에서 확인 후 임시 route는 지운다) — 가능하면 수행하고, 환경상 어렵다면 건너뛴다.

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "instrumentation"
npx eslint src/instrumentation.ts
git add src/instrumentation.ts
git commit -m "feat(admin): 서버 오류를 issue_log로 수집

API route·RSC에서 나는 예외가 지금까지 콘솔에만 찍히고 사라졌다.
onRequestError 훅으로 기존 route 파일 변경 없이 전부 잡는다."
```

---

### Task 5: 데이터 이슈 계산 — 순수 함수

**Files:**
- Create: `src/lib/admin/data-issues.ts`
- Test: `src/lib/admin/data-issues.test.ts`

**Interfaces:**
- Consumes: `Booth`, `BoothNote`(`@/lib/types`).
- Produces: `findBoothEnrichmentGaps(booths: Booth[]): BoothGap[]`, `BoothGap = {boothId: string; boothName: string; missingFields: string[]}`.
- Produces: `findNoteInconsistencies(notes: BoothNote[], validBoothIds: Set<string>): NoteInconsistency[]`, `NoteInconsistency = {userId: string; boothId: string; reason: "verdict_without_visitedAt" | "orphaned_booth"}`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/admin/data-issues.test.ts` 전체 내용:

```ts
import { describe, expect, it } from "vitest";
import { findBoothEnrichmentGaps, findNoteInconsistencies } from "./data-issues";
import type { Booth, BoothNote } from "@/lib/types";

function booth(overrides: Partial<Booth> & { id: string; name: string }): Booth {
  return {
    exhibitionId: "ex-1",
    kind: "exhibitor",
    categoryId: "cat-1",
    tags: [],
    aliases: [],
    ...overrides,
  } as Booth;
}

describe("findBoothEnrichmentGaps", () => {
  it("최소 필수 6종이 다 채워진 부스는 결측 없음", () => {
    const b = booth({
      id: "b1",
      name: "부스1",
      enrichment: {
        goodsKeywords: [],
        themeTags: [],
        summary: "요약",
        valueTags: [{ slug: "discovery", strength: 1 }],
        recommendationReasons: { discovery: "이유" },
        thingsToDo: ["신간 훑기"],
        timing: ["오전 붐빔"],
        memoryHooks: ["기억 단서"],
      },
    });
    expect(findBoothEnrichmentGaps([b])).toEqual([]);
  });

  it("enrichment 자체가 없으면 6종 전부 결측", () => {
    const b = booth({ id: "b2", name: "부스2" });
    const gaps = findBoothEnrichmentGaps([b]);
    expect(gaps).toHaveLength(1);
    expect(gaps[0].missingFields).toEqual([
      "summary",
      "valueTags",
      "recommendationReasons",
      "thingsToDo",
      "timing",
      "memoryHooks",
    ]);
  });

  it("빈 배열/빈 객체/빈 문자열도 결측으로 센다", () => {
    const b = booth({
      id: "b3",
      name: "부스3",
      enrichment: {
        goodsKeywords: [],
        themeTags: [],
        summary: "",
        valueTags: [],
        recommendationReasons: {},
        thingsToDo: [],
        timing: ["오전 붐빔"],
        memoryHooks: ["기억 단서"],
      },
    });
    const gaps = findBoothEnrichmentGaps([b]);
    expect(gaps[0].missingFields).toEqual([
      "summary",
      "valueTags",
      "recommendationReasons",
      "thingsToDo",
    ]);
  });

  it("결측 필드 수가 많은 부스가 먼저 온다", () => {
    const few = booth({
      id: "b4",
      name: "결측적음",
      enrichment: {
        goodsKeywords: [],
        themeTags: [],
        summary: "요약",
        valueTags: [{ slug: "discovery", strength: 1 }],
        recommendationReasons: { discovery: "이유" },
        thingsToDo: ["할 일"],
      },
    });
    const many = booth({ id: "b5", name: "결측많음" });
    const gaps = findBoothEnrichmentGaps([few, many]);
    expect(gaps[0].boothId).toBe("b5");
    expect(gaps[1].boothId).toBe("b4");
  });
});

describe("findNoteInconsistencies", () => {
  function note(overrides: Partial<BoothNote> & { userId: string; boothId: string }): BoothNote {
    return { ...overrides };
  }

  it("verdict가 있는데 visitedAt이 없으면 플래그", () => {
    const notes = [note({ userId: "u1", boothId: "b1", verdict: "good" })];
    const issues = findNoteInconsistencies(notes, new Set(["b1"]));
    expect(issues).toEqual([
      { userId: "u1", boothId: "b1", reason: "verdict_without_visitedAt" },
    ]);
  });

  it("존재하지 않는 부스를 가리키면 플래그", () => {
    const notes = [
      note({ userId: "u1", boothId: "deleted-booth", interest: "must" }),
    ];
    const issues = findNoteInconsistencies(notes, new Set(["b1"]));
    expect(issues).toEqual([
      { userId: "u1", boothId: "deleted-booth", reason: "orphaned_booth" },
    ]);
  });

  it("정상 레코드는 플래그 없음", () => {
    const notes = [
      note({
        userId: "u1",
        boothId: "b1",
        verdict: "good",
        visitedAt: "2026-08-11T00:00:00Z",
      }),
    ];
    expect(findNoteInconsistencies(notes, new Set(["b1"]))).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/admin/data-issues.test.ts`
Expected: FAIL — `./data-issues` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/lib/admin/data-issues.ts` 전체 내용:

```ts
import type { Booth, BoothNote } from "@/lib/types";

// CLAUDE.md "최소 필수 6종" — 이 6개가 다 채워질수록 근거 카드 품질이 올라간다.
const REQUIRED_ENRICHMENT_FIELDS = [
  "summary",
  "valueTags",
  "recommendationReasons",
  "thingsToDo",
  "timing",
  "memoryHooks",
] as const;

export interface BoothGap {
  boothId: string;
  boothName: string;
  missingFields: string[];
}

function isEmptyValue(value: unknown): boolean {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "string") return value.trim() === "";
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

/** 부스별로 "최소 필수 6종" 중 비어 있는 필드를 찾는다. 결측 많은 순으로 정렬. */
export function findBoothEnrichmentGaps(booths: Booth[]): BoothGap[] {
  const gaps: BoothGap[] = [];
  for (const booth of booths) {
    const missing: string[] = [];
    for (const field of REQUIRED_ENRICHMENT_FIELDS) {
      const value = booth.enrichment?.[field];
      if (isEmptyValue(value)) missing.push(field);
    }
    if (missing.length > 0) {
      gaps.push({ boothId: booth.id, boothName: booth.name, missingFields: missing });
    }
  }
  return gaps.sort((a, b) => b.missingFields.length - a.missingFields.length);
}

export interface NoteInconsistency {
  userId: string;
  boothId: string;
  reason: "verdict_without_visitedAt" | "orphaned_booth";
}

/**
 * 판단 레코드 정합성 체크. verdict는 항상 visitedAt과 같이 있어야 한다는 게 쓰기
 * 경로의 불변조건인데(judgment-vocabulary), 깨졌다면 로미의 취향 추론이 조용히
 * 틀어질 수 있는 신호다. 부스가 삭제됐는데 노트만 남은 고아 레코드도 같이 찾는다.
 */
export function findNoteInconsistencies(
  notes: BoothNote[],
  validBoothIds: Set<string>,
): NoteInconsistency[] {
  const issues: NoteInconsistency[] = [];
  for (const note of notes) {
    if (note.verdict && !note.visitedAt) {
      issues.push({
        userId: note.userId,
        boothId: note.boothId,
        reason: "verdict_without_visitedAt",
      });
    }
    if (!validBoothIds.has(note.boothId)) {
      issues.push({
        userId: note.userId,
        boothId: note.boothId,
        reason: "orphaned_booth",
      });
    }
  }
  return issues;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/admin/data-issues.test.ts`
Expected: PASS(9개 전부)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "admin/data-issues"
npx vitest run
npx eslint src/lib/admin/data-issues.ts src/lib/admin/data-issues.test.ts
git add src/lib/admin/data-issues.ts src/lib/admin/data-issues.test.ts
git commit -m "feat(admin): 데이터 이슈 계산 순수 함수 추가

부스 enrichment 결측과 판단 레코드 정합성 문제를 저장 없이 조회 시점에
계산한다. 다음 태스크에서 /admin/errors 페이지가 이 결과를 렌더만 한다."
```

---

### Task 6: `/admin/errors` 페이지 + 내비게이션

**Files:**
- Create: `src/app/admin/errors/page.tsx`
- Create: `src/components/admin/issue-log-list.tsx`
- Create: `src/components/admin/data-issue-list.tsx`
- Modify: `src/components/admin/admin-nav.tsx`

**Interfaces:**
- Consumes: Task 1/2의 `Repository.listIssues()`, `Repository.listNotesByBoothIds()`, `repo.listBoothsByExhibitionId()`(기존). Task 5의 `findBoothEnrichmentGaps()`, `findNoteInconsistencies()`. `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent`(`@/components/ui/tabs`, 기존). `AdminSection`(`@/components/admin/section`, 기존).

- [ ] **Step 1: 오류 로그 목록 컴포넌트**

`src/components/admin/issue-log-list.tsx` 전체 내용:

```tsx
"use client";

import { useState } from "react";
import type { IssueLog } from "@/lib/types";

export function IssueLogList({ issues }: { issues: IssueLog[] }) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "server" | "client">("all");

  const filtered =
    filter === "all" ? issues : issues.filter((i) => i.source === filter);

  return (
    <div className="space-y-3">
      <div className="flex gap-1.5">
        {(["all", "server", "client"] as const).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
              filter === f
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {f === "all" ? "전체" : f === "server" ? "서버" : "클라이언트"}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">기록된 오류가 없어요.</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((issue) => (
            <li
              key={issue.id}
              className="rounded-xl border border-border bg-card p-3 text-sm"
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() =>
                  setExpandedId(expandedId === issue.id ? null : issue.id)
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${
                        issue.source === "server"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {issue.source === "server" ? "서버" : "클라이언트"}
                    </span>
                    <span>{new Date(issue.createdAt).toLocaleString("ko-KR")}</span>
                    {issue.path && <span className="truncate">{issue.path}</span>}
                  </p>
                  <p className="mt-1 truncate font-medium">{issue.message}</p>
                </div>
              </button>
              {expandedId === issue.id && issue.stack && (
                <pre className="mt-2 overflow-x-auto rounded-lg bg-secondary p-2 text-xs text-muted-foreground">
                  {issue.stack}
                </pre>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 데이터 이슈 목록 컴포넌트**

`src/components/admin/data-issue-list.tsx` 전체 내용:

```tsx
import type { BoothGap, NoteInconsistency } from "@/lib/admin/data-issues";

const REASON_LABEL: Record<NoteInconsistency["reason"], string> = {
  verdict_without_visitedAt: "판정은 있는데 방문 시각이 없음",
  orphaned_booth: "존재하지 않는 부스를 가리킴",
};

export function DataIssueList({
  gaps,
  inconsistencies,
}: {
  gaps: BoothGap[];
  inconsistencies: NoteInconsistency[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-bold">부스 정보 결측 ({gaps.length})</h3>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">결측 없음.</p>
        ) : (
          <ul className="space-y-1.5">
            {gaps.map((g) => (
              <li
                key={g.boothId}
                className="rounded-xl border border-border bg-card p-3 text-sm"
              >
                <p className="font-medium">{g.boothName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.missingFields.join(", ")}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">
          판단 레코드 정합성 ({inconsistencies.length})
        </h3>
        {inconsistencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">이상 없음.</p>
        ) : (
          <ul className="space-y-1.5">
            {inconsistencies.map((n, i) => (
              <li
                key={`${n.userId}-${n.boothId}-${i}`}
                className="rounded-xl border border-border bg-card p-3 text-sm"
              >
                <p className="font-medium">{REASON_LABEL[n.reason]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  user: {n.userId} · booth: {n.boothId}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 페이지 작성**

`src/app/admin/errors/page.tsx` 전체 내용:

```tsx
import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import { findBoothEnrichmentGaps, findNoteInconsistencies } from "@/lib/admin/data-issues";
import { AdminSection } from "@/components/admin/section";
import { IssueLogList } from "@/components/admin/issue-log-list";
import { DataIssueList } from "@/components/admin/data-issue-list";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const metadata = { title: "오류/이슈" };

export default async function AdminErrorsPage() {
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());

  const issues = await repo.listIssues();

  let gaps: ReturnType<typeof findBoothEnrichmentGaps> = [];
  let inconsistencies: ReturnType<typeof findNoteInconsistencies> = [];
  if (exhibition) {
    const booths = await repo.listBoothsByExhibitionId(exhibition.id);
    const boothIds = booths.map((b) => b.id);
    const notes = await repo.listNotesByBoothIds(boothIds);
    gaps = findBoothEnrichmentGaps(booths);
    inconsistencies = findNoteInconsistencies(notes, new Set(boothIds));
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">오류/이슈</h1>
        {exhibition && <p className="text-sm text-muted-foreground">{exhibition.name}</p>}
      </header>

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">오류 로그</TabsTrigger>
          <TabsTrigger value="data">데이터 이슈</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <AdminSection title="오류 로그" description={`최근 ${issues.length}건`}>
            <IssueLogList issues={issues} />
          </AdminSection>
        </TabsContent>
        <TabsContent value="data">
          <AdminSection title="데이터 이슈" description="조회 시점 실시간 계산">
            <DataIssueList gaps={gaps} inconsistencies={inconsistencies} />
          </AdminSection>
        </TabsContent>
      </Tabs>
    </div>
  );
}
```

- [ ] **Step 4: 내비게이션에 링크 추가**

`src/components/admin/admin-nav.tsx`의 import 목록에 `AlertTriangle` 추가:

```ts
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
  AlertTriangle,
} from "lucide-react";
```

`ITEMS` 배열의 `{ href: "/admin/accounts", ... }` 바로 뒤에 추가:

```ts
  { href: "/admin/errors", label: "오류/이슈", icon: AlertTriangle },
```

- [ ] **Step 5: 검증**

이 페이지·컴포넌트들은 다른 admin 페이지(`/admin/booths`, `/admin/timeline` 등)와 마찬가지로 유닛테스트가 없다 — 새로 만들지 않는다.

```bash
npx tsc --noEmit 2>&1 | grep -E "admin/errors|admin/issue-log-list|admin/data-issue-list|admin/admin-nav"
npx vitest run
npx eslint src/app/admin/errors/page.tsx src/components/admin/issue-log-list.tsx src/components/admin/data-issue-list.tsx src/components/admin/admin-nav.tsx
```

- [ ] **Step 6: 수동 확인(선택, 가능하면)**

`npx next dev`로 mock 모드 실행 후 `/admin/errors` 진입 — 탭 전환, 오류 로그 필터 버튼, 데이터 이슈 목록이 정상 렌더되는지 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/app/admin/errors/page.tsx src/components/admin/issue-log-list.tsx src/components/admin/data-issue-list.tsx src/components/admin/admin-nav.tsx
git commit -m "feat(admin): /admin/errors 페이지 — 오류 로그 + 데이터 이슈 2탭

지금까지 서버·클라이언트 오류도, 부스 정보 결측도, 판단 레코드 정합성도
admin에서 확인할 방법이 전혀 없었다. 한 페이지, 두 탭으로 모은다."
```

---

## 자기 점검 결과

- **스펙 커버리지**: 스펙의 5개 아키텍처 항목(저장소·서버 오류·클라이언트 오류·데이터 이슈·admin UI) 모두 Task 1~6에 1:1 대응. "알림 없음"·"데이터 이슈 미저장"·"서버+클라이언트 통합 테이블" 세 확정 사항 모두 Global Constraints에 반영되고 각 태스크 구현이 그대로 따른다.
- **플레이스홀더 스캔**: 없음 — 모든 코드가 실제 파일 경로·실제 함수 시그니처를 참조(Task 1~5에서 정의한 것은 Task 2·6이 정확히 그대로 소비).
- **타입 일관성**: `IssueLog`(Task 1 정의) → Task 2(Supabase 매퍼)·Task 6(`IssueLogList` props) 동일 형태로 소비. `BoothGap`/`NoteInconsistency`(Task 5 정의) → Task 6(`DataIssueList` props) 동일 형태로 소비. `logIssue` 입력 타입이 Task 1(인터페이스 선언)·Task 2(Supabase 구현)·Task 3(`/api/errors` 호출)·Task 4(`instrumentation.ts` 호출)에서 전부 일치.
- **범위 점검**: 6태스크 모두 단일 관심사 + 독립 테스트 가능. Task 1→2(같은 인터페이스, mock→supabase)와 Task 3·4(클라이언트→서버 캡처)는 병렬로 보일 수 있지만 Task 2·3·4 전부 Task 1의 `logIssue`/`IssueLog` 타입에 의존하므로 Task 1이 먼저다. Task 6은 Task 1/2(조회)와 Task 5(계산) 둘 다 필요해 마지막.
