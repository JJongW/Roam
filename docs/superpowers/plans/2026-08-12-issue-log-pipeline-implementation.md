# 오류/로그 파이프라인 정비 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin "오류/이슈" 화면이 실제로 터지는 오류를 빠짐없이 잡고(지금은 API route 7곳의 처리된 오류가 콘솔에만 찍히고 사라진다), 누가·언제·어디서(기기·국가/도시)·몇 번 겪었는지 한눈에 보여주고, 30일 지난 로그는 admin에서 수동으로 정리할 수 있게 한다.

**Architecture:** 서버 오류 캡처를 `captureServerIssue()` 한 곳으로 모아 `instrumentation.ts`(uncaught)와 `withErrorBoundary`(catch됨) 둘 다 이걸 쓰게 한다. 마스킹·기기 파싱·위치 추출은 순수 함수(`src/lib/admin/issue-capture-parse.ts`)로 분리해 유닛 테스트한다. 중복 오류 묶기·구성요소 분류도 순수 함수(`src/lib/admin/issue-grouping.ts`)로 분리해 이번 세션에 이미 쓴 패턴(`journey-funnel.ts`)을 그대로 따른다. `IssueLog`에 `device`/`country`/`city` 필드를 추가하고, 30일 지난 로그를 지우는 admin 전용 엔드포인트를 새로 만든다.

**Tech Stack:** Next.js 16(App Router) · TypeScript · Zod · Supabase(Postgres) · Vitest. 새 npm 의존성 없음(UA 파싱·지오 정보 전부 자체 파싱 + Vercel이 이미 주는 요청 헤더 사용).

## Global Constraints

- 새 패키지 추가 금지 — UA 파싱은 정규식으로, 위치는 Vercel의 `x-vercel-ip-country`/`x-vercel-ip-city` 요청 헤더로(IP 자체는 절대 저장 안 함).
- 마스킹은 이메일 패턴 + JWT(점 3개 base64)·`Bearer <token>`·`sk-`/`AIza` 접두사만 좁게 — 자체 리소스 ID(`prefix_영숫자`, 예: `booth_abc12345xyz789`)는 마스킹 대상에서 제외한다(디버깅 맥락 보존).
- 보존기간 30일, 삭제는 admin 화면의 수동 버튼으로만(크론 없음).
- 같은 (path, message)는 admin 화면에서 1행으로 묶어 횟수로 표시.
- Mock repository 변경은 유닛 테스트 작성, Supabase repository 변경은 `tsc`/`eslint`만(이 저장소의 기존 관례).
- 로깅 자체가 절대 원 요청에 영향을 주면 안 된다 — 모든 캡처 경로는 실패해도 조용히 넘어간다(throw 금지).
- 매 태스크 종료 시: `npx tsc --noEmit`, `npx vitest run`, `npx eslint <changed paths>`.
- i18n 텍스트 없음(admin 전용 한국어 고정 UI — 이 프로젝트의 admin 화면은 기존에도 i18n 미적용).

---

### Task 1: 순수 함수 — UA 파싱 · 지오 헤더 · 마스킹

**Files:**
- Create: `src/lib/admin/issue-capture-parse.ts`
- Test: `src/lib/admin/issue-capture-parse.test.ts`

**Interfaces:**
- Produces: `parseUserAgent(ua?: string): string | undefined`, `geoFromHeaders(get: (name: string) => string | null): { country?: string; city?: string }`, `redact(text?: string): string | undefined`, `redactContext(ctx?: Record<string, unknown>): Record<string, unknown> | undefined`. Task 5(서버 캡처)·Task 6(클라이언트 캡처)이 이 4개를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/admin/issue-capture-parse.test.ts
import { describe, expect, it } from "vitest";
import {
  parseUserAgent,
  geoFromHeaders,
  redact,
  redactContext,
} from "./issue-capture-parse";

describe("parseUserAgent", () => {
  it("iPhone Safari를 인식한다", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
    expect(parseUserAgent(ua)).toBe("iPhone · Safari");
  });

  it("Windows Chrome을 인식한다", () => {
    const ua =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
    expect(parseUserAgent(ua)).toBe("Windows · Chrome");
  });

  it("Android Chrome을 인식한다", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36";
    expect(parseUserAgent(ua)).toBe("Android · Chrome");
  });

  it("빈 값이면 undefined", () => {
    expect(parseUserAgent(undefined)).toBeUndefined();
    expect(parseUserAgent("")).toBeUndefined();
  });

  it("못 알아보는 UA는 원문 없이 undefined", () => {
    expect(parseUserAgent("curl/8.0")).toBeUndefined();
  });
});

describe("geoFromHeaders", () => {
  it("country·city 헤더를 읽는다", () => {
    const headers: Record<string, string> = {
      "x-vercel-ip-country": "KR",
      "x-vercel-ip-city": "Seoul",
    };
    const get = (name: string) => headers[name] ?? null;
    expect(geoFromHeaders(get)).toEqual({ country: "KR", city: "Seoul" });
  });

  it("헤더가 없으면(로컬 개발) 빈 객체", () => {
    expect(geoFromHeaders(() => null)).toEqual({});
  });

  it("도시만 없을 수도 있다", () => {
    const get = (name: string) =>
      name === "x-vercel-ip-country" ? "KR" : null;
    expect(geoFromHeaders(get)).toEqual({ country: "KR" });
  });
});

describe("redact", () => {
  it("이메일을 마스킹한다", () => {
    expect(redact("failed for foo@bar.com")).toBe("failed for [masked]");
  });

  it("JWT를 마스킹한다", () => {
    const jwt =
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U";
    expect(redact(`token=${jwt}`)).toBe("token=[masked]");
  });

  it("Bearer 토큰을 마스킹한다", () => {
    expect(redact("Authorization: Bearer abc123.def456")).toBe(
      "Authorization: [masked]",
    );
  });

  it("자체 리소스 ID는 마스킹하지 않는다 — 디버깅 맥락 보존", () => {
    expect(redact("booth booth_abc12345xyz789 not found")).toBe(
      "booth booth_abc12345xyz789 not found",
    );
  });

  it("알려진 API 키 접두사를 마스킹한다", () => {
    expect(redact("key=sk-abcdefghijklmnop")).toBe("key=[masked]");
    expect(redact("key=AIzaSyAbCdEfGhIjKlMnOp")).toBe("key=[masked]");
  });

  it("undefined는 undefined", () => {
    expect(redact(undefined)).toBeUndefined();
  });
});

describe("redactContext", () => {
  it("객체 안 문자열 값도 마스킹한다", () => {
    expect(redactContext({ email: "a@b.com", boothId: "booth_xyz123" })).toEqual({
      email: "[masked]",
      boothId: "booth_xyz123",
    });
  });

  it("undefined는 undefined", () => {
    expect(redactContext(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run src/lib/admin/issue-capture-parse.test.ts`
Expected: FAIL — `Cannot find module './issue-capture-parse'`

- [ ] **Step 3: 구현**

```ts
// src/lib/admin/issue-capture-parse.ts
// 서버·클라이언트 오류 캡처가 공통으로 쓰는 순수 함수 — 새 npm 의존성 없음.
// UA 파싱은 흔한 케이스(iPhone/iPad/Android/Mac/Windows × Safari/Chrome/Firefox)만
// 다룬다 — 완전한 UA 파서를 만드는 게 아니라 admin이 "무슨 기기였는지" 감 잡을
// 정도면 충분하다.

const OS_PATTERNS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Macintosh/, "Mac"],
  [/Windows/, "Windows"],
];

const BROWSER_PATTERNS: [RegExp, string][] = [
  // Chrome UA 문자열에 "Safari"도 같이 들어있어서 Chrome을 먼저 검사해야 한다.
  [/Edg\//, "Edge"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];

/** User-Agent → "iPhone · Safari" 같은 표시 문자열. 둘 다 못 찾으면 undefined. */
export function parseUserAgent(ua?: string): string | undefined {
  if (!ua) return undefined;
  const os = OS_PATTERNS.find(([re]) => re.test(ua))?.[1];
  const browser = BROWSER_PATTERNS.find(([re]) => re.test(ua))?.[1];
  if (!os && !browser) return undefined;
  return [os, browser].filter(Boolean).join(" · ");
}

/** Vercel이 모든 요청에 붙이는 지오 헤더를 읽는다. IP는 어디에도 담지 않는다.
 *  로컬 개발(Vercel 아님)에선 헤더가 없어 빈 객체가 나온다. */
export function geoFromHeaders(
  get: (name: string) => string | null,
): { country?: string; city?: string } {
  const country = get("x-vercel-ip-country") ?? undefined;
  const city = get("x-vercel-ip-city") ?? undefined;
  const result: { country?: string; city?: string } = {};
  if (country) result.country = country;
  if (city) result.city = city;
  return result;
}

const EMAIL_RE = /\S+@\S+\.\S+/g;
const JWT_RE = /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_RE = /Bearer\s+\S+/gi;
const API_KEY_RE = /\b(sk-|AIza)\S{10,}\b/g;

/** 이메일·JWT·Bearer 토큰·알려진 API 키 접두사만 좁게 마스킹한다. 자체 리소스
 *  ID(`prefix_영숫자`)는 의도적으로 건드리지 않는다 — 디버깅에 필요한 맥락이다. */
export function redact(text?: string): string | undefined {
  if (!text) return text;
  return text
    .replace(BEARER_RE, "[masked]")
    .replace(JWT_RE, "[masked]")
    .replace(API_KEY_RE, "[masked]")
    .replace(EMAIL_RE, "[masked]");
}

/** context 객체의 문자열 값에 같은 마스킹을 적용한다. 마스킹 자체가 실패해도
 *  원본이 새지 않게 — 문제가 생기면 통째로 대체한다. */
export function redactContext(
  ctx?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!ctx) return ctx;
  try {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(ctx)) {
      out[k] = typeof v === "string" ? redact(v) : v;
    }
    return out;
  } catch {
    return { redacted: true };
  }
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/admin/issue-capture-parse.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/admin/issue-capture-parse.ts src/lib/admin/issue-capture-parse.test.ts
git commit -m "feat(admin): 오류 로그 UA 파싱·지오 헤더·마스킹 순수 함수"
```

---

### Task 2: 순수 함수 — 구성요소 분류 · 중복 묶기

**Files:**
- Create: `src/lib/admin/issue-grouping.ts`
- Test: `src/lib/admin/issue-grouping.test.ts`

**Interfaces:**
- Consumes: `IssueLog`(`src/lib/types/index.ts` — Task 3에서 `device`/`country`/`city` 필드가 추가되지만, 이 태스크는 그 필드들을 안 쓰고 기존 필드만으로 그룹핑하므로 Task 3보다 먼저 진행해도 무방하다).
- Produces: `componentOf(path?: string): string`, `IssueGroup` 타입, `groupIssues(issues: IssueLog[]): IssueGroup[]`. Task 8(admin UI)이 이 둘을 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

```ts
// src/lib/admin/issue-grouping.test.ts
import { describe, expect, it } from "vitest";
import { componentOf, groupIssues } from "./issue-grouping";
import type { IssueLog } from "@/lib/types";

function issue(overrides: Partial<IssueLog> & { message: string }): IssueLog {
  return {
    id: `i_${Math.random()}`,
    source: "server",
    createdAt: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("componentOf", () => {
  it("/admin, /api/admin → 관리자", () => {
    expect(componentOf("/admin/errors")).toBe("관리자");
    expect(componentOf("/api/admin/users")).toBe("관리자");
  });

  it("/login, /auth, /api/auth → 로그인", () => {
    expect(componentOf("/login")).toBe("로그인");
    expect(componentOf("/auth/callback")).toBe("로그인");
    expect(componentOf("/api/auth/me")).toBe("로그인");
  });

  it("/exhibitions/[slug]/map → 지도(피드/전시홈보다 우선)", () => {
    expect(componentOf("/exhibitions/sibf-2026/map")).toBe("지도");
  });

  it("/booths, /api/booths → 부스 상세", () => {
    expect(componentOf("/booths/A01")).toBe("부스 상세");
    expect(componentOf("/api/booths/A01")).toBe("부스 상세");
  });

  it("/exhibitions(map 제외), /api/exhibitions → 피드/전시홈", () => {
    expect(componentOf("/exhibitions/sibf-2026")).toBe("피드/전시홈");
    expect(componentOf("/api/exhibitions/sibf-2026")).toBe("피드/전시홈");
  });

  it("/api/me/* → 컴패니언", () => {
    expect(componentOf("/api/me/reflect")).toBe("컴패니언");
    expect(componentOf("/api/me/values")).toBe("컴패니언");
  });

  it("모르는 경로 → 기타", () => {
    expect(componentOf("/push/subscribe")).toBe("기타");
  });

  it("path 없음 → 기타", () => {
    expect(componentOf(undefined)).toBe("기타");
  });
});

describe("groupIssues", () => {
  it("같은 (path, message)를 묶어 횟수를 센다", () => {
    const issues = [
      issue({ message: "boom", path: "/api/me/reflect", createdAt: "2026-08-12T00:00:00Z" }),
      issue({ message: "boom", path: "/api/me/reflect", createdAt: "2026-08-12T01:00:00Z" }),
      issue({ message: "boom", path: "/api/me/reflect", createdAt: "2026-08-12T02:00:00Z" }),
    ];
    const groups = groupIssues(issues);
    expect(groups).toHaveLength(1);
    expect(groups[0].count).toBe(3);
    expect(groups[0].firstSeenAt).toBe("2026-08-12T00:00:00Z");
    expect(groups[0].lastSeenAt).toBe("2026-08-12T02:00:00Z");
    expect(groups[0].sample.createdAt).toBe("2026-08-12T02:00:00Z"); // 최신 샘플
  });

  it("path나 message가 다르면 따로 묶는다", () => {
    const issues = [
      issue({ message: "boom", path: "/api/me/reflect" }),
      issue({ message: "boom", path: "/api/me/values" }),
      issue({ message: "kaboom", path: "/api/me/reflect" }),
    ];
    expect(groupIssues(issues)).toHaveLength(3);
  });

  it("component가 path 규칙으로 붙는다", () => {
    const groups = groupIssues([issue({ message: "x", path: "/admin/errors" })]);
    expect(groups[0].component).toBe("관리자");
  });

  it("lastSeenAt 내림차순으로 정렬된다", () => {
    const issues = [
      issue({ message: "old", path: "/a", createdAt: "2026-08-10T00:00:00Z" }),
      issue({ message: "new", path: "/b", createdAt: "2026-08-12T00:00:00Z" }),
    ];
    const groups = groupIssues(issues);
    expect(groups[0].message).toBe("new");
    expect(groups[1].message).toBe("old");
  });

  it("빈 배열이면 빈 배열", () => {
    expect(groupIssues([])).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `npx vitest run src/lib/admin/issue-grouping.test.ts`
Expected: FAIL — `Cannot find module './issue-grouping'`

- [ ] **Step 3: 구현**

```ts
// src/lib/admin/issue-grouping.ts
// admin "오류 로그" 탭 전용 순수 함수 — journey-funnel.ts/onboardingValueBreakdown과
// 같은 자리, 같은 이유(repo 구현 두 곳에 로직 중복 안 넣음). repo.listIssues()는
// 원본 그대로 반환하고, 호출부(admin 페이지)가 이 groupIssues()로 묶는다.
import type { IssueLog } from "@/lib/types";

const COMPONENT_RULES: [RegExp, string][] = [
  [/^\/(admin|api\/admin)/, "관리자"],
  [/^\/(login|auth|api\/auth)/, "로그인"],
  [/^\/exhibitions\/[^/]+\/map/, "지도"],
  [/^\/(booths|api\/booths)/, "부스 상세"],
  [/^\/(exhibitions|api\/exhibitions)/, "피드/전시홈"],
  [/^\/api\/me/, "컴패니언"],
];

/** 경로 규칙으로 어느 기능(구성요소)에서 난 오류인지 자동 분류한다. 새 입력 없음. */
export function componentOf(path?: string): string {
  if (!path) return "기타";
  return COMPONENT_RULES.find(([re]) => re.test(path))?.[1] ?? "기타";
}

export interface IssueGroup {
  key: string;
  component: string;
  path?: string;
  message: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  /** 가장 최근 발생 건 — stack/context/device/location/userId 열람용. */
  sample: IssueLog;
}

/** (path, message) 기준으로 묶는다. lastSeenAt 내림차순 정렬. */
export function groupIssues(issues: IssueLog[]): IssueGroup[] {
  const byKey = new Map<string, IssueGroup>();
  for (const issue of issues) {
    const key = `${issue.path ?? ""}::${issue.message}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        component: componentOf(issue.path),
        path: issue.path,
        message: issue.message,
        count: 1,
        firstSeenAt: issue.createdAt,
        lastSeenAt: issue.createdAt,
        sample: issue,
      });
      continue;
    }
    existing.count += 1;
    if (issue.createdAt < existing.firstSeenAt) existing.firstSeenAt = issue.createdAt;
    if (issue.createdAt > existing.lastSeenAt) {
      existing.lastSeenAt = issue.createdAt;
      existing.sample = issue;
    }
  }
  return [...byKey.values()].sort((a, b) =>
    b.lastSeenAt.localeCompare(a.lastSeenAt),
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/admin/issue-grouping.test.ts`
Expected: PASS (13 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/admin/issue-grouping.ts src/lib/admin/issue-grouping.test.ts
git commit -m "feat(admin): 오류 로그 구성요소 분류·중복 묶기 순수 함수"
```

---

### Task 3: 타입 확장 + Mock repository

**Files:**
- Modify: `src/lib/types/index.ts:359-370` (IssueLog interface)
- Modify: `src/lib/repositories/types.ts:150-157` (Repository.logIssue 입력 타입 + 신규 deleteOldIssues)
- Modify: `src/lib/mock/repository.ts` (logIssue 구현부, listIssues 근처에 deleteOldIssues 추가)
- Modify: `src/lib/mock/repository.test.ts:358-387`(기존 `describe("logIssue / listIssues", ...)` 블록에 이어 붙임)

**Interfaces:**
- Consumes: 없음(타입 정의 태스크).
- Produces: `IssueLog.device?/country?/city?: string`, `Repository.logIssue` 입력에 같은 필드, `Repository.deleteOldIssues(olderThanDays: number): Promise<number>`. Task 4(Supabase repo)·Task 5(서버 캡처)·Task 6(클라이언트 캡처)·Task 7(정리 라우트)이 이 타입/메서드를 그대로 쓴다.

- [ ] **Step 1: 타입 확장 — `IssueLog`**

`src/lib/types/index.ts:359-370`을 찾아 다음으로 바꾼다:

```ts
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
  /** parseUserAgent 결과(예: "iPhone · Safari"). 모르면 undefined. */
  device?: string;
  /** Vercel 지오 헤더 기반 — IP 자체는 저장하지 않는다. */
  country?: string;
  city?: string;
  createdAt: string;
}
```

- [ ] **Step 2: Repository 인터페이스 확장**

`src/lib/repositories/types.ts:150-157`을 찾아 다음으로 바꾼다:

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
    device?: string;
    country?: string;
    city?: string;
  }): Promise<void>;
  /** 오류 이벤트 최신순 조회(admin 전용). */
  listIssues(opts?: {
    source?: "server" | "client";
    limit?: number;
  }): Promise<IssueLog[]>;
  /** olderThanDays보다 오래된 로그를 지운다(admin 수동 정리). 반환값 = 삭제된 행 수. */
  deleteOldIssues(olderThanDays: number): Promise<number>;
```

- [ ] **Step 3: 실패하는 테스트 작성 — Mock의 deleteOldIssues**

`src/lib/mock/repository.test.ts:358-387`의 기존 `describe("logIssue / listIssues", ...)`
블록(파일 끝 `});` 바로 앞, 379-386번째 줄의 "limit을 적용한다" 테스트 다음)에 이어
붙인다. 이 파일은 이미 `globalThis.__roamStore`를 직접 조작하는 패턴을 쓴다(247-282번째
줄 `listPendingRetro` 테스트 참고) — 같은 패턴을 그대로 따른다(`store()` export 불필요).

```ts
  it("olderThanDays보다 오래된 것만 지우고 개수를 반환한다", async () => {
    const repo = new MockRepository();
    await repo.logIssue({ source: "server", message: "old-1" });
    await repo.logIssue({ source: "server", message: "old-2" });
    await repo.logIssue({ source: "server", message: "recent-1" });

    // logIssue가 createdAt=지금으로 찍으므로, 테스트에선 store를 직접 조작해
    // 시각을 되돌린다 — 247번째 줄 근방 listPendingRetro 테스트와 같은 패턴.
    const store = (
      globalThis as unknown as {
        __roamStore: { issueLogs: Array<{ message: string; createdAt: string }> };
      }
    ).__roamStore;
    const now = Date.now();
    const old = new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString();
    const recent = new Date(now - 1 * 24 * 60 * 60 * 1000).toISOString();
    const old1 = store.issueLogs.find((i) => i.message === "old-1")!;
    const old2 = store.issueLogs.find((i) => i.message === "old-2")!;
    const recent1 = store.issueLogs.find((i) => i.message === "recent-1")!;
    old1.createdAt = old;
    old2.createdAt = old;
    recent1.createdAt = recent;

    const deleted = await repo.deleteOldIssues(30);
    expect(deleted).toBe(2);

    const remaining = await repo.listIssues();
    expect(remaining.map((i) => i.message)).toEqual(["recent-1"]);
  });

  it("지울 게 없으면 0을 반환한다", async () => {
    const repo = new MockRepository();
    const deleted = await repo.deleteOldIssues(30);
    expect(deleted).toBe(0);
  });
```
(`beforeEach`가 파일 상단(5-7번째 줄)에서 이미 `__roamStore`를 매 테스트마다
리셋하므로 이 블록도 다른 테스트와 격리된다 — 별도 setup 불필요.)

- [ ] **Step 4: 테스트 실행 — 실패 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts -t "deleteOldIssues\|오래된 것만\|지울 게 없으면"`
Expected: FAIL — `repo.deleteOldIssues is not a function`

- [ ] **Step 5: Mock 구현**

`src/lib/mock/repository.ts`의 `logIssue` 메서드(약 935번째 줄 근방, 위 조사에서 확인한
`context: input.context, createdAt: now(),` 블록)를 찾아 새 필드를 같이 저장하도록 바꾼다:

```ts
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
      device: input.device,
      country: input.country,
      city: input.city,
      createdAt: now(),
    });
```

`logIssue` 메서드의 입력 타입 파라미터에도 `device?: string; country?: string; city?: string;`를
추가한다(타입은 이미 `Repository` 인터페이스에서 상속되지만, Mock 클래스가 인터페이스와
별개로 인라인 타입을 쓰고 있다면 그 인라인 타입에도 필드를 더해야 tsc가 통과한다 — 조사
결과 Mock 클래스는 `Repository` 인터페이스를 `implements`하므로 인터페이스만 고치면
tsc가 Mock의 메서드 시그니처 불일치를 컴파일 에러로 잡아준다. 에러가 나면 그 메서드의
파라미터 타입에도 같은 3개 필드를 추가한다).

`listIssues` 메서드 바로 다음(약 962번째 줄 근방)에 새 메서드를 추가한다:

```ts
  async deleteOldIssues(olderThanDays: number): Promise<number> {
    const cutoff = Date.now() - olderThanDays * 24 * 60 * 60 * 1000;
    const before = store().issueLogs.length;
    store().issueLogs = store().issueLogs.filter(
      (i) => new Date(i.createdAt).getTime() >= cutoff,
    );
    return before - store().issueLogs.length;
  }
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: PASS(파일 전체 — 새 테스트 2개 포함, 기존 테스트도 안 깨짐)

- [ ] **Step 7: 전체 검증**

Run: `npx tsc --noEmit && npx vitest run && npx eslint src/lib/types/index.ts src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/mock/repository.test.ts`
Expected: 전부 통과. `tsc`가 `Repository` 인터페이스를 구현하는 다른 곳(Supabase repository)에서
`deleteOldIssues` 누락으로 에러를 낼 것이다 — 그건 정상, Task 4에서 고친다. 이 태스크
완료 기준은 Mock 쪽 tsc 에러가 없는 것과 새 테스트 통과다(Supabase 쪽 tsc 에러는
남아있어도 이 태스크는 완료로 간주하고 다음 태스크로 넘어간다).

- [ ] **Step 8: 커밋**

```bash
git add src/lib/types/index.ts src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/mock/repository.test.ts
git commit -m "feat(admin): IssueLog에 기기·위치 필드 + Mock deleteOldIssues"
```

---

### Task 4: Supabase repository + 마이그레이션

**Files:**
- Create: `supabase/migrations/0037_issue_log_device_geo.sql`
- Modify: `src/lib/supabase/repository.ts` (`mapIssueLog` 함수, `logIssue` 메서드, `listIssues` 다음에 `deleteOldIssues` 추가)

**Interfaces:**
- Consumes: Task 3의 `IssueLog.device/country/city`, `Repository.deleteOldIssues` 시그니처.
- Produces: 없음(구현 완결 태스크) — Task 3에서 남았던 tsc 에러가 여기서 해소된다.

- [ ] **Step 1: 마이그레이션 작성**

```sql
-- 0037: issue_log에 기기·위치 컬럼 추가. IP 자체는 저장하지 않는다 — Vercel의
-- x-vercel-ip-country/x-vercel-ip-city 헤더에서 뽑은 국가/도시만 담는다.
alter table issue_log
  add column if not exists device  text,
  add column if not exists country text,
  add column if not exists city    text;
```
파일: `supabase/migrations/0037_issue_log_device_geo.sql` (이 디렉터리는 `.gitignore`
대상이라 git엔 안 올라간다 — 로컬/운영 Supabase에 직접 적용해야 하는 파일이다. 적용법은
이 저장소의 기존 관례를 따른다: Supabase 대시보드 SQL 에디터에 붙여넣거나 `supabase db push`).

- [ ] **Step 2: `mapIssueLog` 갱신**

`src/lib/supabase/repository.ts`의 `mapIssueLog` 함수(약 354번째 줄)를 찾아 바꾼다:

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
    device: r.device == null ? undefined : str(r.device),
    country: r.country == null ? undefined : str(r.country),
    city: r.city == null ? undefined : str(r.city),
    createdAt: str(r.created_at),
  };
}
```

- [ ] **Step 3: `logIssue` 메서드 갱신**

`logIssue` 메서드(약 1706번째 줄)의 입력 타입과 insert 호출을 바꾼다:

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
    device?: string;
    country?: string;
    city?: string;
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
        device: input.device ?? null,
        country: input.country ?? null,
        city: input.city ?? null,
        created_at: now(),
      });
      loggedWrite(res, "이슈 로그 적재");
    } catch (e) {
      console.error("[repo] 이슈 로그 적재 실패:", e);
    }
  }
```

- [ ] **Step 4: `deleteOldIssues` 추가**

`listIssues` 메서드 바로 다음에 추가한다:

```ts
  async deleteOldIssues(olderThanDays: number): Promise<number> {
    const db = createServiceClient();
    const cutoff = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    const { data } = await db
      .from("issue_log")
      .delete()
      .lt("created_at", cutoff)
      .select("id");
    return data?.length ?? 0;
  }
```

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit`
Expected: PASS — Task 3에서 남았던 "Supabase가 Repository 인터페이스를 구현하지 않음"
에러가 사라진다.

Run: `npx eslint src/lib/supabase/repository.ts`
Expected: PASS

(이 저장소 관례상 Supabase repository엔 유닛 테스트를 붙이지 않는다 — `npx vitest run`은
Task 3의 테스트가 그대로 통과하는지만 재확인한다.)

Run: `npx vitest run`
Expected: 전체 그린(지금까지 태스크의 신규 테스트 포함).

- [ ] **Step 6: 커밋**

```bash
git add supabase/migrations/0037_issue_log_device_geo.sql src/lib/supabase/repository.ts
git commit -m "feat(admin): Supabase issue_log에 기기·위치 컬럼 + deleteOldIssues"
```

(참고: `supabase/migrations/`는 `.gitignore` 대상이라 `git add`해도 실제로는 추적되지
않는다 — 나머지 파일만 커밋에 포함된다. 정상이다.)

---

### Task 5: 서버 오류 캡처 통합 — `captureServerIssue` + `withErrorBoundary` + `instrumentation.ts`

**Files:**
- Create: `src/lib/api/issue-capture.ts`
- Modify: `src/lib/api/http.ts` (`withErrorBoundary` 시그니처 변경)
- Modify: `src/instrumentation.ts` (`captureServerIssue` 사용하도록 교체)
- Modify: `src/app/api/cloudinary/sign/route.ts`
- Modify: `src/app/api/admin/unlock/route.ts`
- Modify: `src/app/api/ai/community-summary/route.ts`
- Modify: `src/app/api/ai/screenshot/route.ts`
- Modify: `src/app/api/ai/booth-summary/route.ts`
- Modify: `src/app/api/community/[postId]/route.ts`
- Modify: `src/app/api/community/[postId]/report/route.ts`

**Interfaces:**
- Consumes: Task 1의 `parseUserAgent`/`geoFromHeaders`/`redact`/`redactContext`, Task 3의 `Repository.logIssue` 확장 필드.
- Produces: `captureServerIssue(input): Promise<void>` — 이 태스크 안에서만 쓰인다(다음
  태스크가 의존하지 않음).

- [ ] **Step 1: `captureServerIssue` 작성**

```ts
// src/lib/api/issue-capture.ts
import { getRepository } from "@/lib/repositories";
import {
  parseUserAgent,
  geoFromHeaders,
  redact,
  redactContext,
} from "@/lib/admin/issue-capture-parse";

/** 서버에서 잡힌 오류(uncaught든 route가 catch했든) 하나를 issue_log에 적재한다.
 *  절대 throw하지 않는다 — 로깅 실패가 원래 요청에 영향을 주면 안 된다.
 *  instrumentation.ts(onRequestError)와 withErrorBoundary 둘 다 이 함수 하나만 쓴다
 *  — 마스킹·기기·위치 파싱 로직을 두 곳에 중복시키지 않는다. */
export async function captureServerIssue(input: {
  error: unknown;
  path: string;
  method?: string;
  headers?: { get(name: string): string | null };
  userId?: string;
  sessionId?: string;
  digest?: string;
}): Promise<void> {
  try {
    const err = input.error instanceof Error
      ? input.error
      : new Error(String(input.error));
    const geo = input.headers
      ? geoFromHeaders((n) => input.headers!.get(n))
      : {};
    const repo = await getRepository();
    await repo.logIssue({
      source: "server",
      message: redact(err.message) ?? err.message,
      stack: redact(err.stack),
      path: input.path,
      digest: input.digest ?? (err as Error & { digest?: string }).digest,
      userId: input.userId,
      sessionId: input.sessionId,
      device: parseUserAgent(input.headers?.get("user-agent") ?? undefined),
      country: geo.country,
      city: geo.city,
      context: redactContext(
        input.method ? { method: input.method } : undefined,
      ),
    });
  } catch (e) {
    // 로깅 자체가 실패해도 원래 요청엔 이미 응답이 나갔다 — 콘솔에만 남긴다.
    console.error("[issue-capture] 서버 오류 캡처 실패:", e);
  }
}
```

- [ ] **Step 2: `instrumentation.ts` 교체**

```ts
// src/instrumentation.ts
/**
 * Next.js가 API route·RSC에서 발생하는 모든 uncaught 서버 예외를 여기로 보낸다
 * (App Router 표준 훅 — Sentry 같은 도구가 쓰는 바로 그 메커니즘). catch된 예외는
 * withErrorBoundary(http.ts)가 별도로 같은 captureServerIssue를 불러 잡는다.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
) {
  const { captureServerIssue } = await import("@/lib/api/issue-capture");
  await captureServerIssue({
    error,
    path: request.path.split("?")[0],
    method: request.method,
    headers: {
      get: (name: string) => request.headers[name.toLowerCase()] ?? null,
    },
  });
}
```

- [ ] **Step 3: `withErrorBoundary` 시그니처 변경**

`src/lib/api/http.ts`의 `withErrorBoundary`(약 163번째 줄)를 바꾼다:

```ts
export function withErrorBoundary(
  req: Request,
  handler: () => Promise<NextResponse>,
) {
  return handler().catch(async (e) => {
    console.error("[api] unhandled", e);
    const { captureServerIssue } = await import("@/lib/api/issue-capture");
    await captureServerIssue({
      error: e,
      path: new URL(req.url).pathname,
      method: req.method,
      headers: req.headers,
    });
    return fail("INTERNAL", "서버 오류가 발생했습니다");
  });
}
```
(동적 `import()`를 쓰는 이유: `http.ts`는 이 저장소의 거의 모든 API route가 가져다 쓰는
저수준 유틸이라, 최상단에서 `issue-capture.ts`(그 자체로 `@/lib/repositories`를 가져옴)를
정적 import하면 순환 의존 위험이 생긴다. `instrumentation.ts`도 같은 이유로 동적 import를
쓴다 — 두 곳의 패턴을 통일한다.)

- [ ] **Step 4: 7개 호출부 업데이트**

각 파일에서 `withErrorBoundary(async () => {` 를 `withErrorBoundary(req, async () => {`로
바꾼다(마지막 파일만 `_req`를 쓴다 — 그 파일은 `withErrorBoundary(_req, async () => {`).

```
src/app/api/cloudinary/sign/route.ts
src/app/api/admin/unlock/route.ts
src/app/api/ai/community-summary/route.ts
src/app/api/ai/screenshot/route.ts
src/app/api/ai/booth-summary/route.ts
src/app/api/community/[postId]/route.ts       ← withErrorBoundary(_req, async () => {
src/app/api/community/[postId]/report/route.ts
```

- [ ] **Step 5: 검증**

Run: `npx tsc --noEmit`
Expected: PASS — 7개 호출부를 안 고치면 "Expected 2 arguments, but got 1" 에러가
난다. 전부 고쳤는지 재확인.

Run: `npx vitest run`
Expected: 전체 그린.

Run: `npx eslint src/lib/api/issue-capture.ts src/lib/api/http.ts src/instrumentation.ts src/app/api/cloudinary/sign/route.ts src/app/api/admin/unlock/route.ts src/app/api/ai/community-summary/route.ts src/app/api/ai/screenshot/route.ts src/app/api/ai/booth-summary/route.ts "src/app/api/community/[postId]/route.ts" "src/app/api/community/[postId]/report/route.ts"`
Expected: PASS

- [ ] **Step 6: 수동 확인**

Mock 모드로 개발 서버를 띄우고(`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev`),
`src/app/api/admin/unlock/route.ts`의 `parseBody` 호출 다음 줄에 임시로 `throw new Error("test-capture")`를
넣고 `POST /api/admin/unlock`를 호출해본 뒤, `/admin/errors`에 이 오류가 뜨는지 확인한다.
확인 후 임시 throw는 반드시 제거한다(커밋 전).

- [ ] **Step 7: 커밋**

```bash
git add src/lib/api/issue-capture.ts src/lib/api/http.ts src/instrumentation.ts \
  src/app/api/cloudinary/sign/route.ts src/app/api/admin/unlock/route.ts \
  src/app/api/ai/community-summary/route.ts src/app/api/ai/screenshot/route.ts \
  src/app/api/ai/booth-summary/route.ts "src/app/api/community/[postId]/route.ts" \
  "src/app/api/community/[postId]/report/route.ts"
git commit -m "fix(admin): withErrorBoundary가 처리한 오류도 issue_log에 남기기"
```

---

### Task 6: 클라이언트 오류 캡처 — UA 전송 + `/api/errors` 갱신

**Files:**
- Modify: `src/lib/schemas/index.ts:232-243` (`errorReportSchema`)
- Modify: `src/app/api/errors/route.ts`
- Modify: `src/components/monitoring/error-reporter.tsx`
- Modify: `src/app/error.tsx`
- Modify: `src/app/global-error.tsx`

**Interfaces:**
- Consumes: Task 1의 `parseUserAgent`/`geoFromHeaders`/`redact`/`redactContext`.
- Produces: 없음(엔드포인트 완결 태스크).

- [ ] **Step 1: 스키마에 `userAgent` 추가**

`src/lib/schemas/index.ts:232-243`을 찾아 바꾼다:

```ts
export const errorReportSchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(8000).optional(),
  path: z.string().max(500).optional(),
  digest: z.string().max(200).optional(),
  userAgent: z.string().max(300).optional(),
  context: z
    .record(z.string(), z.unknown())
    .optional()
    .refine((v) => !v || JSON.stringify(v).length <= 4000, {
      message: "context가 너무 큽니다",
    }),
});
export type ErrorReportInput = z.infer<typeof errorReportSchema>;
```

- [ ] **Step 2: 3개 클라이언트 리포터가 `userAgent`를 실어 보내게**

`src/components/monitoring/error-reporter.tsx`의 `report()` 함수 body에 `userAgent: navigator.userAgent`
추가:
```ts
        body: JSON.stringify({
          message,
          stack,
          path: window.location.pathname,
          userAgent: navigator.userAgent,
        }),
```

`src/app/error.tsx`의 fetch body에도 동일하게 추가:
```ts
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          path:
            typeof window !== "undefined" ? window.location.pathname : undefined,
          digest: error.digest,
          userAgent:
            typeof navigator !== "undefined" ? navigator.userAgent : undefined,
        }),
```

`src/app/global-error.tsx`의 fetch body에도 동일하게 추가:
```ts
        body: JSON.stringify({
          message: error.message,
          stack: error.stack,
          path: window.location.pathname,
          digest: error.digest,
          userAgent: navigator.userAgent,
        }),
```

- [ ] **Step 3: `/api/errors` route가 마스킹·기기·위치를 채워 저장**

```ts
// src/app/api/errors/route.ts
import { getRepository } from "@/lib/repositories";
import { ok, parseBody, getUserId, getSessionId } from "@/lib/api/http";
import { errorReportSchema } from "@/lib/schemas";
import {
  parseUserAgent,
  geoFromHeaders,
  redact,
  redactContext,
} from "@/lib/admin/issue-capture-parse";

// /api 경로는 src/proxy.ts의 로그인 게이트 대상이 아니다(전부 제외) — 이 라우트는
// 진짜로 인증 없이 열려 있다. 방문객 앱 화면은 게이트 뒤에 있지만 이 API 자체는 아니다.
export async function POST(req: Request) {
  const parsed = await parseBody(req, errorReportSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const [userId, sessionId] = await Promise.all([getUserId(), getSessionId()]);
  const geo = geoFromHeaders((n) => req.headers.get(n));
  await repo.logIssue({
    source: "client",
    message: redact(parsed.data.message) ?? parsed.data.message,
    stack: redact(parsed.data.stack),
    path: parsed.data.path,
    digest: parsed.data.digest,
    userId: userId ?? undefined,
    sessionId: sessionId ?? undefined,
    device: parseUserAgent(parsed.data.userAgent),
    country: geo.country,
    city: geo.city,
    context: redactContext(parsed.data.context),
  });
  return ok(null);
}
```

- [ ] **Step 4: 검증**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npx vitest run`
Expected: 전체 그린.

Run: `npx eslint src/lib/schemas/index.ts src/app/api/errors/route.ts src/components/monitoring/error-reporter.tsx src/app/error.tsx src/app/global-error.tsx`
Expected: PASS

- [ ] **Step 5: 커밋**

```bash
git add src/lib/schemas/index.ts src/app/api/errors/route.ts \
  src/components/monitoring/error-reporter.tsx src/app/error.tsx src/app/global-error.tsx
git commit -m "feat(admin): 클라이언트 오류에 기기 정보 포함 + 마스킹"
```

---

### Task 7: 30일 정리 엔드포인트

**Files:**
- Create: `src/app/api/admin/issues/cleanup/route.ts`

**Interfaces:**
- Consumes: Task 3의 `Repository.deleteOldIssues`, 기존 `requireAdmin`/`ok`(`@/lib/api/http`).
- Produces: `POST /api/admin/issues/cleanup` — Task 8(admin UI)이 이 엔드포인트를 호출한다.

- [ ] **Step 1: 라우트 작성**

```ts
// src/app/api/admin/issues/cleanup/route.ts
import { getRepository } from "@/lib/repositories";
import { ok, requireAdmin } from "@/lib/api/http";

const RETENTION_DAYS = 30;

/** 30일 지난 오류 로그를 지운다. 크론 없음 — admin 화면 버튼이 수동으로 부른다. */
export async function POST() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  const deleted = await repo.deleteOldIssues(RETENTION_DAYS);
  return ok({ deleted });
}
```

- [ ] **Step 2: 검증**

Run: `npx tsc --noEmit && npx eslint src/app/api/admin/issues/cleanup/route.ts`
Expected: PASS

- [ ] **Step 3: 커밋**

```bash
git add src/app/api/admin/issues/cleanup/route.ts
git commit -m "feat(admin): 30일 지난 오류 로그 수동 정리 엔드포인트"
```

---

### Task 8: admin UI — 오류 로그 목록 재작성

**Files:**
- Modify: `src/components/admin/issue-log-list.tsx`
- Modify: `src/app/admin/errors/page.tsx`

**Interfaces:**
- Consumes: Task 2의 `groupIssues`/`componentOf`/`IssueGroup`, Task 7의 `POST /api/admin/issues/cleanup`.
- Produces: 없음(최종 UI 태스크).

- [ ] **Step 1: `errors/page.tsx`가 `groupIssues`를 태우도록**

`src/app/admin/errors/page.tsx`를 연다. 지금 `const issues = await repo.listIssues();`
줄을 찾아, 30일 창을 명시하고 그룹핑하도록 바꾼다:

```tsx
import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";
import {
  findBoothEnrichmentGaps,
  findNoteInconsistencies,
} from "@/lib/admin/data-issues";
import { groupIssues } from "@/lib/admin/issue-grouping";
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

  const issues = await repo.listIssues({ limit: 1000 });
  const groups = groupIssues(issues);

  let gaps: ReturnType<typeof findBoothEnrichmentGaps> = [];
  let inconsistencies: ReturnType<typeof findNoteInconsistencies> = [];
  if (exhibition) {
    const booths = await repo.listBoothsByExhibitionId(exhibition.id);
    const boothIds = booths.map((b) => b.id);
    const notes = await repo.listNotesByBoothIds(boothIds);
    gaps = findBoothEnrichmentGaps(booths);
    inconsistencies = findNoteInconsistencies(notes);
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-extrabold">오류/이슈</h1>
        {exhibition && (
          <p className="text-sm text-muted-foreground">{exhibition.name}</p>
        )}
      </header>

      <Tabs defaultValue="logs">
        <TabsList>
          <TabsTrigger value="logs">오류 로그</TabsTrigger>
          <TabsTrigger value="data">데이터 이슈</TabsTrigger>
        </TabsList>
        <TabsContent value="logs">
          <AdminSection
            title="오류 로그"
            description={`묶어서 ${groups.length}건 · 최근 30일`}
          >
            <IssueLogList groups={groups} />
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

- [ ] **Step 2: `issue-log-list.tsx` 재작성**

```tsx
// src/components/admin/issue-log-list.tsx
"use client";

import { useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";
import { toast } from "sonner";
import { api } from "@/lib/api/client";
import { Button } from "@/components/ui/button";
import type { IssueGroup } from "@/lib/admin/issue-grouping";

export function IssueLogList({ groups }: { groups: IssueGroup[] }) {
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [component, setComponent] = useState<string>("all");
  const [cleaning, setCleaning] = useState(false);

  const components = ["all", ...new Set(groups.map((g) => g.component))];
  const filtered =
    component === "all" ? groups : groups.filter((g) => g.component === component);

  async function cleanup() {
    if (cleaning) return;
    setCleaning(true);
    try {
      const { deleted } = await api.post<{ deleted: number }>(
        "/api/admin/issues/cleanup",
      );
      toast.success(`${deleted}건 정리했어요`);
    } catch {
      toast.error("정리에 실패했어요");
    } finally {
      setCleaning(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-1.5">
        {components.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setComponent(c)}
            className={`rounded-lg border px-3 py-1 text-xs font-semibold ${
              component === c
                ? "border-primary bg-primary/10 text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {c === "all" ? "전체" : c}
          </button>
        ))}
        <Button
          variant="outline"
          size="sm"
          className="ml-auto"
          disabled={cleaning}
          onClick={cleanup}
        >
          30일 이전 로그 정리
        </Button>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">기록된 오류가 없어요.</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((g) => (
            <li
              key={g.key}
              className="rounded-xl border border-border bg-card p-3 text-sm"
            >
              <button
                type="button"
                className="flex w-full items-start justify-between gap-2 text-left"
                onClick={() =>
                  setExpandedKey(expandedKey === g.key ? null : g.key)
                }
              >
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                    <span
                      className={`rounded px-1.5 py-0.5 font-semibold ${
                        g.sample.source === "server"
                          ? "bg-destructive/10 text-destructive"
                          : "bg-amber-500/10 text-amber-600"
                      }`}
                    >
                      {g.sample.source === "server" ? "서버" : "클라이언트"}
                    </span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold">
                      {g.component}
                    </span>
                    <span className="rounded bg-secondary px-1.5 py-0.5 font-semibold">
                      {g.count}회
                    </span>
                    <span>
                      {formatDistanceToNow(new Date(g.lastSeenAt), {
                        addSuffix: true,
                        locale: ko,
                      })}
                    </span>
                    {g.path && <span className="truncate">{g.path}</span>}
                  </p>
                  <p className="mt-1 truncate font-medium">{g.message}</p>
                </div>
              </button>
              {expandedKey === g.key && (
                <div className="mt-2 space-y-2 text-xs text-muted-foreground">
                  <p>
                    최초 발생:{" "}
                    {new Date(g.firstSeenAt).toLocaleString("ko-KR")}
                  </p>
                  {(g.sample.device || g.sample.country) && (
                    <p>
                      {[g.sample.device, g.sample.country, g.sample.city]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                  {g.sample.userId && (
                    <p>
                      사용자:{" "}
                      <a
                        href={`/admin/accounts/${g.sample.userId}`}
                        className="underline"
                      >
                        {g.sample.userId}
                      </a>
                    </p>
                  )}
                  {g.sample.context && (
                    <pre className="overflow-x-auto rounded-lg bg-secondary p-2">
                      {JSON.stringify(g.sample.context, null, 2)}
                    </pre>
                  )}
                  {g.sample.stack && (
                    <pre className="overflow-x-auto rounded-lg bg-secondary p-2">
                      {g.sample.stack}
                    </pre>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: 검증**

Run: `npx tsc --noEmit`
Expected: PASS

Run: `npx vitest run`
Expected: 전체 그린.

Run: `npx eslint src/components/admin/issue-log-list.tsx src/app/admin/errors/page.tsx`
Expected: PASS

- [ ] **Step 4: 수동 확인**

Mock 모드로 `npx next dev` 띄우고 `/admin/errors`(운영자 게이트 통과 필요 — mock
모드는 `hasSupabase=false`라 자동으로 코드 게이트로 빠지고, `ORGANIZER_CODE`도
비어있으면 게이트 자체가 꺼져 바로 들어가진다)에서: 필터 칩이 구성요소별로 뜨는지,
"30일 이전 로그 정리" 버튼이 토스트를 띄우는지, 항목을 펼쳤을 때 최신 샘플 정보가
보이는지 확인한다.

- [ ] **Step 5: 커밋**

```bash
git add src/components/admin/issue-log-list.tsx src/app/admin/errors/page.tsx
git commit -m "feat(admin): 오류 로그 UI — 구성요소 필터·중복 묶기·정리 버튼"
```

---

## Self-Review 메모 (계획 작성자 기록 — 실행 시 참고만)

- **스펙 커버리지**: 스펙의 8개 아키텍처 섹션(캡처 완전성/기기/위치/마스킹/스키마/중복+분류/보존삭제/UI)이 Task 5·1·1·1·3+4·2·7·8에 각각 대응 — 전부 태스크가 있다.
- **타입 일관성**: `IssueGroup.sample: IssueLog`, `groupIssues(issues: IssueLog[]): IssueGroup[]`, `captureServerIssue`가 쓰는 필드명(`userId`/`sessionId`/`device`/`country`/`city`)이 Task 3의 `IssueLog`/`Repository.logIssue` 필드명과 전부 일치하는지 재확인함 — 일치.
- **플레이스홀더 없음**: 전 스텝에 실제 코드 포함, "TODO" 없음.
- 원래 스펙의 "51개 라우트" 표현은 조사 결과 부정확해(실제 `withErrorBoundary` 사용처
  7곳) 계획 단계에서 스펙 문서 자체를 정정했다(`docs/superpowers/specs/2026-08-12-issue-log-pipeline-design.md`).
