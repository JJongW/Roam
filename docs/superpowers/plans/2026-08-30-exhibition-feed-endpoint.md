# 전시 피드 API 엔드포인트 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `Roam-ios`가 전시 홈 화면에서 관심 피드를 보여줄 수 있게, 이미 존재하는
`curateFeed`(`src/lib/feed/curate.ts`)를 JSON으로 감싸는 `GET /api/exhibitions/[slug]/feed`
엔드포인트 하나를 추가한다.

**Architecture:** 새 큐레이션 로직 없음 — 웹 페이지(`src/app/(visitor)/exhibitions/[slug]/page.tsx:70-76`)가
이미 하는 `curateFeed(slug, user?.id ?? null, rhythm, locale, brain)` 호출을 라우트
핸들러로 그대로 옮겨 JSON 직렬화만 한다.

**Tech Stack:** Next.js Route Handlers, Vitest(기존 스택 그대로, 신규 의존성 없음).

## Global Constraints

- 응답은 `ok(items)`로 **한 겹만** 감싼다(`{data: [...]}`) — `ok({data: items})`처럼
  두 번 감싸지 않는다. (`src/app/api/exhibitions/[slug]/events/route.ts`가 이 실수를
  하고 있는 기존 버그 — 그 패턴을 따라 하지 말 것. 참고할 정확한 패턴은
  `src/app/api/exhibitions/[slug]/route.ts`의 `return ok(detail);`.)
- `rhythm` 쿼리파라미터가 없거나 `isRhythm()`을 통과 못 하면 `DEFAULT_RHYTHM`으로
  폴백 — 웹 페이지의 `isRhythm(rhythmRaw) ? rhythmRaw : DEFAULT_RHYTHM` 로직 그대로.
- 존재하지 않는 slug면 `notFound("전시를 찾을 수 없습니다")`.
- 로그인 여부는 세션 쿠키로만 판단(`getCurrentUser()`) — 별도 인증 파라미터 없음.
- `FeedItem`/`Grounding`(둘 다 `src/lib/feed/curate.ts`·`src/lib/feed/grounding.ts`에
  이미 존재)에 새 필드를 추가하지 않는다 — 있는 그대로 직렬화.

---

### Task 1: `GET /api/exhibitions/[slug]/feed` 라우트

**Files:**
- Create: `src/app/api/exhibitions/[slug]/feed/route.ts`
- Create: `src/app/api/exhibitions/[slug]/feed/route.test.ts`

**Interfaces:**
- Consumes: `getExhibitionCached`(`@/lib/repositories/cached`), `curateFeed`(`@/lib/feed/curate`),
  `readBrain`(`@/lib/memory/service`), `getI18n`(`@/lib/i18n/server`), `getCurrentUser`(`@/lib/api/session`),
  `DEFAULT_RHYTHM`/`isRhythm`(`@/lib/feed/rhythm`), `ok`/`notFound`(`@/lib/api/http`).
- Produces: `GET /api/exhibitions/[slug]/feed?rhythm=` → `{data: FeedItem[]}`(200) 또는
  `{error: {code: "NOT_FOUND", ...}}`(404). `Roam-ios`의 신규 `FeedRepository`가 이
  응답 모양을 그대로 디코딩한다(iOS 쪽 플랜은 별도).

- [ ] **Step 1: 라우트 핸들러 작성**

```typescript
// src/app/api/exhibitions/[slug]/feed/route.ts
import { getExhibitionCached } from "@/lib/repositories/cached";
import { curateFeed } from "@/lib/feed/curate";
import { readBrain } from "@/lib/memory/service";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/api/session";
import { DEFAULT_RHYTHM, isRhythm } from "@/lib/feed/rhythm";
import { notFound, ok } from "@/lib/api/http";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const detail = await getExhibitionCached(slug);
  if (!detail) return notFound("전시를 찾을 수 없습니다");

  const { searchParams } = new URL(req.url);
  const rhythmRaw = searchParams.get("rhythm") ?? undefined;
  const rhythm = isRhythm(rhythmRaw) ? rhythmRaw : DEFAULT_RHYTHM;

  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  const brain = user ? await readBrain(user.id) : undefined;
  const items = await curateFeed(slug, user?.id ?? null, rhythm, locale, brain);

  return ok(items);
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: 실패하는 테스트 작성**

`getRepository()`를 통해 실제 mock 저장소(다른 라우트 테스트들과 동일 패턴 —
`src/app/api/auth/apple/native/route.test.ts` Step 3 참고, 여기선 `vi.mock` 없이
실제 mock 리포지토리를 그대로 씀)를 쓴다. `curateFeed` 자체의 랭킹 로직은
`curate.test.ts`가 이미 커버하므로, 여기서는 "라우트가 올바른 인자로 올바르게
호출하고 봉투로 감싸는지"만 확인한다:

```typescript
// src/app/api/exhibitions/[slug]/feed/route.test.ts
import { describe, expect, it } from "vitest";
import { getRepository } from "@/lib/repositories";
import { GET } from "./route";

function req(url: string) {
  return new Request(url);
}

describe("GET /api/exhibitions/[slug]/feed", () => {
  it("비로그인이면 개인화 없이 인기순 피드를 준다", async () => {
    const repo = await getRepository();
    const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });
    const slug = exhibitions[0].slug;

    const res = await GET(
      req(`http://localhost/api/exhibitions/${slug}/feed`),
      { params: Promise.resolve({ slug }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.data)).toBe(true);
    // {data: {data: [...]}} 이중 래핑이 아니라 {data: [...]} 한 겹인지 확인.
    expect(body.data.data).toBeUndefined();
  });

  it("rhythm 파라미터가 없거나 잘못된 값이면 기본값(light)으로 동작한다 — 에러 없이 200", async () => {
    const repo = await getRepository();
    const { data: exhibitions } = await repo.listExhibitions({ limit: 1 });
    const slug = exhibitions[0].slug;

    const res = await GET(
      req(`http://localhost/api/exhibitions/${slug}/feed?rhythm=nonsense`),
      { params: Promise.resolve({ slug }) },
    );
    expect(res.status).toBe(200);
  });

  it("존재하지 않는 slug면 404를 준다", async () => {
    const res = await GET(
      req("http://localhost/api/exhibitions/no-such-slug/feed"),
      { params: Promise.resolve({ slug: "no-such-slug" }) },
    );
    expect(res.status).toBe(404);
  });
});
```

이 테스트 파일을 실행하기 전에, mock 저장소 시딩 방식이 다른 라우트 테스트들과
어떻게 다른지 실제로 확인해라(`src/lib/repositories`의 mock 구현체, 또는
`vitest.setup.ts` 유사 파일에서 전시/부스 fixture가 어떻게 준비되는지) — 위
코드는 `repo.listExhibitions({limit: 1})`로 이미 시딩된 전시가 있다고 가정하고
있다. 시딩이 안 돼 있으면 다른 기존 라우트 테스트(예: `src/app/api/exhibitions/route.test.ts`가
있으면 그 파일)의 fixture 준비 패턴을 그대로 따라라 — 새로 지어내지 말 것.

- [ ] **Step 4: 테스트 실행, 통과 확인**

Run: `npx vitest run src/app/api/exhibitions/[slug]/feed/route.test.ts`
Expected: 3개 테스트 전부 PASS.

- [ ] **Step 5: 린트**

Run: `npx eslint src/app/api/exhibitions/[slug]/feed/`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/app/api/exhibitions/[slug]/feed/
git commit -m "feat(feed): GET /api/exhibitions/[slug]/feed 엔드포인트 추가"
```

---

### Task 2: 전체 검증

**Files:** 없음(검증만).

- [ ] **Step 1: 전체 테스트**

Run: `npx vitest run`
Expected: 기존 테스트 전부 + 신규 3개 PASS. 회귀 없음.

- [ ] **Step 2: 타입체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/app/api/exhibitions/[slug]/feed`
Expected: 에러 없음.

- [ ] **Step 3: 완료 보고**

문제 없으면 플랜 완료. `Roam-ios`의 전시 홈 플랜이 이 엔드포인트를 소비한다
(별도 플랜, `Roam-ios/docs/superpowers/plans/2026-08-30-exhibition-home-feed.md`).

## Self-Review 결과

- **스펙 커버리지**: 백엔드 스펙(`docs/superpowers/specs/2026-08-30-exhibition-feed-endpoint-design.md`)
  §2(엔드포인트)→Task 1, §4(검증)→Task 1 Step 3-4 + Task 2.
- **플레이스홀더 스캔**: Task 1 Step 3에 "mock 저장소 시딩 방식을 실제로 확인해라"는
  명시적 지시가 있음 — 플레이스홀더가 아니라 실행자에게 실제 파일을 확인하고 맞는
  fixture 패턴을 쓰라는 지시(정확한 시딩 코드를 지어내지 않기 위한 의도적 처리,
  native-auth-endpoints 플랜의 동일 패턴 참고).
- **타입 일관성**: `FeedItem`/`Grounding`은 기존 타입 재사용, 신규 타입 없음.
- **범위 확인**: 새 큐레이션 로직·재큐레이션 캐싱·판단 기록 엔드포인트는 이 플랜에
  없음 — 스펙 §3에서 의도적으로 범위 밖.
