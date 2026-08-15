# Admin 부스 관리 UX 정리 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin 부스 관리를 카드 나열에서 검색·필터·정렬 되는 표로 바꾸고, 편집 폼 위계를 정리하고,
대시보드에 "확인할 것"을 보태고, mock 환경 admin 락아웃 버그와 디자인 시스템 스와치 대비 문제를 고친다.

**Architecture:** 전부 기존 파일 안에서 끝나는 변경. 새 순수 함수 모듈 하나(`booth-filter.ts`, 검색
매칭·자연 정렬)만 추가하고 나머지는 이미 있는 함수(`findBoothEnrichmentGaps`, `groupIssues`,
`findNoteInconsistencies`) 재사용. 새 API·새 DB 스키마 없음.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Tailwind v4, shadcn/ui(Radix), Vitest.

## Global Constraints

- 검증은 매 태스크: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <changed paths>`.
- 새 순수 함수는 반드시 테스트 동반(TDD: 실패하는 테스트 먼저).
- UI 텍스트는 한국어, 기존 톤 유지(반말 아님, 관리자 콘솔은 존댓말 — 기존 코드 그대로 따름).
- Fix 1(표 전환)은 시각적 변경이 커서 마지막에 `run` 스킬로 브라우저 확인 — mock 모드 dev 서버는
  `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= ADMIN_EMAILS= npx next dev`
  (`.env`에 `ADMIN_EMAILS`가 설정돼 있어 빈 값으로 오버라이드 안 하면 Task 1 전까지는 로그인 자체가
  안 된다), `/admin`에서 조직자 코드 `dodecagon` 입력.
- 배경 스펙: `docs/decisions/2026-08-15_admin-booth-management-ux-design.md`.

---

### Task 1: mock 환경 admin 락아웃 버그 수정 (Fix A)

**Files:**
- Modify: `src/lib/env.ts:89-99`
- Modify: `src/lib/api/http.ts:121-129`
- Modify: `src/app/admin/layout.tsx:18-20`

**Interfaces:**
- Produces: `src/lib/env.ts`에 새 export `adminEmailGateActive: boolean` — "이메일 화이트리스트
  게이트가 실제로 유효한가"(이메일 목록도 있고 Supabase도 있어야 함)의 단일 진실 소스. 이후 태스크
  없음(마지막 소비자).

- [ ] **Step 1: `env.ts`에 단일 진실 소스 추가**

`src/lib/env.ts:89-99` 현재:
```ts
/** When set, /admin requires entering this code (organizer gate). Off if unset. */
export const hasOrganizerGate = Boolean(env.ORGANIZER_CODE);

/** 쉼표 구분 문자열 → 정규화된(소문자·trim) 이메일 배열. 빈 값은 걸러낸다. */
export const adminEmailAllowlist: string[] = (env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/** true면 이메일 화이트리스트가 admin 게이트를 맡는다(ORGANIZER_CODE보다 우선). */
export const hasAdminEmailGate = adminEmailAllowlist.length > 0;
```

아래 줄 하나를 `hasAdminEmailGate` 정의 바로 뒤에 추가:
```ts
/** true면 이메일 화이트리스트가 admin 게이트를 맡는다(ORGANIZER_CODE보다 우선). */
export const hasAdminEmailGate = adminEmailAllowlist.length > 0;

/** 이메일 게이트가 실제로 작동 가능한가 — 화이트리스트가 있어도 Supabase(Google
 *  OAuth) 없인 로그인 자체가 불가능하니, 그럴 땐 조직자 코드로 폴백해야 한다.
 *  isAdminAuthed()와 AdminUnlock의 useGoogle 판정이 반드시 이 값 하나를
 *  같이 써야 한다 — 따로 계산하면(예전처럼) 둘이 어긋나 mock 개발에서
 *  admin이 완전히 잠기는 버그가 재발한다(2026-08-15). */
export const adminEmailGateActive = hasAdminEmailGate && hasSupabase;
```

**Step 1 완료 기준**: 파일 저장, 아직 다른 곳에서 안 씀(다음 스텝에서 배선).

- [ ] **Step 2: `isAdminAuthed()`가 새 상수를 쓰도록 수정**

`src/lib/api/http.ts:121-129` 현재:
```ts
export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  if (hasAdminEmailGate) {
    const email = store.get(ADMIN_COOKIE)?.value?.toLowerCase();
    return !!email && adminEmailAllowlist.includes(email);
  }
  if (!env.ORGANIZER_CODE) return true; // gate disabled when unconfigured
  return store.get(ADMIN_COOKIE)?.value === env.ORGANIZER_CODE;
}
```

`hasAdminEmailGate`를 `adminEmailGateActive`로 교체:
```ts
export async function isAdminAuthed(): Promise<boolean> {
  const store = await cookies();
  if (adminEmailGateActive) {
    const email = store.get(ADMIN_COOKIE)?.value?.toLowerCase();
    return !!email && adminEmailAllowlist.includes(email);
  }
  if (!env.ORGANIZER_CODE) return true; // gate disabled when unconfigured
  return store.get(ADMIN_COOKIE)?.value === env.ORGANIZER_CODE;
}
```

파일 상단 import에 `adminEmailGateActive` 추가(이미 `hasAdminEmailGate`, `adminEmailAllowlist` 등을
`@/lib/env`에서 import하고 있는 줄에 이름만 추가).

- [ ] **Step 3: `AdminUnlock` 호출부도 같은 상수를 쓰도록 수정**

`src/app/admin/layout.tsx:18-20` 현재:
```tsx
  if (!(await isAdminAuthed())) {
    return <AdminUnlock useGoogle={hasAdminEmailGate && hasSupabase} />;
  }
```

교체:
```tsx
  if (!(await isAdminAuthed())) {
    return <AdminUnlock useGoogle={adminEmailGateActive} />;
  }
```

import 줄(`import { hasAdminEmailGate, hasSupabase } from "@/lib/env";`)을
`import { adminEmailGateActive } from "@/lib/env";`로 교체(둘 다 이제 안 씀 — grep으로 이 파일
안에서 `hasAdminEmailGate`/`hasSupabase`를 다른 데서도 쓰는지 먼저 확인하고, 안 쓰면 통째로 교체).

- [ ] **Step 4: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/lib/env.ts src/lib/api/http.ts src/app/admin/layout.tsx`
Expected: 에러 없음.

- [ ] **Step 5: 수동 검증 (mock 모드, 브라우저)**

이 로직은 `next/headers`의 `cookies()`(요청 컨텍스트 필요)에 의존해서 유닛 테스트로 격리하기 어렵다
(app-onboarding-gate.ts류의 순수 함수 패턴을 그대로 못 씀) — 대신 실제로 띄워서 확인한다.

```
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev -p 3200
```
(`ADMIN_EMAILS`는 오버라이드하지 않는다 — `.env`의 값이 그대로 살아있는 상태에서 고쳐졌는지 확인하는
게 목적이다.) `/admin` 접속 → "조직자 코드" 입력창이 보이는지(Google 버튼이 아니라) → `dodecagon`
입력 → 대시보드까지 들어가지는지 확인. 확인되면 서버 종료.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/env.ts src/lib/api/http.ts src/app/admin/layout.tsx
git commit -m "fix(admin): mock 환경에서 ADMIN_EMAILS 설정 시 admin 콘솔 완전 락아웃되던 문제

isAdminAuthed()와 AdminUnlock의 useGoogle 판정이 각자 조건을 계산해서 어긋나 있었다
— Supabase 없으면 Google 로그인이 아예 안 뜨는데 게이트는 이메일만 인정해서
로컬 mock 개발에서 admin에 진입할 방법 자체가 없어졌다. 단일 진실 소스
(adminEmailGateActive)로 합쳐 재발을 구조적으로 막는다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: 부스 검색·정렬 순수 함수 + 테스트 (TDD)

**Files:**
- Create: `src/lib/admin/booth-filter.ts`
- Test: `src/lib/admin/booth-filter.test.ts`

**Interfaces:**
- Consumes: `Booth` 타입(`@/lib/types`) — `id`, `name`, `company`, `code?`, `categoryId`.
- Produces: `compareBoothsByCode(a: Booth, b: Booth): number`, `matchesBoothQuery(booth: Booth, query: string): boolean`. Task 3이 이 두 함수를 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/admin/booth-filter.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { compareBoothsByCode, matchesBoothQuery } from "./booth-filter";
import type { Booth } from "@/lib/types";

function makeBooth(overrides: Partial<Booth>): Booth {
  return {
    id: overrides.id ?? "b1",
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: "부스",
    company: "회사",
    description: "",
    longDescription: "",
    images: [],
    tags: [],
    x: 0,
    y: 0,
    ...overrides,
  } as Booth;
}

describe("compareBoothsByCode", () => {
  it("코드를 자연 정렬한다 — C2가 C10보다 앞", () => {
    const c2 = makeBooth({ id: "a", code: "C2" });
    const c10 = makeBooth({ id: "b", code: "C10" });
    expect(compareBoothsByCode(c2, c10)).toBeLessThan(0);
    expect(compareBoothsByCode(c10, c2)).toBeGreaterThan(0);
  });

  it("코드 있는 부스가 코드 없는 부스보다 항상 앞선다", () => {
    const withCode = makeBooth({ id: "a", code: "A01" });
    const noCode = makeBooth({ id: "b", code: undefined, name: "가나다" });
    expect(compareBoothsByCode(withCode, noCode)).toBeLessThan(0);
    expect(compareBoothsByCode(noCode, withCode)).toBeGreaterThan(0);
  });

  it("둘 다 코드 없으면 이름순으로 폴백한다", () => {
    const a = makeBooth({ id: "a", code: undefined, name: "가나" });
    const b = makeBooth({ id: "b", code: undefined, name: "다라" });
    expect(compareBoothsByCode(a, b)).toBeLessThan(0);
  });
});

describe("matchesBoothQuery", () => {
  const booth = makeBooth({
    id: "x",
    name: "고스트북스",
    company: "출판사",
    code: "A101",
  });

  it("이름·회사·코드 중 하나라도 포함하면 매칭한다(대소문자 무시)", () => {
    expect(matchesBoothQuery(booth, "고스트")).toBe(true);
    expect(matchesBoothQuery(booth, "출판")).toBe(true);
    expect(matchesBoothQuery(booth, "a101")).toBe(true);
  });

  it("빈 검색어는 전부 매칭한다", () => {
    expect(matchesBoothQuery(booth, "")).toBe(true);
    expect(matchesBoothQuery(booth, "   ")).toBe(true);
  });

  it("아무 데도 없으면 매칭 안 한다", () => {
    expect(matchesBoothQuery(booth, "없는말")).toBe(false);
  });

  it("코드가 없는 부스에서도 에러 없이 동작한다", () => {
    const noCode = makeBooth({ id: "y", code: undefined });
    expect(matchesBoothQuery(noCode, "아무거나")).toBe(false);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/admin/booth-filter.test.ts`
Expected: FAIL — `Cannot find module './booth-filter'`.

- [ ] **Step 3: 구현**

`src/lib/admin/booth-filter.ts`:
```ts
import type { Booth } from "@/lib/types";

/** 부스 코드 자연 정렬 비교자 — "C2" < "C10"(문자열 비교였다면 반대로 됨,
 *  숫자를 문자로 안 보고 크기로 비교). 코드 있는 부스를 항상 앞에, 그 안에서
 *  자연 정렬. 둘 다 코드 없으면 이름순. 도면 들고 대조하는 관리자 시나리오에서
 *  삽입 순서보다 항상 유리해서 부스 목록 기본 정렬로 쓴다. */
export function compareBoothsByCode(a: Booth, b: Booth): number {
  if (a.code && b.code) {
    return a.code.localeCompare(b.code, "en", {
      numeric: true,
      sensitivity: "base",
    });
  }
  if (a.code && !b.code) return -1;
  if (!a.code && b.code) return 1;
  return a.name.localeCompare(b.name, "ko");
}

/** 이름·회사·코드 중 하나라도 검색어를 포함하면 매칭(대소문자 무시).
 *  빈/공백 검색어는 전부 통과시킨다(필터 없음 상태). */
export function matchesBoothQuery(booth: Booth, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    booth.name.toLowerCase().includes(q) ||
    booth.company.toLowerCase().includes(q) ||
    (booth.code?.toLowerCase().includes(q) ?? false)
  );
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/admin/booth-filter.test.ts`
Expected: PASS, 9개 테스트 전부.

- [ ] **Step 5: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/lib/admin/booth-filter.ts src/lib/admin/booth-filter.test.ts`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/admin/booth-filter.ts src/lib/admin/booth-filter.test.ts
git commit -m "feat(admin): 부스 검색 매칭·자연 정렬 순수 함수 추가

다음 커밋(부스 관리 표 전환)에서 소비할 검색/정렬 로직을 먼저 순수
함수로 분리하고 테스트로 굳힌다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: 부스 관리 — 카드 목록을 표로 전환 + 검색/필터/정렬/완성도 배선 (Fix 1)

**Files:**
- Modify: `src/components/admin/booth-manager.tsx`

**Interfaces:**
- Consumes: `compareBoothsByCode`, `matchesBoothQuery` (Task 2, `@/lib/admin/booth-filter`);
  `findBoothEnrichmentGaps(booths: Booth[]): BoothGap[]` (기존, `@/lib/admin/data-issues`, `BoothGap`
  = `{ boothId: string; boothName: string; missingFields: string[] }`).
- Produces: 없음(최상위 소비자, 화면).

- [ ] **Step 1: import 추가 + 상태 추가**

`src/components/admin/booth-manager.tsx` 상단 import 블록에 추가:
```ts
import { compareBoothsByCode, matchesBoothQuery } from "@/lib/admin/booth-filter";
import { findBoothEnrichmentGaps } from "@/lib/admin/data-issues";
import { Switch } from "@/components/ui/switch";
```
`useState`는 이미 import 되어 있다(`"use client"` 블록의 `import { cloneElement, isValidElement, useId, useRef, useState } from "react";`) — `useMemo`만 추가로 필요하니 그 import 줄에 `useMemo`를 더한다.

`export function BoothManager(...)` 본문, `const catById = ...` 바로 아래에 추가:
```ts
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [onlyGaps, setOnlyGaps] = useState(false);

  const gaps = useMemo(() => findBoothEnrichmentGaps(booths), [booths]);
  const gapByBoothId = useMemo(
    () => new Map(gaps.map((g) => [g.boothId, g])),
    [gaps],
  );

  const filtered = useMemo(() => {
    return booths
      .filter((b) => matchesBoothQuery(b, query))
      .filter((b) => categoryFilter === "all" || b.categoryId === categoryFilter)
      .filter((b) => !onlyGaps || gapByBoothId.has(b.id))
      .sort(compareBoothsByCode);
  }, [booths, query, categoryFilter, onlyGaps, gapByBoothId]);
```

- [ ] **Step 2: 헤더(카운트+검색/필터) 교체**

현재(`:161-166`):
```tsx
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{booths.length}개 부스</p>
        <Button size="sm" onClick={startCreate}>
          <Plus className="size-4" /> 새 부스
        </Button>
      </div>
```

교체:
```tsx
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {filtered.length === booths.length
            ? `${booths.length}개 부스`
            : `${filtered.length} / ${booths.length}개 부스`}
        </p>
        <Button size="sm" onClick={startCreate}>
          <Plus className="size-4" /> 새 부스
        </Button>
      </div>

      {booths.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <Input
            placeholder="이름·회사·코드 검색"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56"
          />
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 카테고리</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            <Switch checked={onlyGaps} onCheckedChange={setOnlyGaps} />
            미비만 보기
          </label>
        </div>
      )}
```

- [ ] **Step 3: 카드 리스트를 표로 교체**

현재(`:168-237`, `{booths.length === 0 ? ... : (<div className="space-y-2">{booths.map(...)}</div>)}`)
전체를 아래로 교체:
```tsx
      {booths.length === 0 ? (
        <EmptyState
          title="부스가 없어요"
          description="첫 부스를 추가해 보세요."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="조건에 맞는 부스가 없어요"
          description="검색어나 필터를 조정해 보세요."
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-secondary/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="w-14 p-2" aria-hidden />
                <th className="p-2 font-semibold">이름 / 회사</th>
                <th className="p-2 font-semibold">카테고리</th>
                <th className="p-2 font-semibold">코드</th>
                <th className="p-2 font-semibold">완성도</th>
                <th className="w-20 p-2" aria-hidden />
              </tr>
            </thead>
            <tbody>
              {filtered.map((b) => {
                const gap = gapByBoothId.get(b.id);
                return (
                  <tr key={b.id} className="border-t border-border">
                    <td className="p-2">
                      {b.images?.[0] ? (
                        <div className="relative size-9 shrink-0 overflow-hidden rounded-md border border-border bg-secondary">
                          <NextImage
                            src={b.images[0]}
                            alt=""
                            fill
                            sizes="36px"
                            className="object-cover"
                            unoptimized
                          />
                        </div>
                      ) : (
                        <div className="size-9 shrink-0 rounded-md border border-dashed border-border" />
                      )}
                    </td>
                    <td className="min-w-0 p-2">
                      <p className="truncate font-bold">{b.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {b.company}
                      </p>
                    </td>
                    <td className="p-2">
                      {catById.get(b.categoryId) && (
                        <CategoryChip category={catById.get(b.categoryId)!} />
                      )}
                    </td>
                    <td className="p-2 text-muted-foreground">
                      {b.code ?? "—"}
                    </td>
                    <td className="p-2">
                      {gap ? (
                        <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive">
                          미비 {gap.missingFields.length}
                        </span>
                      ) : (
                        <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs font-semibold text-success">
                          완료
                        </span>
                      )}
                    </td>
                    <td className="p-2">
                      <div className="flex items-center justify-end gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          aria-label="수정"
                          onClick={() => startEdit(b)}
                        >
                          <Pencil className="size-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" aria-label="삭제">
                              <Trash2 className="size-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>부스 삭제</AlertDialogTitle>
                              <AlertDialogDescription>
                                {`'${b.name}' 부스를 삭제할까요?`}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>취소</AlertDialogCancel>
                              <AlertDialogAction
                                variant="destructive"
                                onClick={() => remove(b)}
                              >
                                삭제
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
```

- [ ] **Step 4: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/components/admin/booth-manager.tsx`
Expected: 에러 없음. (`Card` import가 이제 이 리스트에서 안 쓰이면 — 편집 시트 쪽에서도 `Card`를
안 쓰는지 파일 전체 grep해서, 정말 안 쓰면 import에서 제거. 계속 쓰면 그대로 둔다.)

- [ ] **Step 5: 기존 vitest 전체 통과 확인**

Run: `npx vitest run`
Expected: 기존 테스트 전부 그대로 PASS(이 컴포넌트엔 기존 테스트가 없었다 — 회귀만 확인).

- [ ] **Step 6: 커밋**

```bash
git add src/components/admin/booth-manager.tsx
git commit -m "feat(admin): 부스 관리를 표로 전환 + 검색·필터·정렬·완성도 표시

카드 나열(SIBF 256개 기준 세로 3만px 스크롤)에 검색/필터/정렬이 전혀
없어서 관리자가 부스 하나 찾으려면 매번 전체를 눈으로 훑어야 했다.
표로 바꾸고 이름/회사/코드 검색, 카테고리 필터, 코드 자연 정렬 기본값,
'미비만 보기' 토글(기존 findBoothEnrichmentGaps 재사용)을 더한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: 부스 편집 시트 필드 그룹핑 (Fix 2)

**Files:**
- Modify: `src/components/admin/booth-manager.tsx:239-400` (Sheet 내부)

**Interfaces:**
- Consumes: 없음(같은 파일 안 로컬 변경).
- Produces: 없음.

- [ ] **Step 1: 지도 배치 섹션 펼침 상태를 위한 로컬 state 추가**

`startCreate`/`startEdit` 정의 바로 위, 기존 `const [busy, setBusy] = useState(false);` 아래에 추가:
```ts
  // 지도 배치(좌표·인기도)는 콘텐츠 수정보다 훨씬 드물게 건드린다 — 수정 시엔
  // 접어서 시작해 카피만 고치러 온 사람이 안 보고 지나가게 하고, 생성 시엔
  // 배치가 필수라 펼쳐서 시작한다.
  const [showPlacement, setShowPlacement] = useState(false);
```

`startCreate()` 본문 맨 끝(`setOpen(true);` 바로 앞)에 추가:
```ts
    setShowPlacement(true);
```
`startEdit(b: Booth)` 본문 맨 끝(`setOpen(true);` 바로 앞)에 추가:
```ts
    setShowPlacement(false);
```

- [ ] **Step 2: Sheet 본문에 소제목 + 구분 추가, X/Y/인기도 블록을 접이식으로**

`:244` 바로 아래(`<div className="space-y-3 px-5 py-3">` 다음 줄)에 소제목 삽입:
```tsx
          <div className="space-y-3 px-5 py-3">
            <p className="text-xs font-bold text-muted-foreground">
              기본 정보
            </p>
            <Field label="이미지">
```
(기존 `<Field label="이미지">`로 이어짐 — 그 위에 소제목만 한 줄 추가.)

"회사" `Field`와 "카테고리/홀" `grid` 사이는 그대로 두고(둘 다 기본 정보), "카테고리/홀" 블록
(`:274-309`) 다음, "설명" `Field` (`:310`) 바로 앞에 소제목 삽입:
```tsx
            <p className="pt-2 text-xs font-bold text-muted-foreground">
              콘텐츠
            </p>
            <Field label="설명">
```

"웹사이트 URL" 블록(`:335-363`, `<div className="grid grid-cols-1 gap-3">...</div>`) 바로 뒤,
기존 X/Y/인기도 `grid` 블록(`:364-392`)을 통째로 아래 접이식 블록으로 교체:
```tsx
            <div className="border-t border-border pt-3">
              <button
                type="button"
                onClick={() => setShowPlacement((v) => !v)}
                className="flex w-full items-center justify-between text-xs font-bold text-muted-foreground"
              >
                지도 배치
                <span className="text-muted-foreground">
                  {showPlacement ? "접기" : "펼치기"}
                </span>
              </button>
              {showPlacement && (
                <div className="mt-3 grid grid-cols-3 gap-3">
                  <Field label="X 좌표">
                    <Input
                      type="number"
                      value={draft.x ?? 0}
                      onChange={(e) =>
                        setDraft({ ...draft, x: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="Y 좌표">
                    <Input
                      type="number"
                      value={draft.y ?? 0}
                      onChange={(e) =>
                        setDraft({ ...draft, y: Number(e.target.value) })
                      }
                    />
                  </Field>
                  <Field label="인기도">
                    <Input
                      type="number"
                      value={draft.popularity ?? 50}
                      onChange={(e) =>
                        setDraft({
                          ...draft,
                          popularity: Number(e.target.value),
                        })
                      }
                    />
                  </Field>
                </div>
              )}
            </div>
```

- [ ] **Step 3: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/components/admin/booth-manager.tsx`
Expected: 에러 없음.

- [ ] **Step 4: 수동 검증(브라우저)**

mock 모드로 띄우고(Task 1에서 쓴 명령, `ADMIN_EMAILS=` 오버라이드 불필요 — 이제 코드로 로그인
됨) `/admin/booths`에서 "새 부스"를 누르면 지도 배치가 펼쳐진 채로 시작하는지, 기존 부스 "수정"을
누르면 접힌 채로 시작하고 "펼치기"를 누르면 X/Y/인기도가 나오는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/components/admin/booth-manager.tsx
git commit -m "fix(admin): 부스 편집 시트 필드 위계 정리 — 지도 배치를 접이식으로

필드 15개가 전부 같은 무게로 나열돼 카피만 고치러 온 사람도 X/Y좌표·
인기도를 지나쳐야 했다. 기본정보/콘텐츠/지도배치로 나누고, 지도배치는
수정 시엔 접어서(콘텐츠 수정이 훨씬 흔함) 생성 시엔 펼쳐서(배치가 필수)
시작한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: 대시보드에 "확인할 것" 카드 추가 (Fix 3)

**Files:**
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `repo.listIssues({ sinceDays: 30 })` (기존, `Repository` 인터페이스), `groupIssues(issues: IssueLog[]): IssueGroup[]` (기존, `@/lib/admin/issue-grouping`), `findBoothEnrichmentGaps(booths: Booth[]): BoothGap[]`, `findNoteInconsistencies(notes: BoothNote[]): NoteInconsistency[]` (기존, `@/lib/admin/data-issues`), `repo.listNotesByBoothIds(boothIds: string[])` (기존).
- Produces: 없음(최상위 소비자, 화면).

- [ ] **Step 1: 데이터 계산 추가**

`src/app/admin/page.tsx` import 블록에 추가:
```ts
import { AlertTriangle, Bug } from "lucide-react";
import { groupIssues } from "@/lib/admin/issue-grouping";
import {
  findBoothEnrichmentGaps,
  findNoteInconsistencies,
} from "@/lib/admin/data-issues";
```

`AdminOverviewPage` 본문에서 `let boothCount = 0; let eventCount = 0;` 블록을 아래로 교체(booths를
바깥 스코프로 끌어올려 재사용):
```ts
  let boothCount = 0;
  let eventCount = 0;
  let issueCount = 0;
  let dataIssueCount = 0;
  if (primary) {
    const booths = await repo.listBoothsByExhibitionId(primary.id);
    boothCount = booths.length;
    eventCount = (await repo.listEvents(primary.slug)).length;

    const issues = await repo.listIssues({ sinceDays: 30 });
    issueCount = groupIssues(issues).length;

    const boothIds = booths.map((b) => b.id);
    const notes = await repo.listNotesByBoothIds(boothIds);
    dataIssueCount =
      findBoothEnrichmentGaps(booths).length +
      findNoteInconsistencies(notes).length;
  }
```

- [ ] **Step 2: "확인할 것" 카드 블록 렌더**

기존 `stats.map(...)` 그리드(`{stats.map((s) => (...))}` 블록) 바로 뒤, `<Link href="/admin/analytics">`
블록 앞에 삽입:
```tsx
      <div className="grid grid-cols-2 gap-3">
        <Link href="/admin/errors">
          <Card className="flex items-center gap-3 p-4 transition-transform active:scale-[0.99]">
            <Bug
              className={
                issueCount > 0
                  ? "size-5 shrink-0 text-destructive"
                  : "size-5 shrink-0 text-muted-foreground"
              }
            />
            <div>
              <p className="font-bold">
                {issueCount > 0 ? `오류 ${issueCount}건` : "오류 없음"}
              </p>
              <p className="text-xs text-muted-foreground">최근 30일</p>
            </div>
          </Card>
        </Link>
        <Link href="/admin/errors">
          <Card className="flex items-center gap-3 p-4 transition-transform active:scale-[0.99]">
            <AlertTriangle
              className={
                dataIssueCount > 0
                  ? "size-5 shrink-0 text-warning"
                  : "size-5 shrink-0 text-muted-foreground"
              }
            />
            <div>
              <p className="font-bold">
                {dataIssueCount > 0
                  ? `데이터 이슈 ${dataIssueCount}건`
                  : "데이터 이슈 없음"}
              </p>
              <p className="text-xs text-muted-foreground">
                필수 필드 결측 · 정합성
              </p>
            </div>
          </Card>
        </Link>
      </div>
```

- [ ] **Step 3: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/app/admin/page.tsx`
Expected: 에러 없음.

- [ ] **Step 4: 수동 검증(브라우저)**

mock 모드로 `/admin` 접속 → 통계 카드 아래 "오류 없음"/"데이터 이슈 N건" 카드 두 개가 보이는지(mock
시드엔 enrichment 결측이 실제로 있을 수 있어 0이 아닐 수 있다 — 숫자가 나오면 그대로 정상). 카드
클릭하면 `/admin/errors`로 이동하는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): 대시보드에 오류·데이터 이슈 요약 카드 추가

로그인 직후 첫 화면인데 통계 카드 3개 찍고 끝이라 '지금 뭘 봐야
하는지' 신호가 없었다. 이미 있는 계산(groupIssues, findBoothEnrichmentGaps,
findNoteInconsistencies — 전부 /admin/errors가 쓰던 것)을 그대로
재사용해 요약 카드 두 개만 얹는다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: 디자인 시스템 색상 스와치 대비 수정 (Fix 4)

**Files:**
- Modify: `src/app/admin/design-system/page.tsx:109-119`

**Interfaces:**
- Consumes: 없음.
- Produces: 없음.

- [ ] **Step 1: 스와치 래퍼에 체커보드 배경 추가**

현재:
```tsx
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
```

교체(스와치 바깥에 체커보드 패턴을 깐 래퍼를 추가하고, 실제 색은 그 위에 반투명 없이 그대로 얹는다
— 흰색·거의 흰색 스와치도 체커보드 경계 덕에 크기·모서리가 보인다):
```tsx
          {COLORS.map((c) => (
            <div key={c.varName} className="space-y-1.5">
              <div
                className="h-14 rounded-md border border-border bg-[repeating-conic-gradient(#00000014_0%_25%,transparent_0%_50%)] bg-[length:12px_12px]"
              >
                <div
                  className="size-full rounded-md"
                  style={{ background: `var(${c.varName})` }}
                />
              </div>
              <p className="text-xs font-semibold">{c.name}</p>
              <p className="text-xs text-muted-foreground">{c.varName}</p>
            </div>
          ))}
```

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/app/admin/design-system/page.tsx`
Expected: 에러 없음.

- [ ] **Step 3: 수동 검증(브라우저)**

mock 모드로 `/admin/design-system` 접속 → Primary Foreground·Muted·Accent 등 밝은 톤 스와치가
체커보드 배경 덕에 경계가 보이는지 확인. 라이트/다크 모드 둘 다 확인(다크 모드에서도 체커보드가
과하게 튀지 않는지).

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/design-system/page.tsx
git commit -m "fix(admin): 디자인 시스템 밝은 색상 스와치가 흰 배경과 겹쳐 안 보이던 문제

Primary Foreground·Muted·Accent처럼 흰색에 가까운 토큰은 스와치
테두리만으론 카드 배경과 구분이 안 갔다. 스와치 바깥에 체커보드
배경을 깔아 어떤 색이든 경계가 보이게 한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## 전체 완료 후 최종 검증

```
npx tsc --noEmit
npx vitest run
npx eslint src/lib/env.ts src/lib/api/http.ts src/app/admin/layout.tsx src/lib/admin/booth-filter.ts src/components/admin/booth-manager.tsx src/app/admin/page.tsx src/app/admin/design-system/page.tsx
```
전부 통과하면 `/why` 스킬로 세션 전체 변경 이유를 한 번 더 정리(개별 커밋 메시지에 이미 담았으므로
선택사항).
