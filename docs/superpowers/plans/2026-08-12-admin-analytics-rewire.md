# admin 분석 재배선(파트 A) + 여정 퍼널(2-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin 분석 화면의 죽은 위젯(전환율·인기부스·방문흐름)을 정직한 실제 소스로 재배선하고, 로그인→온보딩→반응→판정→회고 실제 여정 퍼널을 새로 만든다.

**Architecture:** 새 순수 함수 `computeJourneyFunnel`이 `user_signal_log`(Stream B) + 회고(user_brain.visits) 데이터로 5단계 퍼널을 계산한다 — `analyticsConversion`을 이 함수로 완전히 교체한다(기존 `route_plan`/`user_preference` 죽은 소스 제거). `analyticsPopular`는 정적 popularity 조작값을 빼고 실제 `view` 카운트만 쓴다. `analyticsFlow`는 `booth_arrive`(발화 0) 대신 `view`(유일하게 살아있는 이벤트) 시퀀스로 근사한다. UI 위젯은 그대로 두고 데이터 소스만 바꾼다.

**Tech Stack:** Next.js 16(App Router) · TypeScript · Supabase(Postgres) · vitest

## 절대 규칙 (모든 태스크에 적용)

- 방문객이 보는 값과 같은 순수 함수 재사용 원칙 — 이번엔 새 순수 함수(`computeJourneyFunnel`)를 admin 전용으로 만들지만, 입력 데이터(`user_signal_log`)는 방문객 쪽(`listUserSignals` 등)과 같은 테이블·같은 스키마다.
- 집계 쿼리는 전시 스코프 필터를 항상 확인한다 — 기존 `analyticsConversion`의 `user_preference` 전역 카운트 버그(전시 필터 누락)를 반복하지 않는다.
- 퍼널 전환율은 **직전 단계 대비**로 계산한다(기존 `analyticsConversion`은 1단계 대비였다 — "어느 단계에서 새는가"를 보려면 직전 단계 대비가 맞다).
- 새 npm 의존성을 추가하지 않는다.
- 주석은 한국어, 무엇을 하는지가 아니라 왜 그런지를 쓴다.
- 검증 3종은 매 태스크 끝에: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.

---

### Task 1: 여정 퍼널 순수 함수 — `journey-funnel.ts`

**Files:**
- Create: `src/lib/admin/journey-funnel.ts`
- Test: `src/lib/admin/journey-funnel.test.ts`

**Interfaces:**
- Consumes: `UserSignal`(`@/lib/types` — `{userId, exhibitionId, kind: SignalKind, boothCode?, slugs, createdAt}`, 이미 정의됨).
- Produces: `FunnelStage = {stage: string; count: number; rate: number}`. `computeJourneyFunnel(signals: UserSignal[], reflectedUserIds: Set<string>): FunnelStage[]`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/admin/journey-funnel.test.ts` 전체 내용:

```ts
import { describe, expect, it } from "vitest";
import { computeJourneyFunnel } from "./journey-funnel";
import type { UserSignal } from "@/lib/types";

function sig(overrides: Partial<UserSignal> & { userId: string; kind: UserSignal["kind"] }): UserSignal {
  return {
    id: `s_${Math.random()}`,
    exhibitionId: "e1",
    slugs: [],
    createdAt: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("computeJourneyFunnel", () => {
  it("가치 온보딩 신호(boothCode 없는 reaction_must)와 피드 반응(boothCode 있는)을 구분한다", () => {
    const signals: UserSignal[] = [
      // u1: 온보딩만 함(boothCode 없음)
      sig({ userId: "u1", kind: "reaction_must" }),
      // u2: 온보딩 + 실제 부스 반응
      sig({ userId: "u2", kind: "reaction_must" }),
      sig({ userId: "u2", kind: "reaction_curious", boothCode: "A01" }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    const onboarded = result.find((s) => s.stage === "가치 온보딩 완료")!;
    const reacted = result.find((s) => s.stage === "피드 반응")!;
    expect(onboarded.count).toBe(2); // u1, u2 둘 다 온보딩 신호가 있음
    expect(reacted.count).toBe(1); // u2만 실제 부스 반응
  });

  it("판정(verdict_*)과 회고(reflectedUserIds)를 각각 센다", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "reaction_must" }),
      sig({ userId: "u1", kind: "verdict_good", boothCode: "A01" }),
    ];
    const result = computeJourneyFunnel(signals, new Set(["u1"]));
    expect(result.find((s) => s.stage === "현장 판정")!.count).toBe(1);
    expect(result.find((s) => s.stage === "관람 마치기")!.count).toBe(1);
  });

  it("첫 단계(전시 진입)는 신호 종류 무관하게 모든 distinct 사용자", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "search_query" }),
      sig({ userId: "u2", kind: "booth_bookmarked" }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    expect(result.find((s) => s.stage === "전시 진입")!.count).toBe(2);
  });

  it("전환율은 직전 단계 대비다 — 1단계 대비가 아니다", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "reaction_must" }),
      sig({ userId: "u2", kind: "reaction_must" }),
      sig({ userId: "u1", kind: "verdict_good", boothCode: "A01" }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    const judged = result.find((s) => s.stage === "현장 판정")!;
    const reacted = result.find((s) => s.stage === "피드 반응")!;
    // 피드 반응(0명, 아무도 boothCode 있는 반응 안 함) 대비 판정(1명)이면 0으로 나눠지지 않고 0%.
    expect(reacted.count).toBe(0);
    expect(judged.rate).toBe(0);
  });

  it("같은 사용자가 같은 단계 신호를 여러 번 남겨도 1명으로 센다", () => {
    const signals: UserSignal[] = [
      sig({ userId: "u1", kind: "verdict_good", boothCode: "A01" }),
      sig({ userId: "u1", kind: "verdict_ok", boothCode: "A02" }),
    ];
    const result = computeJourneyFunnel(signals, new Set());
    expect(result.find((s) => s.stage === "현장 판정")!.count).toBe(1);
  });

  it("신호도 회고도 없으면 전부 0", () => {
    const result = computeJourneyFunnel([], new Set());
    expect(result.every((s) => s.count === 0)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/admin/journey-funnel.test.ts`
Expected: FAIL — `./journey-funnel` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/lib/admin/journey-funnel.ts` 전체 내용:

```ts
import type { UserSignal } from "@/lib/types";

export interface FunnelStage {
  stage: string;
  count: number;
  /** 직전 단계 대비 비율(%) — 1단계는 100. "어느 단계에서 새는가"를 보려면
   *  1단계 대비가 아니라 직전 단계 대비여야 한다(기존 analyticsConversion의
   *  버그 — admin-analytics-pm-layer 결정 문서 §0). */
  rate: number;
}

function distinctUserIds(signals: UserSignal[]): Set<string> {
  return new Set(signals.map((s) => s.userId));
}

/**
 * 로그인 → 가치 온보딩 → 피드 반응 → 현장 판정 → 회고 5단계 여정 퍼널.
 *
 * "가치 온보딩 완료"와 "피드 반응"은 둘 다 kind가 reaction_must/curious/pass일
 * 수 있어 kind만으로는 못 가른다 — 가치 온보딩 신호(POST /api/me/values →
 * recordSignal)는 boothId 없이 남기므로 boothCode가 없고, 피드에서 실제 부스에
 * 반응하면 항상 boothCode가 있다. 이 차이로 둘을 구분한다.
 */
export function computeJourneyFunnel(
  signals: UserSignal[],
  reflectedUserIds: Set<string>,
): FunnelStage[] {
  const entered = distinctUserIds(signals);
  const onboarded = distinctUserIds(
    signals.filter((s) => s.kind === "reaction_must" && !s.boothCode),
  );
  const reacted = distinctUserIds(
    signals.filter(
      (s) =>
        (s.kind === "reaction_must" ||
          s.kind === "reaction_curious" ||
          s.kind === "reaction_pass") &&
        s.boothCode,
    ),
  );
  const judged = distinctUserIds(
    signals.filter(
      (s) =>
        s.kind === "verdict_good" ||
        s.kind === "verdict_ok" ||
        s.kind === "verdict_bad",
    ),
  );

  const counts = [
    entered.size,
    onboarded.size,
    reacted.size,
    judged.size,
    reflectedUserIds.size,
  ];
  const labels = ["전시 진입", "가치 온보딩 완료", "피드 반응", "현장 판정", "관람 마치기"];

  return labels.map((stage, i) => ({
    stage,
    count: counts[i],
    rate:
      i === 0
        ? 100
        : counts[i - 1] > 0
          ? Number(((counts[i] / counts[i - 1]) * 100).toFixed(1))
          : 0,
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/admin/journey-funnel.test.ts`
Expected: PASS(6개 전부)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "admin/journey-funnel"
npx vitest run
npx eslint src/lib/admin/journey-funnel.ts src/lib/admin/journey-funnel.test.ts
git add src/lib/admin/journey-funnel.ts src/lib/admin/journey-funnel.test.ts
git commit -m "feat(admin): 여정 퍼널 계산 순수 함수 추가

로그인→온보딩→반응→판정→회고 5단계를 user_signal_log에서 집계한다.
가치 온보딩 신호와 피드 반응 신호가 같은 kind를 쓰기 때문에 boothCode
유무로 구분한다. 다음 태스크에서 Repository가 이 함수로 기존 전환율
위젯을 교체한다."
```

---

### Task 2: Mock Repository 재배선

**Files:**
- Modify: `src/lib/mock/repository.ts`
- Test: `src/lib/mock/repository.test.ts`

**Interfaces:**
- Consumes: Task 1의 `computeJourneyFunnel`.
- Produces: `Repository.listReflectedUserIds(exhibitionId: string): Promise<string[]>`(신규, 인터페이스에 추가). `analyticsPopular`/`analyticsFlow`/`analyticsConversion`의 반환 타입은 그대로(값만 바뀜).

- [ ] **Step 1: Repository 인터페이스에 신규 메서드 추가**

`src/lib/repositories/types.ts`의 `getUserBrain`/`saveUserBrain` 선언 근처에 추가:

```ts
  /** 이 전시에서 회고(관람 마치기 → VisitDigest)를 남긴 사용자 id 목록.
   *  여정 퍼널의 마지막 단계 소스. */
  listReflectedUserIds(exhibitionId: string): Promise<string[]>;
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/mock/repository.test.ts` 파일 끝에 추가:

```ts
describe("analytics 재배선", () => {
  it("listReflectedUserIds: visits에 해당 전시가 있는 사용자만", async () => {
    const repo = new MockRepository();
    const detail = await repo.getExhibition("sibf-2026");
    const exhibitionId = detail!.exhibition.id;
    const baseBrain = {
      version: 1,
      updatedAt: "2026-08-12T00:00:00Z",
      literacy: { overall: 0, byTheme: {}, visitsCount: 0, boothsSeenCount: 0 },
      interests: [],
      mutedSlugs: [],
      preferences: {},
      goals: [],
      health: { lastDistilledAt: "2026-08-12T00:00:00Z", decayHalfLifeDays: 30 },
    };
    await repo.saveUserBrain({
      ...baseBrain,
      userId: "u1",
      visits: [
        {
          exhibitionId,
          visitId: "v1",
          date: "2026-08-12",
          boothsVisited: [],
          themesEngaged: [],
          highlights: [],
          summary: "요약",
        },
      ],
    });
    await repo.saveUserBrain({
      ...baseBrain,
      userId: "u2",
      visits: [],
    });
    const ids = await repo.listReflectedUserIds(exhibitionId);
    expect(ids).toEqual(["u1"]);
  });

  it("analyticsPopular: 정적 popularity 가산 없이 실제 view만 센다", async () => {
    const repo = new MockRepository();
    const all = await repo.listBooths("sibf-2026", { limit: 5 });
    const target = all.data[0];
    await repo.recordAnalytics("s1", target.exhibitionId, {
      type: "view",
      boothId: target.id,
    });
    const popular = await repo.analyticsPopular(target.exhibitionId, 5);
    const row = popular.find((p) => p.boothId === target.id)!;
    expect(row.views).toBe(1);
  });

  it("analyticsFlow: booth_arrive 대신 view 시퀀스로 근사한다", async () => {
    const repo = new MockRepository();
    const all = await repo.listBooths("sibf-2026", { limit: 5 });
    const [a, b] = all.data;
    await repo.recordAnalytics("s1", a.exhibitionId, { type: "view", boothId: a.id });
    await repo.recordAnalytics("s1", a.exhibitionId, { type: "view", boothId: b.id });
    const edges = await repo.analyticsFlow(a.exhibitionId);
    expect(edges).toContainEqual({ from: a.id, to: b.id, count: 1 });
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: FAIL — `listReflectedUserIds`가 없고, `analyticsPopular`/`analyticsFlow`가 아직 옛 로직.

- [ ] **Step 4: 구현**

`src/lib/mock/repository.ts`의 `getUserBrain`/`saveUserBrain` 구현(993-997번째 줄 근처) 바로 뒤에 추가:

```ts
  async listReflectedUserIds(exhibitionId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const brain of store().userBrains.values()) {
      if (brain.visits.some((v) => v.exhibitionId === exhibitionId)) {
        ids.push(brain.userId);
      }
    }
    return ids;
  }
```

`analyticsPopular` 구현(1019-1042번째 줄)을 다음으로 교체:

```ts
  async analyticsPopular(exhibitionId: string, limit = 10) {
    // 정적 popularity 가산을 뺐다 — 실제 조회가 없으면 정직하게 0으로 보인다.
    // arrivals는 여전히 booth_arrive 발화가 없어 0이다(구조적 해결 전까지는
    // 그렇게 정직하게 보이는 게 옳다 — admin-analytics-pm-layer §1).
    const booths = store().booths.filter(
      (b) => b.exhibitionId === exhibitionId,
    );
    const an = store().analytics.filter((a) => a.exhibitionId === exhibitionId);
    return booths
      .map((b) => {
        const views = an.filter(
          (a) => a.boothId === b.id && a.type === "view",
        ).length;
        const arrivals = an.filter(
          (a) => a.boothId === b.id && a.type === "booth_arrive",
        ).length;
        return { boothId: b.id, name: b.name, views, arrivals };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }
```

`analyticsFlow` 구현(1044-1067번째 줄)을 다음으로 교체:

```ts
  async analyticsFlow(exhibitionId: string) {
    // booth_arrive는 발화가 없다(동선 제품 제거) — 유일하게 살아있는 view를
    // 같은 세션 안에서 시간순으로 이어 "부스 상세를 연달아 본 흐름"으로
    // 근사한다(admin-analytics-pm-layer §1, 구조적 해결 전까지의 근사).
    const an = store()
      .analytics.filter(
        (a) =>
          a.exhibitionId === exhibitionId && a.type === "view" && a.boothId,
      )
      .sort(
        (a, b) =>
          a.sessionId.localeCompare(b.sessionId) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const edges = new Map<string, number>();
    for (let i = 1; i < an.length; i++) {
      if (an[i].sessionId !== an[i - 1].sessionId) continue;
      if (an[i].boothId === an[i - 1].boothId) continue;
      const key = `${an[i - 1].boothId}→${an[i].boothId}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    return [...edges.entries()].map(([k, count]) => {
      const [from, to] = k.split("→");
      return { from, to, count };
    });
  }
```

`analyticsConversion` 구현(1069-1094번째 줄)을 다음으로 교체:

```ts
  async analyticsConversion(exhibitionId: string) {
    // 죽은 소스(user_preference·route_plan)를 읽던 걸 실제 여정 퍼널로 교체한다
    // (admin-analytics-pm-layer §2-1). Stream B(user_signal_log)가 유일하게
    // "누가 뭘 했는지" 아는 소스다.
    const signals = await this.listExhibitionSignals(exhibitionId);
    const reflected = await this.listReflectedUserIds(exhibitionId);
    return computeJourneyFunnel(signals, new Set(reflected));
  }
```

파일 상단 import 목록에 추가:

```ts
import { computeJourneyFunnel } from "@/lib/admin/journey-funnel";
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: PASS(전체 — 기존 테스트 + 새 3개)

- [ ] **Step 6: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep -E "mock/repository|repositories/types"
npx vitest run
npx eslint src/lib/mock/repository.ts src/lib/mock/repository.test.ts src/lib/repositories/types.ts
git add src/lib/mock/repository.ts src/lib/mock/repository.test.ts src/lib/repositories/types.ts
git commit -m "feat(admin): Mock repository 분석 위젯 재배선

인기부스는 정적 popularity 가산 없이 실제 view만, 방문흐름은 죽은
booth_arrive 대신 view 시퀀스로 근사, 전환율은 여정 퍼널로 완전히
교체한다."
```

---

### Task 3: Supabase Repository 재배선

**Files:**
- Modify: `src/lib/supabase/repository.ts`

**Interfaces:**
- Consumes: Task 1의 `computeJourneyFunnel`. Task 2에서 이미 정의된 `Repository.listReflectedUserIds` 인터페이스.
- Produces: 없음(인터페이스는 이미 Task 2에서 정의됨) — 이 태스크는 Supabase 쪽 구현만 채운다.

- [ ] **Step 1: 구현**

`src/lib/supabase/repository.ts`의 `getUserBrain`/`saveUserBrain` 구현(1820-1840번째 줄 근처) 바로 뒤에 추가:

```ts
  async listReflectedUserIds(exhibitionId: string): Promise<string[]> {
    const db = await this.db();
    // user_brain은 사용자당 한 행, visits는 JSONB 배열이라 DB 단에서 정확히
    // 못 걸러 전부 읽어 앱에서 거른다(다른 analytics 메서드들과 같은 전 스캔
    // 관례 — admin-analytics-pm-layer §1의 집계 성능 항목은 구조적 해결로 미뤄둠).
    const { data } = await db.from("user_brain").select("user_id, data");
    const ids: string[] = [];
    for (const row of (data ?? []) as Row[]) {
      const brain = row.data as UserBrain | null;
      if (brain?.visits?.some((v) => v.exhibitionId === exhibitionId)) {
        ids.push(str(row.user_id));
      }
    }
    return ids;
  }
```

`analyticsPopular` 구현(1858-1883번째 줄)을 다음으로 교체:

```ts
  async analyticsPopular(
    exhibitionId: string,
    limit = 10,
  ): Promise<
    { boothId: string; name: string; views: number; arrivals: number }[]
  > {
    // 정적 popularity 가산을 뺐다 — 실제 조회가 없으면 정직하게 0으로 보인다.
    const booths = await this.listBoothsByExhibitionId(exhibitionId);
    const an = await this._allAnalytics(exhibitionId);
    return booths
      .map((b) => {
        const views = an.filter(
          (a) => a.boothId === b.id && a.type === "view",
        ).length;
        const arrivals = an.filter(
          (a) => a.boothId === b.id && a.type === "booth_arrive",
        ).length;
        return { boothId: b.id, name: b.name, views, arrivals };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }
```

`analyticsFlow` 구현(1885-1906번째 줄)을 다음으로 교체:

```ts
  async analyticsFlow(
    exhibitionId: string,
  ): Promise<{ from: string; to: string; count: number }[]> {
    // booth_arrive는 발화가 없다 — 유일하게 살아있는 view를 같은 세션 안에서
    // 시간순으로 이어 근사한다.
    const all = await this._allAnalytics(exhibitionId);
    const an = all
      .filter((a) => a.type === "view" && a.boothId)
      .sort(
        (a, b) =>
          a.sessionId.localeCompare(b.sessionId) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const edges = new Map<string, number>();
    for (let i = 1; i < an.length; i++) {
      if (an[i].sessionId !== an[i - 1].sessionId) continue;
      if (an[i].boothId === an[i - 1].boothId) continue;
      const key = `${an[i - 1].boothId}→${an[i].boothId}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    return [...edges.entries()].map(([k, count]) => {
      const [from, to] = k.split("→");
      return { from, to, count };
    });
  }
```

`analyticsConversion` 구현(1908-1943번째 줄 근처, `return stages.map(...)`까지 포함해서)을 다음으로 교체:

```ts
  async analyticsConversion(
    exhibitionId: string,
  ): Promise<{ stage: string; count: number; rate: number }[]> {
    // 죽은 소스(user_preference 전역 카운트 — 전시 필터도 없었다·route_plan)를
    // 읽던 걸 실제 여정 퍼널로 교체한다.
    const signals = await this.listExhibitionSignals(exhibitionId);
    const reflected = await this.listReflectedUserIds(exhibitionId);
    return computeJourneyFunnel(signals, new Set(reflected));
  }
```

파일 상단 import 목록에 추가:

```ts
import { computeJourneyFunnel } from "@/lib/admin/journey-funnel";
```

`UserBrain` 타입이 이 파일에 이미 import돼 있는지 확인 — 없으면 `@/lib/types`에서 가져오는 타입 목록에 추가.

- [ ] **Step 2: 검증 + 커밋**

이 파일은 기존에도 유닛테스트가 없다(Supabase 구현 전반이 이 프로젝트에서 테스트 대상이 아니다) — 새로 만들지 않는다.

```bash
npx tsc --noEmit
npx eslint src/lib/supabase/repository.ts
git add src/lib/supabase/repository.ts
git commit -m "feat(admin): Supabase repository 분석 위젯 재배선

Task 2의 Repository 인터페이스·로직을 Supabase 쪽에서 그대로 채운다."
```

---

### Task 4: admin 페이지 위젯 설명 갱신

**Files:**
- Modify: `src/app/admin/analytics/page.tsx`

**Interfaces:**
- Consumes: 없음(기존 `repo.analyticsPopular`/`analyticsFlow`/`analyticsConversion` 호출부는 시그니처 안 바뀜 — 반환값 의미만 바뀜).

- [ ] **Step 1: 구현**

`src/app/admin/analytics/page.tsx`에서 기존:

```tsx
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
```

를 다음으로 교체:

```tsx
      <AdminSection title="인기 부스" description="실제 조회수 기준 상위 부스">
        <PopularChart data={popular} />
      </AdminSection>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSection
          title="방문 흐름"
          description="부스 상세를 연달아 본 흐름(근사치 — 실측 동선 아님)"
        >
          <FlowList edges={edges} names={names} />
        </AdminSection>
        <AdminSection
          title="여정 퍼널"
          description="진입 → 온보딩 → 반응 → 판정 → 회고 (직전 단계 대비 %)"
        >
          <ConversionFunnel funnel={funnel} />
        </AdminSection>
      </div>
```

- [ ] **Step 2: 검증**

이 페이지엔 기존에도 테스트가 없다 — 새로 만들지 않는다.

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/app/admin/analytics/page.tsx
```

- [ ] **Step 3: 수동 확인(선택, 가능하면)**

`npx next dev`로 mock 모드 실행 후 `/admin/analytics`에서 인기부스·방문흐름·여정 퍼널이 정상 렌더되는지 확인.

- [ ] **Step 4: 커밋**

```bash
git add src/app/admin/analytics/page.tsx
git commit -m "feat(admin): 분석 화면 위젯 설명을 실제 동작에 맞게 갱신

'경로 시작/완료'라는 죽은 동선 제품 용어 대신 실제 여정 퍼널 단계를
보여준다. 방문 흐름도 근사치라는 걸 화면에서 밝힌다."
```

---

## 자기 점검 결과

- **스펙 커버리지**: 결정 문서 파트 A의 "전환율 퍼널 재배선"·"인기 부스 재배선"·"방문 흐름 근사"·"죽은 배관 표기/제거"(전환율 위젯에서 user_preference·route_plan 참조 제거로 달성) 및 파트 B의 2-1(여정 퍼널) 모두 Task 1~4에 반영. 파트 B 2-2~2-6, 파트 C, 시계열 공통 셸은 사용자가 이번 패스 범위 밖으로 명시적으로 확정 — 이 계획에 포함하지 않는다.
- **플레이스홀더 스캔**: 없음 — 모든 코드가 실제 파일 경로·실제 함수 시그니처를 참조.
- **타입 일관성**: `FunnelStage`(Task 1 정의) → `analyticsConversion`의 반환 타입과 정확히 일치(기존 시그니처 `{stage,count,rate}[]`를 그대로 만족). `listReflectedUserIds`(Task 2 인터페이스 정의) → Task 3(Supabase 구현)이 동일 시그니처로 구현.
- **범위 점검**: Task 1(순수 함수, 완전 독립) → Task 2(Mock, Task 1 소비) → Task 3(Supabase, Task 1+2 소비) → Task 4(UI 문구, 반환값 의미만 소비) 순서로 각 태스크가 앞 태스크 없이 테스트 불가능하지 않다.
