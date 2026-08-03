# 취향 % 재정의 — 예측 정확도 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로미 필의 "취향 {pct}%"를 접촉량 기반 가짜 진행률에서, 반응(끌림·나중에·별로·가봄 되묻기)이 로미의 예측을 맞혔는지를 재는 실제 정확도로 바꾼다.

**Architecture:** 부스 반응 순간 서버가 그 부스와 사용자 확신 가치의 겹침을 얼려 `booth_note.judged_class`에 저장한다. 정확도는 클라이언트가 계산하지 않고, 매 쓰기 응답에 서버가 계산해 실어 보낸 값을 그대로 표시한다(이중 계산 드리프트 방지). 판정 5개 미만이면 숫자 대신 말로 보여준다.

**Tech Stack:** Next.js 16 App Router, TypeScript, Supabase(Postgres)/MockRepository 이중 구현, zustand, vitest.

## Global Constraints

- 스펙 원문: `docs/superpowers/specs/2026-08-03-taste-accuracy-design.md` — 이 문서와 충돌하면 스펙이 우선.
- **채점표**: 끌림 +1, 나중에 +0.3, 별로(confident) −1 / 별로(uncertain) 0, 가봄+되묻기"끌렸어" +1, 가봄+되묻기"별로"(confident) −1 / (uncertain) 0, 가봄 무응답 = 채점 제외.
- **정확도 = 채점된 판정 점수합 ÷ 판정 수 × 100**, 판정 5개 미만이면 `pct: null`.
- **확신 임계값 0.25** — 기존 `curate.ts`/`progress.ts`가 이미 쓰는 값과 통일.
- **서버가 유일한 진실** — 클라이언트는 자체 공식으로 정확도를 계산하지 않는다. 매 쓰기 응답의 `taste` 필드를 그대로 표시한다.
- **전시별 스코프** — `booth.exhibition_id`로 집계를 거른다.
- **기존 반응은 소급 채점하지 않는다** — `judged_class`가 없는 기존 노트는 판정 집계에서 자연히 빠진다(별도 백필 없음).
- `feed_click`·`search_query`는 정확도에 관여하지 않는다(브레인 관심 가중치에는 계속 반영).
- 이 코드베이스의 테스트 관례: **순수 함수·저장소 계층은 vitest**(`*.test.ts`), **API 라우트·UI는 로컬 mock 서버 + curl/브라우저로 수동 검증**(라우트 단위 테스트 파일이 이 레포에 없음 — 기존 관례를 따른다).
- 커밋은 각 태스크 끝에 한 번씩, 타입체크(`npx tsc --noEmit`)와 관련 vitest가 통과한 뒤에만.

---

## 파일 지도

| 파일 | 역할 |
|---|---|
| `supabase/migrations/0031_booth_note_judgment.sql` (신규) | `booth_note`에 `judged_class`·`retro` 컬럼 |
| `src/lib/memory/taste.ts` (신규) | 순수 채점 로직 — `classifyBooth`·`judgmentScore`·`computeTasteAccuracy` |
| `src/lib/memory/taste.test.ts` (신규) | 위 순수 함수 테스트 |
| `src/lib/types/index.ts` | `BoothNote`에 `judgedClass?`·`retro?` 추가 |
| `src/lib/repositories/types.ts` | `Repository` 인터페이스에 `getBooth`·`getTasteAccuracy`·`setBoothRetro`·`listPendingRetro` 추가, `upsertNote` 시그니처 확장 |
| `src/lib/supabase/repository.ts` | 위 메서드들의 Supabase 구현 + `mapNote` 확장 |
| `src/lib/mock/repository.ts` | 위 메서드들의 Mock 구현 |
| `src/lib/mock/repository.test.ts` | 새 저장소 메서드 테스트 |
| `src/lib/memory/service.ts` | `classifyForUser(booth, userId)` 헬퍼 추가 |
| `src/app/api/me/notes/[boothId]/route.ts` | `judged_class` 계산 + 응답에 `taste` 포함 |
| `src/app/api/me/notes/[boothId]/retro/route.ts` (신규) | 되묻기 답 저장 |
| `src/app/api/me/notes/pending-retro/route.ts` (신규) | 관람 마치기용 미답변 가봄 목록 |
| `src/lib/stores/visit.ts` | `BoothRecord.retro`, `pushNote` 반환 타입, `pushRetro`, `setRetro` |
| `src/lib/stores/companion.ts` | `progress`/`bumpProgress` 제거 → `tasteJudged`/`tastePct`/`setTaste` |
| `src/components/companion/home-companion-context.tsx` | props를 `tasteJudged`/`tastePct`로 교체 |
| `src/app/(visitor)/exhibitions/[slug]/page.tsx` | `tasteProgress(brain)` → `repo.getTasteAccuracy(...)` |
| `src/lib/memory/progress.ts` | 삭제(대체됨) |
| `src/components/companion/companion-bar.tsx` | 배지 표시, 판정 0~4 말 상태, 완료 이벤트 제거 |
| `src/components/feed/reaction-bar.tsx` | `bumpProgress` 감쇠 휴리스틱 제거 → `setTaste` 반영 |
| `src/components/map/visited-retro-inline.tsx` (신규) | 지도 시트의 "여기 어땠어?" 한 줄 |
| `src/components/map/map-view.tsx` | 위 컴포넌트 삽입 |
| `src/components/map/map-coachmark.tsx` | 코치마크 색 설명에 한 줄 추가(문구만, 컴포넌트 변경 없음 — 사전 값만) |
| `src/components/companion/visited-retro-prompt.tsx` (신규) | 관람 마치기 되묻기 일괄 프롬프트 |
| `src/components/companion/finish-visit.tsx` | 위 컴포넌트를 회고 시트 전에 삽입 |
| `src/lib/i18n/dictionaries.ts` | 신규 문구 키(ko/en), `progressLabel`/`progressDone` 제거 |

---

### Task 1: 마이그레이션 — `booth_note`에 판정 컬럼 추가

**Files:**
- Create: `supabase/migrations/0031_booth_note_judgment.sql`

**Interfaces:**
- Produces: DB 컬럼 `booth_note.judged_class text null`, `booth_note.retro text null` — Task 3(저장소 계층)이 이 컬럼을 읽고 쓴다.

이 프로젝트의 `supabase/`는 gitignore라 레포에 커밋되지 않는다(CLAUDE.md). 파일은 로컬에 만들어 두고, **사용자가 Supabase SQL Editor에서 직접 실행**해야 한다 — 이 태스크는 파일 작성까지만이고 실행은 사용자 몫이다(이번 세션의 0029·0030과 동일한 절차).

- [ ] **Step 1: 마이그레이션 파일 작성**

```sql
-- 부스 반응 판정 — "로미의 예측을 사용자가 확인해줬는가"를 채점하기 위한 컬럼.
--
-- judged_class: 반응(또는 되묻기 답) 순간 그 부스가 사용자의 확신 가치와 겹쳤는지를
-- 얼린 값('confident'|'uncertain'). 자신 있다고 한 것만 틀렸을 때 벌점을 주기 위해
-- 판정 시점의 확신도를 보존해야 한다 — 나중에 브레인이 바뀐 뒤 지금 확신도로 과거
-- 반응을 되짚어 채점하면 그 시점엔 없던 지식으로 판정하는 셈이라 왜곡된다.
--
-- retro: '가봄'(visited) 자체는 호불호가 없는 사실 표시라 무판정이다. 나중에 지도
-- 시트나 관람 마치기에서 "여기 어땠어?"에 답하면 그 답이 여기 담긴다
-- ('liked'|'disliked'). 답하지 않으면 null — 채점 집계에서 제외된다.
--
-- 기존에 쌓인 반응(운영 booth_note)은 이 마이그레이션 이후에도 judged_class가
-- null이다 — 소급 채점하지 않는다(설계 문서 참고). 그 부스에 다시 반응해야
-- 채점 대상이 된다.
--
-- 상세: docs/superpowers/specs/2026-08-03-taste-accuracy-design.md

alter table booth_note
  add column if not exists judged_class text,
  add column if not exists retro text;

-- 확인용:
--   select judged_class, retro, count(*) from booth_note group by 1, 2;
```

- [ ] **Step 2: 사용자에게 실행 요청**

이 태스크를 완료로 표시하기 전에, 사용자에게 다음을 요청한다: "`supabase/migrations/0031_booth_note_judgment.sql`을 Supabase SQL Editor에서 실행해줘." 마이그레이션이 실행되지 않아도 **로컬 mock 개발·이후 태스크의 vitest 테스트는 전부 통과한다**(mock 저장소는 SQL을 쓰지 않음) — 다만 운영 배포 전에는 반드시 실행돼야 한다(Task 12에서 다시 확인).

- [ ] **Step 3: 커밋**

```bash
git add supabase/migrations/0031_booth_note_judgment.sql
git commit -m "feat(db): booth_note에 judged_class·retro 컬럼 추가"
```

(주의: `supabase/`가 gitignore이므로 이 `git add`는 아무 것도 스테이징하지 않고 조용히 끝난다 — 정상이다. 파일은 로컬에만 남는다.)

---

### Task 2: 순수 채점 모듈 (`src/lib/memory/taste.ts`)

**Files:**
- Create: `src/lib/memory/taste.ts`
- Test: `src/lib/memory/taste.test.ts`

**Interfaces:**
- Consumes: `Booth`(`@/lib/types`) — `id`·`tags`·`valueTags`. `UserBrain`(`@/lib/types`) — `interests: InterestNode[]`(각 `key: string`·`confidence: number`). `interestScore(booth: Booth, interests: string[], weights?): number`(`@/lib/engine/scoring`).
- Produces:
  - `export type JudgedClass = "confident" | "uncertain"`
  - `export function classifyBooth(booth: Booth, brain: UserBrain): JudgedClass`
  - `export function judgmentScore(status: BoothNote["status"], judgedClass: JudgedClass | null | undefined, retro: BoothNote["retro"]): number | null`
  - `export interface TasteAccuracy { judgedCount: number; pct: number | null }`
  - `export const INSIGHT_THRESHOLD = 5`
  - `export function computeTasteAccuracy(notes: { status: BoothNote["status"]; judgedClass: JudgedClass | null | undefined; retro: BoothNote["retro"] }[]): TasteAccuracy`
  - Task 3(저장소)·Task 4(라우트)가 이 함수들을 그대로 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/memory/taste.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import {
  classifyBooth,
  computeTasteAccuracy,
  INSIGHT_THRESHOLD,
  judgmentScore,
} from "./taste";
import { emptyBrain } from "./distill";
import type { Booth, UserBrain } from "@/lib/types";

function booth(valueTags: { slug: string; strength: number }[]): Booth {
  return {
    id: "b1",
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name: "테스트 부스",
    company: "테스트",
    description: "",
    longDescription: "",
    images: [],
    tags: valueTags.map((v) => v.slug),
    valueTags,
    x: 0,
    y: 0,
    popularity: 0,
    createdAt: "",
  };
}

function brainWith(interests: { key: string; confidence: number }[]): UserBrain {
  const b = emptyBrain("u1");
  return {
    ...b,
    interests: interests.map((i) => ({
      key: i.key,
      label: i.key,
      confidence: i.confidence,
      signals: { explicit: 0, implicit: 0, negative: 0 },
      firstSeenAt: "",
      lastSeenAt: "",
      trend: "flat" as const,
    })),
  };
}

describe("classifyBooth", () => {
  it("부스 가치가 확신 가치(0.25 이상)와 겹치면 confident", () => {
    const b = booth([{ slug: "discovery", strength: 0.8 }]);
    const brain = brainWith([{ key: "discovery", confidence: 0.4 }]);
    expect(classifyBooth(b, brain)).toBe("confident");
  });

  it("겹치는 확신 가치가 없으면 uncertain", () => {
    const b = booth([{ slug: "rest", strength: 0.8 }]);
    const brain = brainWith([{ key: "discovery", confidence: 0.4 }]);
    expect(classifyBooth(b, brain)).toBe("uncertain");
  });

  it("확신 가치가 임계값(0.25) 미만이면 uncertain — 아직 확신이 아니다", () => {
    const b = booth([{ slug: "discovery", strength: 0.8 }]);
    const brain = brainWith([{ key: "discovery", confidence: 0.1 }]);
    expect(classifyBooth(b, brain)).toBe("uncertain");
  });

  it("브레인이 비어 있으면(온보딩 직후) 모든 부스가 uncertain", () => {
    const b = booth([{ slug: "discovery", strength: 0.8 }]);
    expect(classifyBooth(b, emptyBrain("u1"))).toBe("uncertain");
  });
});

describe("judgmentScore", () => {
  it("끌림은 확신도와 무관하게 +1", () => {
    expect(judgmentScore("interested", "confident", undefined)).toBe(1);
    expect(judgmentScore("interested", "uncertain", undefined)).toBe(1);
  });

  it("나중에는 확신도와 무관하게 +0.3", () => {
    expect(judgmentScore("later", "confident", undefined)).toBe(0.3);
    expect(judgmentScore("later", "uncertain", undefined)).toBe(0.3);
  });

  it("별로는 confident일 때만 -1, uncertain이면 0(벌점 없음)", () => {
    expect(judgmentScore("skipped", "confident", undefined)).toBe(-1);
    expect(judgmentScore("skipped", "uncertain", undefined)).toBe(0);
  });

  it("가봄은 되묻기 답이 없으면 채점 제외(null)", () => {
    expect(judgmentScore("visited", "confident", undefined)).toBeNull();
    expect(judgmentScore("visited", null, undefined)).toBeNull();
  });

  it("가봄 + 되묻기 답은 별로와 같은 규칙(긍정 +1, 부정은 confident일 때만 -1)", () => {
    expect(judgmentScore("visited", "confident", "liked")).toBe(1);
    expect(judgmentScore("visited", "uncertain", "liked")).toBe(1);
    expect(judgmentScore("visited", "confident", "disliked")).toBe(-1);
    expect(judgmentScore("visited", "uncertain", "disliked")).toBe(0);
  });

  it("상태 없음(해제)은 채점 제외", () => {
    expect(judgmentScore(undefined, null, undefined)).toBeNull();
  });
});

describe("computeTasteAccuracy", () => {
  it("판정이 임계값 미만이면 pct는 null이어도 judgedCount는 정확하다", () => {
    const notes = [
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "skipped" as const, judgedClass: "confident" as const, retro: undefined },
    ];
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(2);
    expect(r.pct).toBeNull();
    expect(INSIGHT_THRESHOLD).toBe(5);
  });

  it("판정 5개, 4개 맞춤 1개 틀림(confident) → 80%", () => {
    const notes = [
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "skipped" as const, judgedClass: "confident" as const, retro: undefined },
    ];
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(5);
    expect(r.pct).toBe(80);
  });

  it("가봄(무응답)은 judgedCount에 안 들어간다", () => {
    const notes = [
      { status: "interested" as const, judgedClass: "confident" as const, retro: undefined },
      { status: "visited" as const, judgedClass: null, retro: undefined },
    ];
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(1);
  });

  it("uncertain 별로 5개(전부 벌점 없음, 0점)는 50%", () => {
    const notes = Array.from({ length: 5 }, () => ({
      status: "skipped" as const,
      judgedClass: "uncertain" as const,
      retro: undefined,
    }));
    const r = computeTasteAccuracy(notes);
    expect(r.pct).toBe(50);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/memory/taste.test.ts`
Expected: FAIL — `Cannot find module './taste'` (파일이 아직 없음).

- [ ] **Step 3: 구현 작성**

`src/lib/memory/taste.ts`:

```typescript
// L4 메모리 — 로미가 예측한 취향을 사용자가 확인해준 정도(정확도). 순수·결정론,
// I/O 없음. "취향 %"는 여기서 나온다: 반응이 로미의 예측을 맞혔는지 채점한다.
//
// 채점 규칙: 자신 있다고 한 것만 틀렸을 때 깎인다. 부스가 사용자의 확신 가치(브레인
// confidence≥0.25)와 겹치면 confident, 아니면 uncertain — uncertain 부스는 맞으면
// 가산되고 틀려도 무해하다(낯선 부스를 찔러보는 탐색에 벌점을 주지 않는다).
import { interestScore } from "@/lib/engine/scoring";
import { boothValueSlugs } from "@/lib/values";
import type { Booth, BoothNote, UserBrain } from "@/lib/types";

export type JudgedClass = "confident" | "uncertain";

/** curate.ts·progress.ts와 같은 "확신 관심" 임계값. */
const CONFIDENT_THRESHOLD = 0.25;

/** 부스가 사용자의 확신 가치와 겹치는지 — 판정 시점에 얼려서 저장한다. */
export function classifyBooth(booth: Booth, brain: UserBrain): JudgedClass {
  const confidentSlugs = brain.interests
    .filter((n) => n.confidence >= CONFIDENT_THRESHOLD)
    .map((n) => n.key);
  return interestScore(booth, confidentSlugs) > 0 ? "confident" : "uncertain";
}

/**
 * 반응/되묻기 답 → 채점 점수. 채점 대상이 아니면 null(가봄 무응답).
 * status만으로 못 정하는 값(가봄의 되묻기 답)은 retro가 따로 결정한다.
 */
export function judgmentScore(
  status: BoothNote["status"],
  judgedClass: JudgedClass | null | undefined,
  retro: BoothNote["retro"],
): number | null {
  switch (status) {
    case "interested":
      return 1;
    case "later":
      return 0.3;
    case "skipped":
      return judgedClass === "confident" ? -1 : 0;
    case "visited":
      if (retro === "liked") return 1;
      if (retro === "disliked") return judgedClass === "confident" ? -1 : 0;
      return null; // 안 답함
    default:
      return null; // 해제(undefined)
  }
}

export interface TasteAccuracy {
  /** 채점 대상이 된 반응 수(전시 스코프). */
  judgedCount: number;
  /** 0~100. 판정이 임계값 미만이면 거짓 정밀도를 피하려고 null(말로만 표시). */
  pct: number | null;
}

/** 판정 5개 미만이면 숫자 대신 말로 보여준다(companion-bar.tsx). */
export const INSIGHT_THRESHOLD = 5;

/** 노트 목록(이미 전시로 스코프됨) → 정확도. 순수 집계, I/O 없음. */
export function computeTasteAccuracy(
  notes: {
    status: BoothNote["status"];
    judgedClass: JudgedClass | null | undefined;
    retro: BoothNote["retro"];
  }[],
): TasteAccuracy {
  const scores = notes
    .map((n) => judgmentScore(n.status, n.judgedClass, n.retro))
    .filter((s): s is number => s !== null);
  const judgedCount = scores.length;
  if (judgedCount < INSIGHT_THRESHOLD) return { judgedCount, pct: null };
  const sum = scores.reduce((a, b) => a + b, 0);
  // 점수 범위 -1..+1을 0..100으로: -1→0%, 0→50%, +1→100%.
  const pct = Math.round(((sum + judgedCount) / (2 * judgedCount)) * 100);
  return { judgedCount, pct: Math.max(0, Math.min(100, pct)) };
}
```

주의: `boothValueSlugs` import는 이 파일에서 직접 쓰지 않는다(`interestScore` 내부에서 씀) — import 목록에서 `boothValueSlugs`를 빼고 `interestScore`만 남긴다. 실제 파일에는 `boothValueSlugs` import 줄을 넣지 않는다(위 코드 블록에 있는 `import { boothValueSlugs } from "@/lib/values";` 줄은 **삭제**하고 진행할 것 — lint의 no-unused-vars에 걸린다).

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/memory/taste.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: 타입체크 + lint**

Run: `npx tsc --noEmit && npx eslint src/lib/memory/taste.ts src/lib/memory/taste.test.ts`
Expected: 에러 없음(unused-vars 등 warning도 없어야 함 — 위 주의사항대로 `boothValueSlugs` import 제거 확인).

- [ ] **Step 6: 커밋**

```bash
git add src/lib/memory/taste.ts src/lib/memory/taste.test.ts
git commit -m "feat(memory): 취향 정확도 순수 채점 모듈 추가"
```

---

### Task 3: 저장소 계층 — `getBooth`·`getTasteAccuracy`·`setBoothRetro`·`listPendingRetro`·`upsertNote` 확장

**Files:**
- Modify: `src/lib/types/index.ts` (`BoothNote`에 필드 추가)
- Modify: `src/lib/repositories/types.ts` (`Repository` 인터페이스)
- Modify: `src/lib/supabase/repository.ts`
- Modify: `src/lib/mock/repository.ts`
- Test: `src/lib/mock/repository.test.ts`

**Interfaces:**
- Consumes: Task 2의 `JudgedClass`·`TasteAccuracy`·`computeTasteAccuracy`(`@/lib/memory/taste`).
- Produces:
  - `Repository.getBooth(id: string): Promise<Booth | null>`
  - `Repository.getTasteAccuracy(userId: string, exhibitionId: string): Promise<TasteAccuracy>`
  - `Repository.setBoothRetro(userId: string, boothId: string, retro: "liked" | "disliked", judgedClass: JudgedClass): Promise<BoothNote | null>`
  - `Repository.listPendingRetro(userId: string, exhibitionId: string, limit: number): Promise<{ boothId: string; boothName: string }[]>`
  - `Repository.upsertNote(userId: string, boothId: string, input: BoothNoteInput, judgedClass: JudgedClass | null | undefined): Promise<BoothNote>` — 4번째 인자 추가(기존 3-인자 호출부는 Task 4에서 갱신).
  - `BoothNote.judgedClass?: JudgedClass`, `BoothNote.retro?: "liked" | "disliked"` — Task 4·5가 이 필드를 읽는다.

- [ ] **Step 1: `BoothNote` 타입에 필드 추가**

`src/lib/types/index.ts`의 기존 블록(약 280~289행)을 수정:

```typescript
/** A signed-in visitor's personal record for a booth (반응 / 메모 / 사진). */
export interface BoothNote {
  userId: string;
  boothId: string;
  /** 부스 반응 네 가지. 0029 이전엔 visited|skipped만 서버에 남았다. */
  status?: "visited" | "skipped" | "interested" | "later";
  /** 이 반응 판정 시점의 확신 등급 — 취향 정확도 채점용(0031). visited 자체는
   *  무판정이라 되묻기 전엔 null/undefined일 수 있다. */
  judgedClass?: "confident" | "uncertain";
  /** '가봄'에 대한 뒤늦은 호불호 답('여기 어땠어?'). visited일 때만 의미 있다. */
  retro?: "liked" | "disliked";
  memo?: string;
  /** Personal photos (Cloudinary URLs) attached to this booth note. */
  photos?: string[];
  updatedAt: string;
}
```

- [ ] **Step 2: `Repository` 인터페이스 확장**

`src/lib/repositories/types.ts`의 booth notes 섹션(약 163~173행)을 수정:

```typescript
  // booth notes (signed-in personal records)
  listNotes(userId: string): Promise<BoothNote[]>;
  upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
    /** 이 쓰기의 확신 등급. interested·later·skipped·해제(status=null)일 때만 준다.
     *  undefined면 저장소가 judged_class·retro를 건드리지 않는다(visited·메모 편집 등
     *  status 자체의 판정 의미가 없는 쓰기) — 그래야 메모만 고칠 때 이미 답한 되묻기가
     *  조용히 지워지지 않는다. */
    judgedClass: "confident" | "uncertain" | null | undefined,
  ): Promise<BoothNote>;
  /** 부스 하나(가벼운 조회 — 목록 컬럼 + enrichment). getBoothDetail과 달리
   *  리뷰·이벤트·웰컴키트는 안 읽는다. 반응 판정 시 확신도 대조에 쓴다. */
  getBooth(id: string): Promise<Booth | null>;
  /** 전시 스코프 취향 정확도. */
  getTasteAccuracy(userId: string, exhibitionId: string): Promise<TasteAccuracy>;
  /** '가봄' 되묻기 답 저장. status가 'visited'인 기존 노트에만 적용 — 없으면 null
   *  (호출부가 400 처리). */
  setBoothRetro(
    userId: string,
    boothId: string,
    retro: "liked" | "disliked",
    judgedClass: "confident" | "uncertain",
  ): Promise<BoothNote | null>;
  /** 'visited'이면서 아직 되묻기에 답 안 한 부스(관람 마치기용, 최대 limit개). */
  listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]>;
  /** Every visitor memo for booths in this exhibition (boothId + memo text).
   *  Powers crowd-sourced keyword extraction for onboarding. */
  listExhibitionNotes(
    exhibitionId: string,
  ): Promise<{ boothId: string; memo: string }[]>;
```

파일 상단 import 블록에 `TasteAccuracy` 타입을 추가:

```typescript
import type { TasteAccuracy } from "@/lib/memory/taste";
```

(기존 `import type { AnalyticsEvent, Booth, ... } from "@/lib/types";` 블록과는 별도 줄로 추가 — `TasteAccuracy`는 `@/lib/types`가 아니라 `@/lib/memory/taste`에서 온다.)

- [ ] **Step 3: Supabase 구현**

`src/lib/supabase/repository.ts`의 `mapNote` 함수(약 350~364행)를 수정:

```typescript
function mapNote(r: Row): BoothNote {
  return {
    userId: str(r.user_id),
    boothId: str(r.booth_id),
    // 값 목록의 진실은 BoothStatus와 0029의 체크 제약이다 — 여기서 좁게 캐스팅하면
    // 새 상태(interested·later)가 타입상 없는 값처럼 보인다(런타임엔 그대로 흐른다).
    status:
      r.status == null
        ? undefined
        : (String(r.status) as BoothNote["status"]),
    judgedClass:
      r.judged_class == null
        ? undefined
        : (String(r.judged_class) as BoothNote["judgedClass"]),
    retro:
      r.retro == null ? undefined : (String(r.retro) as BoothNote["retro"]),
    memo: r.memo == null ? undefined : String(r.memo),
    photos: Array.isArray(r.photos) ? r.photos.map(String) : undefined,
    updatedAt: str(r.updated_at),
  };
}
```

`upsertNote` 메서드(약 1174~1207행)를 수정:

```typescript
  async upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
    judgedClass: "confident" | "uncertain" | null | undefined,
  ): Promise<BoothNote> {
    const db = await this.db();
    const status = input.status ?? null;
    const memo = input.memo ?? null;
    const photos = input.photos ?? [];
    // Empty note → delete so the gallery/back-end stays clean.
    if (!status && (memo == null || !memo.trim()) && photos.length === 0) {
      maybeWrote(
        await db
          .from("booth_note")
          .delete()
          .eq("user_id", userId)
          .eq("booth_id", boothId),
        "메모 삭제",
      );
      return { userId, boothId, updatedAt: now() };
    }
    const row: Row = {
      user_id: userId,
      booth_id: boothId,
      status,
      memo,
      photos,
      updated_at: now(),
    };
    // status가 확신·부정 반응(interested·later·skipped)이거나 해제일 때만 판정을
    // 새로 쓴다. visited(가봄)나 메모만 고치는 쓰기는 judged_class·retro를 SET
    // 절에서 아예 뺀다 — upsert가 명시 안 한 컬럼은 충돌 시(기존 행 업데이트) 그대로
    // 두는 성질을 그대로 이용한다. 안 그러면 이미 답한 되묻기가 메모 수정 한 번에
    // 조용히 지워진다.
    if (judgedClass !== undefined) {
      row.judged_class = judgedClass;
      row.retro = null;
    }
    const res = await db
      .from("booth_note")
      .upsert(row, { onConflict: "user_id,booth_id" })
      .select("*")
      .single();
    return mapNote(wrote(res, "메모 저장") as Row);
  }

  async getBooth(id: string): Promise<Booth | null> {
    const db = await this.db();
    const { data } = await db
      .from("booth")
      .select(BOOTH_LIST_COLS)
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const booth = mapBooth(data as Row);
    const { data: enrichRow } = await db
      .from("booth_enrichment")
      .select("*")
      .eq("booth_id", id)
      .maybeSingle();
    if (enrichRow) attachEnrichment(booth, enrichRow as Row);
    return booth;
  }

  async getTasteAccuracy(
    userId: string,
    exhibitionId: string,
  ): Promise<TasteAccuracy> {
    const db = await this.db();
    const { data: booths } = await db
      .from("booth")
      .select("id")
      .eq("exhibition_id", exhibitionId);
    const ids = (booths ?? []).map((b) => str((b as Row).id));
    if (ids.length === 0) return { judgedCount: 0, pct: null };
    const { data } = await db
      .from("booth_note")
      .select("status, judged_class, retro")
      .eq("user_id", userId)
      .in("booth_id", ids);
    return computeTasteAccuracy(
      (data ?? []).map((r) => ({
        status:
          (r as Row).status == null
            ? undefined
            : (String((r as Row).status) as BoothNote["status"]),
        judgedClass:
          (r as Row).judged_class == null
            ? null
            : (String((r as Row).judged_class) as JudgedClass),
        retro:
          (r as Row).retro == null
            ? undefined
            : (String((r as Row).retro) as BoothNote["retro"]),
      })),
    );
  }

  async setBoothRetro(
    userId: string,
    boothId: string,
    retro: "liked" | "disliked",
    judgedClass: "confident" | "uncertain",
  ): Promise<BoothNote | null> {
    const db = await this.db();
    const res = await db
      .from("booth_note")
      .update({ retro, judged_class: judgedClass, updated_at: now() })
      .eq("user_id", userId)
      .eq("booth_id", boothId)
      .eq("status", "visited")
      .select("*")
      .maybeSingle();
    const data = maybeWrote(res, "되묻기 저장");
    return data ? mapNote(data as Row) : null;
  }

  async listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]> {
    const db = await this.db();
    const { data: booths } = await db
      .from("booth")
      .select("id, name")
      .eq("exhibition_id", exhibitionId);
    const nameById = new Map(
      (booths ?? []).map((b) => [str((b as Row).id), str((b as Row).name)]),
    );
    if (nameById.size === 0) return [];
    const { data } = await db
      .from("booth_note")
      .select("booth_id")
      .eq("user_id", userId)
      .eq("status", "visited")
      .is("retro", null)
      .in("booth_id", [...nameById.keys()])
      .limit(limit);
    return (data ?? [])
      .map((r) => str((r as Row).booth_id))
      .filter((id) => nameById.has(id))
      .map((id) => ({ boothId: id, boothName: nameById.get(id)! }));
  }
```

파일 상단 import 블록에 추가:

```typescript
import {
  classifyBooth,
  computeTasteAccuracy,
  type JudgedClass,
  type TasteAccuracy,
} from "@/lib/memory/taste";
```

(`classifyBooth`는 이 파일에서 직접 쓰지 않는다 — Task 4의 `classifyForUser`가 쓴다. import 목록에서 `classifyBooth`는 **빼고** `computeTasteAccuracy`·`JudgedClass`·`TasteAccuracy`만 남긴다.)

- [ ] **Step 4: Mock 구현**

`src/lib/mock/repository.ts`의 `upsertNote` 메서드(약 696~724행)를 수정:

```typescript
  async upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
    judgedClass: "confident" | "uncertain" | null | undefined,
  ): Promise<BoothNote> {
    const s = store();
    let n = s.notes.find((x) => x.userId === userId && x.boothId === boothId);
    if (!n) {
      n = {
        userId,
        boothId,
        status: input.status ?? undefined,
        memo: input.memo,
        photos: input.photos,
        judgedClass: judgedClass === undefined ? undefined : (judgedClass ?? undefined),
        updatedAt: now(),
      };
      s.notes.push(n);
    } else {
      if (input.status !== undefined) n.status = input.status ?? undefined;
      if (input.memo !== undefined) n.memo = input.memo;
      if (input.photos !== undefined) n.photos = input.photos;
      // Supabase 구현과 같은 규칙: judgedClass가 undefined면 판정 필드를 안 건드린다.
      if (judgedClass !== undefined) {
        n.judgedClass = judgedClass ?? undefined;
        n.retro = undefined;
      }
      n.updatedAt = now();
    }
    // Drop empty notes so the store stays compact.
    if (!n.status && !n.memo?.trim() && !n.photos?.length) {
      s.notes = s.notes.filter((x) => x !== n);
    }
    return n;
  }

  async getBooth(id: string): Promise<Booth | null> {
    const s = store();
    return s.booths.find((b) => b.id === id) ?? null;
  }

  async getTasteAccuracy(
    userId: string,
    exhibitionId: string,
  ): Promise<TasteAccuracy> {
    const s = store();
    const boothIds = new Set(
      s.booths.filter((b) => b.exhibitionId === exhibitionId).map((b) => b.id),
    );
    const notes = s.notes.filter(
      (n) => n.userId === userId && boothIds.has(n.boothId),
    );
    return computeTasteAccuracy(notes);
  }

  async setBoothRetro(
    userId: string,
    boothId: string,
    retro: "liked" | "disliked",
    judgedClass: "confident" | "uncertain",
  ): Promise<BoothNote | null> {
    const s = store();
    const n = s.notes.find(
      (x) =>
        x.userId === userId && x.boothId === boothId && x.status === "visited",
    );
    if (!n) return null;
    n.retro = retro;
    n.judgedClass = judgedClass;
    n.updatedAt = now();
    return n;
  }

  async listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]> {
    const s = store();
    const byId = new Map(
      s.booths
        .filter((b) => b.exhibitionId === exhibitionId)
        .map((b) => [b.id, b.name]),
    );
    return s.notes
      .filter(
        (n) =>
          n.userId === userId &&
          n.status === "visited" &&
          !n.retro &&
          byId.has(n.boothId),
      )
      .slice(0, limit)
      .map((n) => ({ boothId: n.boothId, boothName: byId.get(n.boothId)! }));
  }
```

파일 상단 import 블록에 추가:

```typescript
import { computeTasteAccuracy, type TasteAccuracy } from "@/lib/memory/taste";
```

- [ ] **Step 5: 실패하는 테스트 작성**

`src/lib/mock/repository.test.ts`에 다음 케이스를 추가(파일 끝, 기존 `describe("MockRepository", ...)` 블록 안):

```typescript
  it("getBooth: 존재하면 부스를, 없으면 null을 돌려준다", async () => {
    const b = await repo.getBooth("b_a101");
    expect(b).not.toBeNull();
    expect(b!.id).toBe("b_a101");
    expect(await repo.getBooth("no_such_booth")).toBeNull();
  });

  it("upsertNote: judgedClass가 undefined면 기존 판정을 안 건드린다", async () => {
    await repo.upsertNote(
      "u_taste",
      "b_a101",
      { status: "interested" },
      "confident",
    );
    // 메모만 고친다 — 판정은 그대로여야 한다.
    await repo.upsertNote(
      "u_taste",
      "b_a101",
      { status: "interested", memo: "다시 와보기" },
      undefined,
    );
    const notes = await repo.listNotes("u_taste");
    const n = notes.find((x) => x.boothId === "b_a101");
    expect(n?.judgedClass).toBe("confident");
    expect(n?.memo).toBe("다시 와보기");
  });

  it("getTasteAccuracy: 판정 5개 미만이면 pct는 null, judgedCount는 정확", async () => {
    await repo.upsertNote(
      "u_taste2",
      "b_a101",
      { status: "interested" },
      "confident",
    );
    const r = await repo.getTasteAccuracy("u_taste2", "exh_sibf_2026");
    expect(r.judgedCount).toBe(1);
    expect(r.pct).toBeNull();
  });

  it("setBoothRetro: visited가 아니면 null(되묻기 답 거부)", async () => {
    await repo.upsertNote(
      "u_taste3",
      "b_a101",
      { status: "interested" },
      "confident",
    );
    const result = await repo.setBoothRetro(
      "u_taste3",
      "b_a101",
      "liked",
      "confident",
    );
    expect(result).toBeNull();
  });

  it("setBoothRetro: visited면 retro·judgedClass를 저장한다", async () => {
    await repo.upsertNote(
      "u_taste4",
      "b_a101",
      { status: "visited" },
      undefined,
    );
    const result = await repo.setBoothRetro(
      "u_taste4",
      "b_a101",
      "liked",
      "uncertain",
    );
    expect(result?.retro).toBe("liked");
    expect(result?.judgedClass).toBe("uncertain");
  });

  it("listPendingRetro: visited이고 retro 없는 부스만, limit 적용", async () => {
    await repo.upsertNote(
      "u_taste5",
      "b_a101",
      { status: "visited" },
      undefined,
    );
    await repo.upsertNote(
      "u_taste5",
      "b_a1902",
      { status: "visited" },
      undefined,
    );
    const pending = await repo.listPendingRetro(
      "u_taste5",
      "exh_sibf_2026",
      10,
    );
    expect(pending.length).toBe(2);
    expect(pending.every((p) => p.boothName.length > 0)).toBe(true);
  });
```

- [ ] **Step 6: 테스트 실행 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: PASS — 기존 케이스 + 새 6개 케이스 전부.

(이 단계는 "실패 먼저 확인" 없이 구현+테스트를 같이 작성했다 — Step 3·4의 구현이 이미 끝난 상태에서 테스트를 추가하는 흐름이라, 여기서는 통과를 바로 확인한다. 만약 실패한다면 Step 3·4의 구현 오타를 먼저 의심할 것.)

- [ ] **Step 7: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음. (아직 Task 4에서 `upsertNote` 호출부를 안 고쳤으므로, 기존 3-인자 호출(`src/app/api/me/notes/[boothId]/route.ts`)이 타입 에러를 낼 것이다 — **이건 정상**, Task 4에서 고친다. 이 태스크에서는 저장소 파일 자체(`src/lib/supabase/repository.ts`, `src/lib/mock/repository.ts`, `src/lib/repositories/types.ts`, `src/lib/types/index.ts`)에 에러가 없는지만 확인:)

Run: `npx tsc --noEmit 2>&1 | grep -v "notes/\[boothId\]/route.ts"`
Expected: 빈 출력.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/types/index.ts src/lib/repositories/types.ts \
  src/lib/supabase/repository.ts src/lib/mock/repository.ts \
  src/lib/mock/repository.test.ts
git commit -m "feat(repo): 부스 판정·정확도 저장소 메서드 추가"
```

---

### Task 4: API 라우트 — 반응 쓰기에 판정 포함, 되묻기·미답변 목록 엔드포인트

**Files:**
- Modify: `src/app/api/me/notes/[boothId]/route.ts`
- Create: `src/app/api/me/notes/[boothId]/retro/route.ts`
- Create: `src/app/api/me/notes/pending-retro/route.ts`
- Modify: `src/lib/memory/service.ts`

**Interfaces:**
- Consumes: Task 2의 `classifyBooth`(`@/lib/memory/taste`), Task 3의 `repo.getBooth`·`repo.getTasteAccuracy`·`repo.setBoothRetro`·`repo.listPendingRetro`·`repo.upsertNote(…, judgedClass)`, 기존 `repo.listNotes(userId)`(상태 변경 여부 판단용 — PUT이 기존 상태와 비교해야 메모만 고치는 쓰기에서 이미 얼린 판정을 안 건드린다).
- Produces:
  - `PUT /api/me/notes/[boothId]` 응답이 `{ note: BoothNote; taste: TasteAccuracy }`로 확장(기존 `{ note }`에서 확장 — 호환 유지).
  - `POST /api/me/notes/[boothId]/retro { liked: boolean }` → `{ note: BoothNote | null; taste: TasteAccuracy }`. `note`가 null이면 해당 부스가 visited가 아니었다는 뜻(400은 아니고 조용히 무시 — 지도 시트가 낙관적으로 이미 사라졌을 가능성).
  - `GET /api/me/notes/pending-retro?exhibitionSlug=X&limit=5` → `{ pending: { boothId: string; boothName: string }[] }`.
  - `classifyForUser(booth: Booth, userId: string): Promise<JudgedClass>`(`@/lib/memory/service`) — Task 5(클라이언트)는 안 씀, 이 라우트들만 소비.

- [ ] **Step 1: `classifyForUser` 헬퍼 추가**

`src/lib/memory/service.ts`의 `readBrain` 함수 바로 아래(약 82행 이후)에 추가:

```typescript
/** 이 부스가 지금 사용자의 확신 가치와 겹치는지 — 반응 판정 등급에 쓴다. */
export async function classifyForUser(
  booth: Booth,
  userId: string,
): Promise<JudgedClass> {
  const brain = await readBrain(userId);
  return classifyBooth(booth, brain);
}
```

파일 상단 import에 추가:

```typescript
import { classifyBooth, type JudgedClass } from "@/lib/memory/taste";
import type { Booth } from "@/lib/types";
```

(`Booth`가 이미 다른 타입과 함께 import돼 있다면 그 목록에 합친다 — 중복 import 줄을 만들지 않는다.)

- [ ] **Step 2: `PUT /api/me/notes/[boothId]` 확장**

`src/app/api/me/notes/[boothId]/route.ts` 전체를 다음으로 교체:

```typescript
import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { recordSignal, classifyForUser } from "@/lib/memory/service";
import { boothNoteInputSchema } from "@/lib/schemas";
import type { JudgedClass } from "@/lib/memory/taste";
import type { SignalKind } from "@/lib/types";

type Ctx = { params: Promise<{ boothId: string }> };

/** 상태 → 신호 종류. 상태 해제(null)는 신호를 남기지 않는다. */
const SIGNAL_BY_STATUS: Record<string, SignalKind | undefined> = {
  visited: "booth_visited",
  skipped: "booth_skipped",
  interested: "reaction_interested",
  later: "reaction_later",
};

/** 이 상태 값이 확신·부정 반응이면 true — 상태가 실제로 "바뀔 때"만 판정을 새로
 *  계산한다(호출부에서 statusChanged와 함께 쓴다). 상태가 그대로인데(메모만 고치는
 *  쓰기 등) 여기 걸리면, 이미 얼려둔 judged_class를 지금 브레인 상태로 조용히
 *  재채점하게 된다 — "판정은 그 순간에 얼린다"는 원칙을 메모 편집 한 번으로 깨뜨리는
 *  것이다. visited(가봄)는 무판정(되묻기 전엔) — 그 자체로는 재계산 대상이 아니다. */
function needsJudgment(status: string | null | undefined): boolean {
  return status === "interested" || status === "later" || status === "skipped";
}

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { boothId } = await params;
  const parsed = await parseBody(req, boothNoteInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();

  const status = parsed.data.status ?? null;
  // 이 쓰기가 상태를 실제로 바꾸는지 먼저 확인한다 — 안 그러면 메모만 고치는 쓰기
  // (status는 그대로 보내지는데 memo만 다른 PUT, 예: 부스 상세의 메모 편집)에서도
  // 매번 judged_class가 지금 브레인으로 재계산돼 이미 확정된 판정이 조용히 바뀐다.
  const existing = (await repo.listNotes(user.id)).find(
    (n) => n.boothId === boothId,
  );
  const statusChanged = (existing?.status ?? null) !== status;

  let judgedClass: JudgedClass | null | undefined;
  if (statusChanged) {
    if (needsJudgment(status)) {
      const booth = await repo.getBooth(boothId);
      judgedClass = booth ? await classifyForUser(booth, user.id) : null;
    } else if (!status) {
      judgedClass = null; // 해제 — 판정도 지운다
    } // else: status === "visited"로 새로 바뀜 → undefined로 남겨 무판정 유지.
  } // else: 상태 불변(메모/사진만 편집) → undefined, 기존 판정을 안 건드린다.

  const note = await repo.upsertNote(user.id, boothId, parsed.data, judgedClass);

  // L4 메모리: 상태 변경이 곧 신호다. 여기가 **유일한** 신호 적재 지점 —
  // 예전엔 ReactionBar가 /api/me/signal을 따로 쳐서 가봄·별로만 신호가 두 번
  // 쌓였고(끌림·나중에는 한 번), 브레인 가중치가 왜곡됐다. 어느 화면에서 상태를
  // 바꾸든(지도·피드·부스 상세 패널) 이 경로를 지나므로 빠뜨릴 곳이 없다.
  const kind = SIGNAL_BY_STATUS[status ?? ""];
  if (kind) await recordSignal(user.id, { kind, boothId });

  // 취향 정확도 — 이 부스의 전시로 스코프. 클라이언트는 이 값을 그대로 표시할 뿐
  // 자기 공식으로 계산하지 않는다(서버 유일 진실).
  const booth = await repo.getBooth(boothId);
  const taste = booth
    ? await repo.getTasteAccuracy(user.id, booth.exhibitionId)
    : { judgedCount: 0, pct: null };

  return ok({ note, taste });
}
```

- [ ] **Step 3: 되묻기 엔드포인트**

`src/app/api/me/notes/[boothId]/retro/route.ts`(신규):

```typescript
import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { classifyForUser } from "@/lib/memory/service";

type Ctx = { params: Promise<{ boothId: string }> };

const schema = z.object({ liked: z.boolean() });

// '가봄'(visited) 부스의 뒤늦은 호불호 답 — "여기 어땠어?"(지도 시트) 또는 관람
// 마치기 일괄 되묻기에서 온다. status는 그대로 visited로 두고(지도 색 안 바뀜)
// retro·judged_class만 채운다. judged_class는 이 요청 순간 계산해 얼린다 — 가봄
// 자체는 무판정이라 얼릴 게 없고, 실제 판정은 되묻기에 답하는 지금 드러난다.
export async function POST(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { boothId } = await params;
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const booth = await repo.getBooth(boothId);
  if (!booth) return fail("NOT_FOUND", "부스를 찾을 수 없어요");

  const judgedClass = await classifyForUser(booth, user.id);
  const note = await repo.setBoothRetro(
    user.id,
    boothId,
    parsed.data.liked ? "liked" : "disliked",
    judgedClass,
  );
  const taste = await repo.getTasteAccuracy(user.id, booth.exhibitionId);
  return ok({ note, taste });
}
```

- [ ] **Step 4: 미답변 목록 엔드포인트**

`src/app/api/me/notes/pending-retro/route.ts`(신규):

```typescript
import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";

const querySchema = z.object({
  exhibitionSlug: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

// 관람 마치기에서 쓴다 — '가봄'인데 아직 "여기 어땠어?"에 답 안 한 부스를 몇 개만
// 묶어 한 번에 되묻는다(부스가 많은 전시에서 하나씩 되묻는 건 현실적이지 않다).
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");

  const url = new URL(req.url);
  const parsed = querySchema.safeParse({
    exhibitionSlug: url.searchParams.get("exhibitionSlug"),
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) return fail("VALIDATION", "입력값을 확인해 주세요");

  const repo = await getRepository();
  const detail = await repo.getExhibition(parsed.data.exhibitionSlug);
  if (!detail) return fail("NOT_FOUND", "전시를 찾을 수 없어요");

  const pending = await repo.listPendingRetro(
    user.id,
    detail.exhibition.id,
    parsed.data.limit,
  );
  return ok({ pending });
}
```

- [ ] **Step 5: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(Task 3에서 남겨둔 `notes/[boothId]/route.ts`의 3-인자 호출 에러가 이제 해소됨).

- [ ] **Step 6: mock 서버로 수동 검증**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev -p 3111 &
sleep 6
```

브라우저에서 `http://localhost:3111/login`으로 로그인(닉네임)한 뒤, 같은 브라우저 세션의 쿠키로:

```bash
# 로그인 쿠키를 브라우저 개발자도구에서 복사해 COOKIE 변수에 넣고:
curl -s -X PUT http://localhost:3111/api/me/notes/b_a101 \
  -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  -d '{"status":"interested"}' | head -c 500
```

Expected: `{"data":{"note":{...,"status":"interested","judgedClass":"confident"|"uncertain",...},"taste":{"judgedCount":1,"pct":null}}}`. `note.judgedClass` 값을 기록해 둔다(다음 확인에 쓴다).

```bash
# 같은 부스, 같은 status — 메모만 추가. judgedClass가 방금 값과 그대로여야 한다
# (재계산되면 안 된다 — 상태가 안 바뀐 쓰기는 이미 얼린 판정을 건드리지 않는다).
curl -s -X PUT http://localhost:3111/api/me/notes/b_a101 \
  -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  -d '{"status":"interested","memo":"다시 가보기"}' | head -c 500
```

Expected: `note.judgedClass`가 바로 위 호출에서 나온 값과 **동일**. (다르면 Task 4의 `statusChanged` 분기가 잘못된 것 — 버그로 다룬다.)

```bash
curl -s -X PUT http://localhost:3111/api/me/notes/b_a102 \
  -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  -d '{"status":"visited"}' | head -c 300
```

Expected: `note.status`는 `"visited"`, `note.judgedClass`는 `null`/없음(무판정).

```bash
curl -s -X POST http://localhost:3111/api/me/notes/b_a102/retro \
  -H "Content-Type: application/json" -H "Cookie: $COOKIE" \
  -d '{"liked":true}' | head -c 400
```

Expected: `note.retro === "liked"`, `note.judgedClass`가 채워짐.

```bash
curl -s "http://localhost:3111/api/me/notes/pending-retro?exhibitionSlug=sibf-2026" \
  -H "Cookie: $COOKIE"
```

Expected: `{"data":{"pending":[]}}` (방금 b_a102는 답했으므로 목록에 없어야 함). 다른 부스를 하나 더 `visited`로 찍고 다시 호출하면 그 부스가 목록에 나타나야 한다.

서버 종료: `kill %1` (또는 해당 job).

- [ ] **Step 7: 커밋**

```bash
git add src/app/api/me/notes/\[boothId\]/route.ts \
  src/app/api/me/notes/\[boothId\]/retro/route.ts \
  src/app/api/me/notes/pending-retro/route.ts \
  src/lib/memory/service.ts
git commit -m "feat(api): 반응 판정 계산 + 되묻기·미답변 목록 엔드포인트"
```

---

### Task 5: 클라이언트 방문 스토어 — `retro` 필드, `pushNote`/`pushRetro`

**Files:**
- Modify: `src/lib/stores/visit.ts`

**Interfaces:**
- Consumes: Task 4의 `PUT /api/me/notes/[boothId]` · `POST /api/me/notes/[boothId]/retro` 응답 형태 `{ note, taste }`.
- Produces:
  - `export interface TasteUpdate { judgedCount: number; pct: number | null }`
  - `export async function pushNote(boothId: string): Promise<TasteUpdate | null>` (반환 타입 변경 — 기존 `Promise<void>`에서 확장. 기존 호출부 4곳은 반환값을 안 썼으므로 그대로 컴파일된다.)
  - `export async function pushRetro(boothId: string, liked: boolean): Promise<TasteUpdate | null>`
  - `BoothRecord.retro?: "liked" | "disliked"`
  - `useVisitStore().setRetro(boothId: string, retro: "liked" | "disliked"): void`
  - Task 8(reaction-bar)·Task 10(지도 되묻기)이 `pushNote`/`pushRetro`의 반환값과 `setRetro`를 쓴다.

- [ ] **Step 1: 파일 전체 교체**

`src/lib/stores/visit.ts`:

```typescript
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "@/lib/api/client";
import type { BoothNote } from "@/lib/types";

/** A visitor's personal status for a booth, independent of the active route.
 *  네 가지 모두 서버 노트에 동기화된다(0029) — 폰을 바꿔도 지도 색이 따라온다. */
export type BoothStatus = "visited" | "skipped" | "interested" | "later";

export interface BoothRecord {
  status?: BoothStatus;
  /** '가봄'에 대한 뒤늦은 호불호 답 — 지도 시트의 "여기 어땠어?"에 답하면 채워진다.
   *  visited가 아닌 상태로 바뀌면 서버가 같이 지운다(setFromNotes가 그대로 반영). */
  retro?: "liked" | "disliked";
  /** Free-form personal note shown on the booth detail + map. */
  memo?: string;
  /** Personal photos (Cloudinary URLs) attached to this booth. */
  photos?: string[];
}

/** 반응 쓰기 응답에 실려오는 취향 정확도 — 클라이언트는 이 값을 그대로 표시할 뿐
 *  자기 공식으로 계산하지 않는다(서버 유일 진실). */
export interface TasteUpdate {
  judgedCount: number;
  pct: number | null;
}

interface VisitState {
  records: Record<string, BoothRecord>;
  /** Toggle a status; selecting the active status clears it. */
  toggleStatus: (boothId: string, status: BoothStatus) => void;
  setStatus: (boothId: string, status: BoothStatus | null) => void;
  setMemo: (boothId: string, memo: string) => void;
  setPhotos: (boothId: string, photos: string[]) => void;
  setRetro: (boothId: string, retro: "liked" | "disliked") => void;
  /** Replace the cache from the server (called after sign-in). */
  setFromNotes: (notes: BoothNote[]) => void;
  clear: () => void;
}

/**
 * Persist a single booth's record to the server. Caller must ensure the user
 * is signed in; the endpoint 401s otherwise (ignored here). 응답의 taste를
 * 돌려준다 — 호출부가 원하면 companion 스토어에 그대로 반영한다.
 */
export async function pushNote(boothId: string): Promise<TasteUpdate | null> {
  const r = useVisitStore.getState().records[boothId];
  try {
    const res = await api.put<{ note: BoothNote; taste: TasteUpdate }>(
      `/api/me/notes/${boothId}`,
      {
        // 네 상태 그대로 보낸다. 예전엔 visited|skipped만 보내고 나머지는 null로
        // 깎았는데, 그게 끌림을 누를 때 서버의 '가봄'을 지우는 경로였다.
        status: r?.status ?? null,
        memo: r?.memo ?? "",
        photos: r?.photos ?? [],
      },
    );
    return res.taste;
  } catch {
    /* offline / not signed in — local cache still holds it */
    return null;
  }
}

/** '가봄' 부스의 되묻기 답을 서버에 저장. */
export async function pushRetro(
  boothId: string,
  liked: boolean,
): Promise<TasteUpdate | null> {
  try {
    const res = await api.post<{ note: BoothNote | null; taste: TasteUpdate }>(
      `/api/me/notes/${boothId}/retro`,
      { liked },
    );
    return res.taste;
  } catch {
    return null;
  }
}

function patch(
  records: Record<string, BoothRecord>,
  boothId: string,
  next: Partial<BoothRecord>,
): Record<string, BoothRecord> {
  const merged: BoothRecord = { ...records[boothId], ...next };
  // Drop empty records so the store stays compact.
  if (!merged.status && !merged.memo?.trim() && !merged.photos?.length) {
    const { [boothId]: _omit, ...rest } = records;
    return rest;
  }
  return { ...records, [boothId]: merged };
}

export const useVisitStore = create<VisitState>()(
  persist(
    (set) => ({
      records: {},
      toggleStatus: (boothId, status) =>
        set((s) => ({
          records: patch(s.records, boothId, {
            status: s.records[boothId]?.status === status ? undefined : status,
          }),
        })),
      setStatus: (boothId, status) =>
        set((s) => ({
          // 상태가 바뀌면 이전 되묻기 답은 의미를 잃는다(끌림→나중에→가봄으로 옮겨
          // 다니면서 예전 '가봄' 시절 답이 새 상태에 들러붙어 있으면 안 된다).
          records: patch(s.records, boothId, {
            status: status ?? undefined,
            retro: undefined,
          }),
        })),
      setMemo: (boothId, memo) =>
        set((s) => ({ records: patch(s.records, boothId, { memo }) })),
      setPhotos: (boothId, photos) =>
        set((s) => ({ records: patch(s.records, boothId, { photos }) })),
      setRetro: (boothId, retro) =>
        set((s) => ({ records: patch(s.records, boothId, { retro }) })),
      setFromNotes: (notes) =>
        // 서버 노트를 로컬 위에 병합(교체 아님) — 로컬 전용 상태(끌림=interested,
        // 아직 미동기 기록)를 보존한다. 서버가 아는 부스는 서버 값이 위에 덮인다.
        // 교체하면 매 페이지 로드(AuthBootstrap refresh)마다 반응 색이 사라진다.
        set((s) => {
          const records: Record<string, BoothRecord> = { ...s.records };
          for (const n of notes) {
            if (n.status || n.memo?.trim() || n.photos?.length)
              records[n.boothId] = {
                ...records[n.boothId],
                status: n.status ?? records[n.boothId]?.status,
                retro: n.retro ?? records[n.boothId]?.retro,
                memo: n.memo,
                photos: n.photos,
              };
          }
          return { records };
        }),
      clear: () => set({ records: {} }),
    }),
    { name: "roam-visit", storage: createJSONStorage(() => localStorage) },
  ),
);

/** Selector helpers for components that only need ids of a given status. */
export function idsByStatus(
  records: Record<string, BoothRecord>,
  status: BoothStatus,
): string[] {
  return Object.entries(records)
    .filter(([, r]) => r.status === status)
    .map(([id]) => id);
}
```

주의: `setStatus`가 이제 `retro: undefined`를 항상 같이 patch한다 — `가봄`을 눌러 `visited`로 바꿀 때도 로컬 retro를 지운다(새 가봄이니 아직 무판정이 맞다). `patch()`의 "다 비면 레코드 삭제" 판정에는 `retro`가 안 들어가 있다 — status/memo/photos가 있는 한 레코드는 유지되므로 문제 없다.

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 3: eslint**

Run: `npx eslint src/lib/stores/visit.ts`
Expected: 에러 없음.

- [ ] **Step 4: 커밋**

```bash
git add src/lib/stores/visit.ts
git commit -m "feat(store): pushNote/pushRetro가 취향 정확도를 돌려준다"
```

---

### Task 6: Companion 스토어 — `progress`/`bumpProgress` → `tasteJudged`/`tastePct`/`setTaste`

**Files:**
- Modify: `src/lib/stores/companion.ts`

**Interfaces:**
- Produces:
  - `useCompanionStore().tasteJudged: number`
  - `useCompanionStore().tastePct: number | null`
  - `useCompanionStore().setTaste(judged: number, pct: number | null): void`
  - Task 7(page.tsx/bridge)·Task 8(companion-bar)·Task 9(reaction-bar)·Task 10(지도 되묻기)가 이 셋을 쓴다.
  - **제거**: `progress`·`setProgress`·`bumpProgress` — Task 7·8·9가 기존 참조를 갱신해야 컴파일된다(이 태스크 직후 `npx tsc --noEmit`은 실패하는 게 정상이며, Task 7~9에서 해소된다).

- [ ] **Step 1: 파일 전체 교체**

`src/lib/stores/companion.ts`:

```typescript
"use client";

import { create } from "zustand";

/**
 * 전시 홈에서 서버가 계산한 맥락(상위 관심 가치·골라둔 개수)을 상주 컴패니언 바에
 * 넘겨주는 통로. 상단 고정 배너 대신 하단 플로팅 로미가 이 맥락으로 말하게 한다
 * (휘발성 발화). 페이지가 마운트 시 채우고 이탈 시 비운다.
 */
export interface HomeCompanionContext {
  /** 사용자 상위 관심 가치 라벨(로케일). 비면 아직 취향 없음. */
  values: string[];
  /** 이 전시에서 로미가 골라둔 피드 개수. */
  picked: number;
}

interface CompanionState {
  home: HomeCompanionContext | null;
  setHome: (ctx: HomeCompanionContext | null) => void;
  /**
   * 방금 사용자 행동(반응·검색 등)에 대한 즉답 한 줄. 상주 컴패니언이 잠깐 이 말을
   * 띄우고 스스로 지운다 — "내 행동에 로미가 바로 반응한다"는 동행 느낌. 결정론 선택,
   * 로미는 말만(속도 규칙 준수, LLM 없음).
   */
  flash: string | null;
  /** 즉답 발화를 띄운다. 컴패니언 바가 잠시 뒤 스스로 지운다. */
  say: (text: string) => void;
  clearFlash: () => void;

  /**
   * 취향 정확도 — "로미의 예측을 사용자가 확인해준 정도"(예측 정확도, taste.ts).
   * 접촉량이 아니다: 카드 클릭·검색은 관여 안 하고, 반응(끌림·나중에·별로·가봄
   * 되묻기)만 판정으로 센다. 서버가 유일한 진실이다 — 이 스토어는 매 쓰기 응답의
   * 값을 그대로 반영할 뿐 자체 공식으로 계산하지 않는다(이전 bumpProgress 감쇠
   * 휴리스틱이 서버 값과 어긋나던 문제를 이렇게 없앤다).
   */
  tasteJudged: number;
  /** 판정 5개 미만이면 null(말로만 표시) — companion-bar.tsx가 분기한다. */
  tastePct: number | null;
  setTaste: (judged: number, pct: number | null) => void;
}

export const useCompanionStore = create<CompanionState>((set) => ({
  home: null,
  setHome: (home) => set({ home }),
  flash: null,
  say: (text) => set({ flash: text }),
  clearFlash: () => set({ flash: null }),
  tasteJudged: 0,
  tastePct: null,
  setTaste: (judged, pct) => set({ tasteJudged: judged, tastePct: pct }),
}));
```

- [ ] **Step 2: 타입체크(실패가 정상)**

Run: `npx tsc --noEmit 2>&1 | grep -E "progress|bumpProgress"`
Expected: `home-companion-context.tsx`·`companion-bar.tsx`·`reaction-bar.tsx`에서 `progress`/`setProgress`/`bumpProgress`를 못 찾는다는 에러 여러 건. **이 태스크에서는 이걸 그대로 두고 커밋한다** — 다음 세 태스크(7·8·9)가 각각 해소한다.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/stores/companion.ts
git commit -m "feat(store): companion progress를 tasteJudged/tastePct로 교체"
```

---

### Task 7: `page.tsx` + `HomeCompanionContextBridge` — 정확도 시딩

**Files:**
- Modify: `src/components/companion/home-companion-context.tsx`
- Modify: `src/app/(visitor)/exhibitions/[slug]/page.tsx`
- Modify: `src/components/onboarding/value-onboarding.tsx`
- Delete: `src/lib/memory/progress.ts`

**Interfaces:**
- Consumes: Task 3의 `repo.getTasteAccuracy(userId, exhibitionId)`, Task 6의 `setTaste`.
- Produces: `HomeCompanionContextBridge`가 `tasteJudged`/`tastePct` props를 받는다 — Task 8(companion-bar)이 이 시딩된 스토어 값을 읽는다. `ValueOnboarding`이 `hasChosenValues: boolean` prop을 받는다(신규, Task 6이 제거한 `progress` 필드를 대체).

⚠️ **Task 6 실행 중 발견된 플랜 갭**: `src/components/onboarding/value-onboarding.tsx`가 옛 `useCompanionStore().progress`를 읽어 `progress < 100`일 때만 "가치 정하기" 진입 카드를 보여준다("파악도 100%면 온보딩을 이미 마친 것"이라는 옛 가정). Task 6이 `progress`를 지우면서 이 파일도 깨지는데, 원래 계획엔 이 파일이 어느 태스크에도 없었다 — 정확도(취향 %)와 "온보딩 위저드를 이미 했는가"는 애초에 다른 개념이었는데 옛 코드가 하나로 뭉뚱그렸던 것이다. 이 태스크에서 같이 고친다: 새 신호는 `topValues.length > 0`(이미 `page.tsx`가 계산해 둔, 확신 가치가 있는지)를 쓴다 — 값이 100에서 왔다 갔다 하는 정확도보다 훨씬 안정적이고 의미도 정확하다(있다 없다이지 오르내리지 않는다).

- [ ] **Step 1: `HomeCompanionContextBridge` 수정**

`src/components/companion/home-companion-context.tsx` 전체 교체:

```typescript
"use client";

import { useEffect } from "react";
import { useCompanionStore } from "@/lib/stores/companion";

/**
 * 전시 홈(서버 컴포넌트)이 계산한 맥락을 상주 컴패니언 바에 실어주는 클라이언트 브리지.
 * 화면을 벗어나면 맥락을 비워, 다른 화면에서 홈 발화가 새지 않게 한다.
 *
 * 취향 정확도는 서버가 계산한 값을 그대로 시딩한다 — "서버 유일 진실" 원칙이라
 * 낙관적 보정(예전의 "더 높을 때만 올린다") 없이 매번 덮어쓴다. 반응 응답도
 * 같은 방식으로 직접 덮어쓰므로(reaction-bar.tsx) 둘 다 항상 서버 값이다.
 */
export function HomeCompanionContextBridge({
  values,
  picked,
  tasteJudged,
  tastePct,
}: {
  values: string[];
  picked: number;
  /** 서버 브레인으로 계산한 판정 수. */
  tasteJudged: number;
  /** 판정 5개 미만이면 null(말로만 표시). */
  tastePct: number | null;
}) {
  const setHome = useCompanionStore((s) => s.setHome);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const key = values.join("·");
  useEffect(() => {
    setHome({ values, picked });
    setTaste(tasteJudged, tastePct);
    return () => setHome(null);
    // values는 원시 배열이라 join 키로 비교(불필요 리셋 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setHome, setTaste, key, picked, tasteJudged, tastePct]);
  return null;
}
```

- [ ] **Step 2: `page.tsx` 수정**

`src/app/(visitor)/exhibitions/[slug]/page.tsx`에서 다음 줄을 찾아:

```typescript
import { tasteProgress } from "@/lib/memory/progress";
```

삭제하고, 파일 상단 import 블록에(다른 lib import 근처에) 추가할 것 없음 — `getRepository`를 이미 안 쓰고 있다면(page.tsx는 대부분 `getExhibitionCached`/`curateFeed`/`readBrain`을 직접 쓰는 구조) `getRepository` import를 추가:

```typescript
import { getRepository } from "@/lib/repositories";
```

(이미 다른 이유로 import돼 있다면 중복 추가하지 않는다 — 파일을 먼저 열어 확인할 것.)

다음 줄:

```typescript
  const progressPct = brain ? tasteProgress(brain) : 0;
```

을 다음으로 교체:

```typescript
  // 취향 정확도 — 브레인 파생이 아니라 booth_note 직접 집계(브레인이 아니라
  // "반응이 로미의 예측을 맞혔는가"로 잰다). 예전 tasteProgress(접촉량 기반)는
  // 삭제됐다.
  const taste = user
    ? await (await getRepository()).getTasteAccuracy(
        user.id,
        detail.exhibition.id,
      )
    : { judgedCount: 0, pct: null };
```

`HomeCompanionContextBridge` 호출부(약 152~158행):

```typescript
          {user && (
            <HomeCompanionContextBridge
              values={topValues}
              picked={feedItems.length}
              progress={progressPct}
            />
          )}
```

을 다음으로 교체:

```typescript
          {user && (
            <HomeCompanionContextBridge
              values={topValues}
              picked={feedItems.length}
              tasteJudged={taste.judgedCount}
              tastePct={taste.pct}
            />
          )}
```

`ValueOnboarding` 호출부(`page.tsx`, 위 `HomeCompanionContextBridge` 호출부보다 아래에 있다)를 찾아:

```typescript
            <ValueOnboarding
              slug={slug}
              exhibitionName={exhibition.name}
              hallCount={detail.halls.length}
              themes={detail.categories
                .slice(0, 3)
                .map((c) => c.name)
                .join("·")}
            />
```

을 다음으로 교체(`hasChosenValues` prop 추가, 나머지는 그대로):

```typescript
            <ValueOnboarding
              slug={slug}
              exhibitionName={exhibition.name}
              hallCount={detail.halls.length}
              themes={detail.categories
                .slice(0, 3)
                .map((c) => c.name)
                .join("·")}
              hasChosenValues={topValues.length > 0}
            />
```

- [ ] **Step 2b: `ValueOnboarding`이 취향 %가 아니라 "확신 가치 있음"으로 진입 카드를 숨긴다**

`src/components/onboarding/value-onboarding.tsx`의 import 블록에서 다음 줄을 삭제(더 이상 안 씀):

```typescript
import { useCompanionStore } from "@/lib/stores/companion";
```

컴포넌트 시그니처(약 28~41행)를 찾아:

```typescript
export function ValueOnboarding({
  slug,
  exhibitionName,
  hallCount,
  themes,
}: {
  slug: string;
  exhibitionName?: string;
  hallCount?: number;
  themes?: string;
}) {
  const router = useRouter();
  const t = useT();
  const progress = useCompanionStore((s) => s.progress);
  const [open, setOpen] = useState(false);
```

을 다음으로 교체:

```typescript
export function ValueOnboarding({
  slug,
  exhibitionName,
  hallCount,
  themes,
  hasChosenValues,
}: {
  slug: string;
  exhibitionName?: string;
  hallCount?: number;
  themes?: string;
  /** 이미 확신 가치가 있으면(온보딩을 거쳤든 반응으로 쌓였든) 진입 카드를 숨긴다.
   *  예전엔 취향 % 100 도달로 판단했는데, 그 %는 이제 예측 정확도라 5개 판정만
   *  맞아도 100이 되고 하나 틀리면 다시 내려간다 — 카드가 나타났다 사라졌다 하는
   *  근거로 못 쓴다. 확신 가치 존재 여부는 오르내리지 않는다. */
  hasChosenValues: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const [open, setOpen] = useState(false);
```

마지막으로 진입 카드 표시 조건(약 86행)을 찾아:

```typescript
      {progress < 100 && (
```

을:

```typescript
      {!hasChosenValues && (
```

- [ ] **Step 3: `progress.ts` 삭제**

```bash
rm src/lib/memory/progress.ts
```

Run: `grep -rn "tasteProgress\|memory/progress" src/ --include="*.ts" --include="*.tsx"`
Expected: 빈 출력(다른 참조가 남아 있으면 안 됨 — 있다면 그 파일도 이 태스크에서 같이 정리한다).

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: `home-companion-context.tsx`·`page.tsx`·`value-onboarding.tsx` 관련 에러 없음. (`companion-bar.tsx`·`reaction-bar.tsx`는 Task 8·9까지 여전히 에러 — 정상. 그 두 파일 외의 에러가 남아 있으면 이 태스크에서 마저 고친다.)

- [ ] **Step 5: 커밋**

```bash
git add src/components/companion/home-companion-context.tsx \
  "src/app/(visitor)/exhibitions/[slug]/page.tsx" \
  src/components/onboarding/value-onboarding.tsx
git rm src/lib/memory/progress.ts
git commit -m "feat(page): 취향 정확도를 booth_note 집계로 시딩, 접촉량 공식 삭제"
```

---

### Task 8: `companion-bar.tsx` — 배지·말 상태·문구

**Files:**
- Modify: `src/components/companion/companion-bar.tsx`
- Modify: `src/lib/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: Task 6의 `tasteJudged`/`tastePct`(`useCompanionStore`).
- Produces: `companion.tasteUnknown`·`companion.tasteWarming`·`companion.tasteInsight`·`companion.tastePct` 사전 키(ko/en) — Task 9(reaction-bar)가 `companion.tasteInsight`를 소비.

- [ ] **Step 1: 사전 키 교체**

`src/lib/i18n/dictionaries.ts`의 ko 블록(약 429~430행):

```typescript
    progressLabel: "취향 {pct}%",
    progressDone: "이제 네 취향 다 파악했어. 골라둔 곳 마음껏 봐.",
```

을 다음으로 교체:

```typescript
    // 취향 정확도 4단계. 판정 0개/1~4개는 홈 발화 로테이션(homeLines)에 섞이고,
    // 5개를 막 넘기는 순간(1회)은 reaction-bar.tsx가 say()로 띄운다. 5개 이상은
    // 상주 배지가 tastePct로 대체한다.
    tasteUnknown: "아직 널 모르겠어. 둘러보면서 알려줘.",
    tasteWarming: "조금씩 감이 오는데, 좀 더 봐야겠어.",
    tasteInsight: "이제 좀 감이 온다. 계속 맞춰볼게.",
    tastePct: "취향 {pct}%",
```

en 블록(약 892~893행):

```typescript
    progressLabel: "Taste {pct}%",
    progressDone: "I've got your taste now. Enjoy the picks.",
```

을:

```typescript
    tasteUnknown: "Don't know you yet. Show me around.",
    tasteWarming: "Getting a sense of it — need a bit more.",
    tasteInsight: "Starting to get it. I'll keep guessing.",
    tastePct: "Taste {pct}%",
```

- [ ] **Step 2: `companion-bar.tsx` 수정**

`src/components/companion/companion-bar.tsx`에서 다음 부분을 수정한다.

상단 상태 읽기(약 27~34행):

```typescript
  const say = useCompanionStore((s) => s.say);
  const progress = useCompanionStore((s) => s.progress);
  const [open, setOpen] = useState(false);
  const doneRef = useRef(false);
```

을:

```typescript
  const say = useCompanionStore((s) => s.say);
  const tasteJudged = useCompanionStore((s) => s.tasteJudged);
  const tastePct = useCompanionStore((s) => s.tastePct);
  const [open, setOpen] = useState(false);
```

(`doneRef`는 아래서 통째로 없앤다 — 완료 이벤트 자체가 사라진다.)

`useRef` import가 더 이상 필요 없으면 import 목록에서 제거: 파일 최상단의

```typescript
import { useEffect, useMemo, useRef, useState } from "react";
```

에서 `useRef`를 빼서:

```typescript
import { useEffect, useMemo, useState } from "react";
```

파악도 100% 완료 이벤트 블록(약 44~50행):

```typescript
  // 파악도 100% 도달 = 온보딩 마무리 — 로미가 한 번 선언한다(중복 금지).
  useEffect(() => {
    if (isExhibitionHome && progress >= 100 && !doneRef.current) {
      doneRef.current = true;
      say(t("companion.progressDone"));
    }
  }, [isExhibitionHome, progress, say, t]);
```

을 통째로 삭제한다(완료 이벤트가 없어졌다 — "감 잡았다" 1회 이벤트는 Task 9에서 반응 응답을 받는 그 순간에 뜬다).

`lines`(로테이션 문구) 계산 부분(약 51~54행):

```typescript
  const lines = useMemo(() => {
    if (isExhibitionHome && home) return homeLines(home, t);
    return [contextLine(pathname, t)];
  }, [isExhibitionHome, home, pathname, t]);
```

을:

```typescript
  const lines = useMemo(() => {
    if (isExhibitionHome && home)
      return homeLines(home, tasteJudged, tastePct, t);
    return [contextLine(pathname, t)];
  }, [isExhibitionHome, home, tasteJudged, tastePct, pathname, t]);
```

배지 렌더 부분(약 76~82행):

```typescript
          {isExhibitionHome && home && progress > 0 && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {progress >= 100
                ? "✓"
                : t("companion.progressLabel", { pct: progress })}
            </span>
          )}
```

을:

```typescript
          {isExhibitionHome && home && tastePct !== null && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {t("companion.tastePct", { pct: tastePct })}
            </span>
          )}
```

`homeLines` 함수(파일 하단, 약 174~187행):

```typescript
/** 전시 홈 발화 풀 — 취향·개수로 조립, 여러 변주를 회전시킨다. */
function homeLines(
  home: { values: string[]; picked: number },
  t: TFn,
): string[] {
  if (home.picked <= 0) return [t("companion.homeEmpty")];
  if (home.values.length === 0)
    return [t("companion.homeEmpty"), t("companion.homeAsk")];
  const values = home.values.slice(0, 2).join("·");
  return [
    t("companion.homeValues", { values, n: home.picked }),
    t("companion.homePicked", { n: home.picked }),
    t("companion.homeAsk"),
  ];
}
```

을:

```typescript
/**
 * 전시 홈 발화 풀 — 취향·개수로 조립, 여러 변주를 회전시킨다.
 * 판정 5개 미만(tastePct===null)이면 취향 말 상태 한 줄을 맨 앞에 섞는다 —
 * 숫자가 없을 때도 로미가 뭘 하고 있는지는 들려준다.
 */
function homeLines(
  home: { values: string[]; picked: number },
  tasteJudged: number,
  tastePct: number | null,
  t: TFn,
): string[] {
  const tasteLine =
    tastePct !== null
      ? null
      : tasteJudged === 0
        ? t("companion.tasteUnknown")
        : t("companion.tasteWarming");
  const base = (() => {
    if (home.picked <= 0) return [t("companion.homeEmpty")];
    if (home.values.length === 0)
      return [t("companion.homeEmpty"), t("companion.homeAsk")];
    const values = home.values.slice(0, 2).join("·");
    return [
      t("companion.homeValues", { values, n: home.picked }),
      t("companion.homePicked", { n: home.picked }),
      t("companion.homeAsk"),
    ];
  })();
  return tasteLine ? [tasteLine, ...base] : base;
}
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: `companion-bar.tsx` 관련 에러 없음(`reaction-bar.tsx`는 Task 9까지 여전히 에러 — 정상).

- [ ] **Step 3: eslint**

Run: `npx eslint src/components/companion/companion-bar.tsx`
Expected: 에러 없음(미사용 import `useRef` 등 확인).

- [ ] **Step 4: mock 서버로 수동 검증**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev -p 3111 &
sleep 6
```

브라우저에서 `http://localhost:3111/login` 로그인 → 전시 홈 진입. 반응을 아직 안 한 새 계정이면 하단 상주 필에 배지가 안 보이고(judged=0), 회전 문구 중 하나로 "아직 널 모르겠어. 둘러보면서 알려줘."가 나타나야 한다(회전이라 몇 초 기다리거나 다른 문구와 섞여 보일 수 있음 — 로테이션 배열 첫 항목이므로 페이지 로드 직후엔 이 줄이 먼저 보여야 한다).

서버 종료: `kill %1`.

- [ ] **Step 5: 커밋**

```bash
git add src/components/companion/companion-bar.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(companion): 취향 배지·말 상태 문구, 완료 이벤트 제거"
```

---

### Task 9: `reaction-bar.tsx` — 감쇠 휴리스틱 제거, 서버 값 반영 + "감 잡았다" 1회 이벤트

**Files:**
- Modify: `src/components/feed/reaction-bar.tsx`

**Interfaces:**
- Consumes: Task 5의 `pushNote(boothId): Promise<TasteUpdate | null>`, Task 6의 `setTaste`·`tasteJudged`, Task 2의 `INSIGHT_THRESHOLD`(`@/lib/memory/taste`), Task 8의 `companion.tasteInsight` 사전 키.

- [ ] **Step 1: `react()` 함수 수정**

`src/components/feed/reaction-bar.tsx`에서 스토어 읽기 부분(약 69~78행):

```typescript
  const t = useT();
  const storeStatus = useVisitStore((s) => s.records[boothId]?.status);
  const setStatus = useVisitStore((s) => s.setStatus);
  const say = useCompanionStore((s) => s.say);
  const bumpProgress = useCompanionStore((s) => s.bumpProgress);
  const progress = useCompanionStore((s) => s.progress);
  // 눌린 버튼은 스토어에서 파생한다 — 복사본을 두면 부스가 바뀌어도 앞 부스의 상태가
  // 남아, 실제로는 아무 반응도 없는 부스에 버튼이 눌린 채로 보인다(지도에서 부스를
  // 옮겨 다닐 때 실제로 그랬다). 진실은 visitStore 한 곳뿐이다.
  const picked = keyForStatus(storeStatus);
```

을:

```typescript
  const t = useT();
  const storeStatus = useVisitStore((s) => s.records[boothId]?.status);
  const setStatus = useVisitStore((s) => s.setStatus);
  const say = useCompanionStore((s) => s.say);
  const setTaste = useCompanionStore((s) => s.setTaste);
  // 눌린 버튼은 스토어에서 파생한다 — 복사본을 두면 부스가 바뀌어도 앞 부스의 상태가
  // 남아, 실제로는 아무 반응도 없는 부스에 버튼이 눌린 채로 보인다(지도에서 부스를
  // 옮겨 다닐 때 실제로 그랬다). 진실은 visitStore 한 곳뿐이다.
  const picked = keyForStatus(storeStatus);
```

`react()` 함수 본문(약 80~99행):

```typescript
  function react(r: (typeof REACTIONS)[number]) {
    const isSame = picked === r.key;
    setStatus(boothId, isSame ? null : r.status);
    // 네 상태 모두 서버 노트로 동기화 → 폰을 바꾸거나 재로그인해도 지도 색이 남는다.
    // 신호 적재도 이 요청 하나가 겸한다(notes 라우트가 상태를 보고 기록) — 예전처럼
    // /api/me/signal을 따로 치면 가봄·별로만 신호가 두 번 쌓인다.
    void pushNote(boothId).catch(() => {});
    if (!isSame) {
      // 로미 즉답 — 취소가 아니라 새 반응일 때만. 내 행동에 바로 반응한다는 느낌.
      const line = reactionLine(r.key, boothName, t);
      if (line) say(line);
      // 파악도 상승 — 남은 거리(100-현재)에 비례한 감쇠 증가라 서버 포화 곡선을 따라가
      // 재접속 시 값 점프가 작고, 100까지 대략 15~20번의 반응이 필요하다(완만). '별로'도
      // 취향을 좁히는 신호라 함께 오르되 절반만.
      const factor = r.key === "skip" ? 0.06 : 0.13;
      const floor = r.key === "skip" ? 1 : 2;
      bumpProgress(Math.max(floor, Math.round((100 - progress) * factor)));
    }
  }
```

을:

```typescript
  function react(r: (typeof REACTIONS)[number]) {
    const isSame = picked === r.key;
    setStatus(boothId, isSame ? null : r.status);
    if (!isSame) {
      // 로미 즉답 — 취소가 아니라 새 반응일 때만. 내 행동에 바로 반응한다는 느낌.
      const line = reactionLine(r.key, boothName, t);
      if (line) say(line);
    }
    // 네 상태 모두 서버 노트로 동기화 → 폰을 바꾸거나 재로그인해도 지도 색이 남는다.
    // 신호 적재도 이 요청 하나가 겸한다(notes 라우트가 상태를 보고 기록) — 예전처럼
    // /api/me/signal을 따로 치면 가봄·별로만 신호가 두 번 쌓인다.
    //
    // 취향 정확도는 서버 응답을 그대로 반영한다 — 예전엔 클라이언트가 감쇠 곡선으로
    // 낙관적 bump를 했는데, 서버 공식과 어긋나 새로고침하면 값이 오르내렸다. 취소
    // (isSame) 때도 pushNote는 항상 나간다 — 반응을 지우면 판정도 같이 지워지므로
    // 정확도가 내려갈 수 있고, 그것도 서버가 계산해 알려준다.
    const prevJudged = useCompanionStore.getState().tasteJudged;
    void pushNote(boothId).then((taste) => {
      if (!taste) return;
      setTaste(taste.judgedCount, taste.pct);
      // "감 잡았다" — 판정 5개를 막 넘기는 순간에만, 1회.
      if (prevJudged < 5 && taste.judgedCount >= 5) {
        say(t("companion.tasteInsight"));
      }
    });
  }
```

- [ ] **Step 2: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(전체 프로젝트 — Task 6~9로 남겨뒀던 `progress`/`bumpProgress` 참조가 이제 다 해소됨).

- [ ] **Step 3: eslint**

Run: `npx eslint src/components/feed/reaction-bar.tsx`
Expected: 에러 없음.

- [ ] **Step 4: 전체 vitest**

Run: `npx vitest run`
Expected: 전체 통과(기존 테스트 + Task 2·3에서 추가한 테스트).

- [ ] **Step 5: mock 서버로 수동 검증 — 5개 채우고 "감 잡았다" 확인**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev -p 3111 > /tmp/taste-dev.log 2>&1 &
sleep 6
```

플레이라이트로 검증(이 세션에서 앞서 쓴 스크립트 패턴 재사용):

```javascript
// /tmp/taste-check.mjs
import { chromium } from "/Users/sinjong-won/ted.urssu/Roam/node_modules/playwright/index.mjs";
const b = await chromium.launch({ channel: "chrome" });
const p = await b.newPage({ viewport: { width: 430, height: 932 } });
await p.goto("http://localhost:3111/login?next=/exhibitions/sibf-2026");
if (await p.getByText("한국어").isVisible().catch(() => false)) {
  await p.getByText("한국어").click();
  await p.locator("button").last().click();
  await p.waitForTimeout(800);
}
await p.fill("input", "정확도" + Date.now());
await p.press("input", "Enter");
await p.waitForURL((u) => u.pathname.startsWith("/exhibitions"), { timeout: 20000 });
await p.waitForTimeout(3000);
for (let i = 0; i < 3; i++) {
  const ov = p.locator("div.fixed.inset-0").first();
  if (!(await ov.count()) || !(await ov.isVisible().catch(() => false))) break;
  await ov.locator("button").last().click({ force: true }).catch(() => {});
  await p.waitForTimeout(700);
}
// 카드 5개에 '끌림'을 연달아 누른다 — 5번째에서 "이제 좀 감이 온다"가 떠야 한다.
for (let i = 0; i < 5; i++) {
  const card = p.locator("article").nth(i);
  await card.getByRole("button", { name: /끌림/ }).evaluate((el) => el.click());
  await p.waitForTimeout(900);
}
const flash = await p.locator("text=이제 좀 감이 온다").count();
console.log("감잡았다 문구 노출:", flash > 0 ? "확인" : "미확인(재관찰 필요)");
await b.close();
```

Run: `node /tmp/taste-check.mjs`
Expected: `감잡았다 문구 노출: 확인`

서버 종료: `kill %1`.

- [ ] **Step 6: 커밋**

```bash
git add src/components/feed/reaction-bar.tsx
git commit -m "feat(feed): 취향 정확도를 서버 응답 그대로 반영, 감쇠 휴리스틱 삭제"
```

---

### Task 10: 지도 되묻기 — `VisitedRetroInline` + 코치마크 문구

**Files:**
- Create: `src/components/map/visited-retro-inline.tsx`
- Modify: `src/components/map/map-view.tsx`
- Modify: `src/lib/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: Task 5의 `pushRetro`·`setRetro`(`@/lib/stores/visit`), Task 6의 `setTaste`.
- Produces: `<VisitedRetroInline boothId={string} />` 컴포넌트 — map-view.tsx가 부스 시트 안에 렌더.

- [ ] **Step 1: 사전 키 추가**

`src/lib/i18n/dictionaries.ts`의 `map:` 블록 ko 쪽, `coachColorsD` 근처에 키 추가(정확한 삽입 위치는 `coachColorsL`/`coachColorsD` 바로 아래):

```typescript
    coachColorsL: "부스 색",
    coachColorsD:
      "초록=끌림, 남색=가봄, 노랑=나중에, 흐림=별로. 반응할수록 쌓여. 걸으면서는 가봄·별로·끌림만 반사적으로 누르고, 판단은 나중에 물어볼게.",
    retroPrompt: "여기 어땠어?",
    retroLiked: "끌렸어",
    retroDisliked: "별로",
```

en 쪽 동일 위치:

```typescript
    coachColorsL: "Booth colors",
    coachColorsD:
      "Green = liked, indigo = seen, yellow = later, dim = passed. It builds as you react. While walking, just tap seen/pass/liked on reflex — I'll ask what you thought later.",
    retroPrompt: "How was it?",
    retroLiked: "Liked it",
    retroDisliked: "Not for me",
```

(`coachColorsD`는 기존 문장 뒤에 안내를 이어붙인 것 — 새 문장을 따로 만들지 않는다, 스펙의 "코치마크 한 줄 추가"는 새 불릿이 아니라 기존 색 설명에 이어붙이는 것으로 확정됐다.)

- [ ] **Step 2: `VisitedRetroInline` 작성**

`src/components/map/visited-retro-inline.tsx`(신규):

```typescript
"use client";

import { useVisitStore, pushRetro } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";

/**
 * 지도 부스 시트의 "여기 어땠어?" — '가봄'인데 아직 되묻기에 답 안 한 부스에만
 * 뜬다. 강제 아님: 무시하면 사라지고, 다음에 이 부스 시트를 다시 열면 또 뜬다.
 * 걷는 중엔 가봄·별로·끌림만 반사적으로 누르게 하고, 판단(호불호)은 여기서 따로
 * 받는다 — 지도 코치마크에 그 안내가 있다.
 */
export function VisitedRetroInline({ boothId }: { boothId: string }) {
  const t = useT();
  const record = useVisitStore((s) => s.records[boothId]);
  const setRetro = useVisitStore((s) => s.setRetro);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const say = useCompanionStore((s) => s.say);

  if (record?.status !== "visited" || record?.retro) return null;

  function answer(liked: boolean) {
    setRetro(boothId, liked ? "liked" : "disliked");
    const prevJudged = useCompanionStore.getState().tasteJudged;
    void pushRetro(boothId, liked).then((taste) => {
      if (!taste) return;
      setTaste(taste.judgedCount, taste.pct);
      if (prevJudged < 5 && taste.judgedCount >= 5) {
        say(t("companion.tasteInsight"));
      }
    });
  }

  return (
    <div className="mt-2.5 flex items-center justify-between gap-2 border-t border-border pt-2.5 text-sm">
      <span className="text-muted-foreground">{t("map.retroPrompt")}</span>
      <div className="flex gap-1.5">
        <button
          type="button"
          onClick={() => answer(true)}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
        >
          {t("map.retroLiked")}
        </button>
        <button
          type="button"
          onClick={() => answer(false)}
          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
        >
          {t("map.retroDisliked")}
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: `map-view.tsx`에 삽입**

`src/components/map/map-view.tsx`에서 다음 부분(약 320~326행)을 찾는다:

```typescript
            {/* 저장 대신 반응 — 끌림/나중에/별로/이미봄 → 신호로 브레인에 반영. */}
            <div className="mt-2.5 border-t border-border pt-2.5">
              <ReactionBar boothId={selected.id} boothName={selected.name} />
            </div>
          </div>
        </div>
      )}
```

을:

```typescript
            {/* 저장 대신 반응 — 끌림/나중에/별로/이미봄 → 신호로 브레인에 반영. */}
            <div className="mt-2.5 border-t border-border pt-2.5">
              <ReactionBar boothId={selected.id} boothName={selected.name} />
            </div>

            <VisitedRetroInline boothId={selected.id} />
          </div>
        </div>
      )}
```

파일 상단 import 블록에 추가(다른 컴포넌트 import 근처):

```typescript
import { VisitedRetroInline } from "@/components/map/visited-retro-inline";
```

- [ ] **Step 4: 타입체크 + eslint**

Run: `npx tsc --noEmit && npx eslint src/components/map/visited-retro-inline.tsx src/components/map/map-view.tsx`
Expected: 에러 없음.

- [ ] **Step 5: mock 서버로 수동 검증**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev -p 3111 &
sleep 6
```

브라우저에서 로그인 후 `/exhibitions/sibf-2026/map`으로 이동. 아무 부스나 탭 → 반응 버튼에서 "이미 봄" 클릭 → 시트 안에 "여기 어땠어? [끌렸어] [별로]"가 나타나야 한다. "끌렸어"를 누르면 그 줄이 사라져야 한다(retro가 채워졌으므로 `record?.retro`가 true → 컴포넌트가 null 반환). 부스를 바꿨다 다시 그 부스로 돌아오면 되묻기 줄이 다시 안 보여야 한다(이미 답함).

서버 종료: `kill %1`.

- [ ] **Step 6: 커밋**

```bash
git add src/components/map/visited-retro-inline.tsx src/components/map/map-view.tsx \
  src/lib/i18n/dictionaries.ts
git commit -m "feat(map): 가봄 되묻기 인라인 프롬프트 + 코치마크 안내"
```

---

### Task 11: 관람 마치기 일괄 되묻기 — `VisitedRetroPrompt`

**Files:**
- Create: `src/components/companion/visited-retro-prompt.tsx`
- Modify: `src/components/companion/finish-visit.tsx`
- Modify: `src/lib/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: Task 4의 `GET /api/me/notes/pending-retro`, Task 5의 `pushRetro`.
- Produces: `<VisitedRetroPrompt exhibitionSlug={string} onDone={() => void} />` — `finish-visit.tsx`가 기존 회고 흐름 앞에 끼워 넣는다.

- [ ] **Step 1: 사전 키 추가**

`src/lib/i18n/dictionaries.ts`의 `companion:` 블록에(Task 8에서 추가한 taste 키들 근처) 추가:

ko:
```typescript
    retroBatchTitle: "오늘 갔던 데 중에 어디가 괜찮았어?",
    retroBatchSkip: "괜찮아, 넘어갈게",
```

en:
```typescript
    retroBatchTitle: "Which of today's spots stood out?",
    retroBatchSkip: "Skip this",
```

- [ ] **Step 2: `VisitedRetroPrompt` 작성**

`src/components/companion/visited-retro-prompt.tsx`(신규):

```typescript
"use client";

import { useEffect, useState } from "react";
import { Heart, X } from "lucide-react";
import { api } from "@/lib/api/client";
import { pushRetro } from "@/lib/stores/visit";
import { useT } from "@/lib/i18n/provider";

interface PendingBooth {
  boothId: string;
  boothName: string;
}

/**
 * 관람 마치기에서, '가봄'인데 아직 "여기 어땠어?"에 답 안 한 부스를 몇 개 묶어
 * 한 번에 되묻는다. 부스 수가 많은 전시에서 하나씩 지도로 되묻는 건 비현실적이라
 * 여기서 한 번에 처리한다. 답한 부스는 목록에서 바로 빠진다. 전부 답하거나
 * 건너뛰면 onDone()을 불러 기존 회고 흐름으로 넘어간다. 대상이 없으면 아무것도
 * 렌더하지 않고 즉시 onDone()을 부른다(부모가 렌더 중 호출해도 안전하도록 effect로).
 */
export function VisitedRetroPrompt({
  exhibitionSlug,
  onDone,
}: {
  exhibitionSlug: string;
  onDone: () => void;
}) {
  const t = useT();
  const [pending, setPending] = useState<PendingBooth[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .get<{ pending: PendingBooth[] }>(
        `/api/me/notes/pending-retro?exhibitionSlug=${encodeURIComponent(exhibitionSlug)}`,
      )
      .then((r) => {
        if (!cancelled) setPending(r.pending);
      })
      .catch(() => {
        if (!cancelled) setPending([]);
      });
    return () => {
      cancelled = true;
    };
  }, [exhibitionSlug]);

  useEffect(() => {
    if (pending !== null && pending.length === 0) onDone();
  }, [pending, onDone]);

  function answer(boothId: string, liked: boolean) {
    setPending((prev) => (prev ? prev.filter((b) => b.boothId !== boothId) : prev));
    void pushRetro(boothId, liked);
  }

  if (!pending || pending.length === 0) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      <p className="text-sm font-bold">{t("companion.retroBatchTitle")}</p>
      <ul className="space-y-2">
        {pending.map((b) => (
          <li
            key={b.boothId}
            className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
          >
            <span className="truncate text-sm font-semibold">{b.boothName}</span>
            <div className="flex shrink-0 gap-1.5">
              <button
                type="button"
                aria-label={t("reaction.interested")}
                onClick={() => answer(b.boothId, true)}
                className="flex size-8 items-center justify-center rounded-lg border border-border active:bg-accent/40"
              >
                <Heart className="size-4" aria-hidden />
              </button>
              <button
                type="button"
                aria-label={t("reaction.skip")}
                onClick={() => answer(b.boothId, false)}
                className="flex size-8 items-center justify-center rounded-lg border border-border active:bg-accent/40"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onDone}
        className="w-full text-center text-xs font-semibold text-muted-foreground active:opacity-70"
      >
        {t("companion.retroBatchSkip")}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `finish-visit.tsx`에 삽입**

`src/components/companion/finish-visit.tsx` 전체 교체:

```typescript
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Flag } from "lucide-react";
import { api } from "@/lib/api/client";
import { RecapSheet } from "@/components/route/recap-sheet";
import { VisitedRetroPrompt } from "@/components/companion/visited-retro-prompt";
import { useT } from "@/lib/i18n/provider";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

/**
 * 관람 마치기 — 답 안 한 '가봄' 되묻기가 있으면 먼저 묻고(VisitedRetroPrompt),
 * 그 다음 신호 기반 회고를 접어(POST /api/me/reflect) 회고 시트를 연다.
 * 동선 완료가 사라져(Phase A) 회고 트리거를 이 명시적 액션으로 대체. peak-end 해소.
 */
export function FinishVisit({ slug }: { slug: string }) {
  const t = useT();
  const router = useRouter();
  const [retroOpen, setRetroOpen] = useState(false);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  async function finishReflect() {
    if (busy) return;
    setBusy(true);
    try {
      await api.post("/api/me/reflect", { exhibitionSlug: slug });
    } catch {
      // 실패해도 최신 회고를 보여준다.
    } finally {
      setBusy(false);
      setRetroOpen(false);
      setOpen(true);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setRetroOpen(true)}
        disabled={busy}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-2xl border border-border bg-card py-3.5 text-sm font-semibold text-muted-foreground active:opacity-70 disabled:opacity-50"
      >
        <Flag className="size-4" aria-hidden />
        {busy ? t("recap.finishing") : t("recap.finish")}
      </button>

      <Sheet open={retroOpen} onOpenChange={setRetroOpen}>
        <SheetContent side="bottom" className="px-5 pb-8">
          <SheetHeader>
            <SheetTitle>{t("recap.finish")}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            <VisitedRetroPrompt exhibitionSlug={slug} onDone={finishReflect} />
          </div>
        </SheetContent>
      </Sheet>

      <RecapSheet
        open={open}
        onClose={() => {
          setOpen(false);
          router.push("/");
        }}
      />
    </>
  );
}
```

주의: `VisitedRetroPrompt`가 대상 0개면 `useEffect`에서 즉시 `onDone()`(=`finishReflect`)을 부르므로, 사용자 눈엔 되묻기 시트가 거의 안 보이고 바로 회고로 넘어간다(정상 — 되묻을 게 없으면 건너뛴다). `finishReflect`가 `setOpen(true)`로 `RecapSheet`를 열기 전에 `retroOpen`을 닫아 시트가 겹치지 않게 한다.

- [ ] **Step 4: 타입체크 + eslint**

Run: `npx tsc --noEmit && npx eslint src/components/companion/visited-retro-prompt.tsx src/components/companion/finish-visit.tsx`
Expected: 에러 없음.

- [ ] **Step 5: mock 서버로 수동 검증**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev -p 3111 &
sleep 6
```

브라우저에서 로그인 → 지도에서 부스 하나를 "이미 봄"으로 찍고(되묻기는 무시) → 전시 홈으로 돌아와 "오늘 관람 마치기" 클릭. 되묻기 시트에 방금 그 부스가 목록에 나타나야 한다 → "끌렸어" 클릭 → 목록에서 사라지고(대상이 그거 하나뿐이었다면) 자동으로 회고 시트로 넘어가야 한다.

서버 종료: `kill %1`.

- [ ] **Step 6: 커밋**

```bash
git add src/components/companion/visited-retro-prompt.tsx \
  src/components/companion/finish-visit.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(recap): 관람 마치기에서 답 안 한 가봄 되묻기 일괄 처리"
```

---

### Task 12: 최종 점검

**Files:** 없음(검증만).

**Interfaces:** 없음 — 이전 모든 태스크의 결과물을 통합 확인.

- [ ] **Step 1: 전체 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음.

- [ ] **Step 2: 전체 vitest**

Run: `npx vitest run`
Expected: 전체 통과. `src/lib/memory/taste.test.ts`(14개) + `src/lib/mock/repository.test.ts`(기존 + 신규 6개)를 포함해 이전 태스크들에서 깨진 테스트가 없는지 확인.

- [ ] **Step 3: 전체 eslint(변경 파일)**

Run:
```bash
npx eslint \
  src/lib/memory/taste.ts src/lib/memory/service.ts \
  src/lib/types/index.ts src/lib/repositories/types.ts \
  src/lib/supabase/repository.ts src/lib/mock/repository.ts \
  "src/app/api/me/notes/[boothId]/route.ts" \
  "src/app/api/me/notes/[boothId]/retro/route.ts" \
  src/app/api/me/notes/pending-retro/route.ts \
  src/lib/stores/visit.ts src/lib/stores/companion.ts \
  src/components/companion/home-companion-context.tsx \
  "src/app/(visitor)/exhibitions/[slug]/page.tsx" \
  src/components/companion/companion-bar.tsx \
  src/components/feed/reaction-bar.tsx \
  src/components/map/visited-retro-inline.tsx src/components/map/map-view.tsx \
  src/components/companion/visited-retro-prompt.tsx src/components/companion/finish-visit.tsx \
  src/lib/i18n/dictionaries.ts
```
Expected: 에러 없음(경고는 기존에 있던 것 외에 새로 늘지 않았는지 확인).

- [ ] **Step 4: 죽은 참조 확인**

Run: `grep -rn "progressLabel\|progressDone\|bumpProgress\|tasteProgress" src/ --include="*.ts" --include="*.tsx"`
Expected: 빈 출력.

- [ ] **Step 5: 마이그레이션 실행 확인**

사용자에게 확인: "Task 1의 `0031_booth_note_judgment.sql`을 Supabase SQL Editor에서 실행했는지" 다시 확인한다. 실행 안 됐다면 여기서 요청하고 완료를 기다린다 — 운영 배포 전 필수(마이그레이션 없이 배포하면 `judged_class`/`retro` 컬럼이 없어 반응 저장이 500으로 죽는다, 이번 세션의 0029 때와 같은 실패 양상).

- [ ] **Step 6: 전체 플로우 수동 워크스루**

Run:
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev -p 3111 &
sleep 6
```

브라우저에서:
1. 새 닉네임으로 로그인 → 전시 홈. 하단 필에 배지 없음, 회전 문구에 "아직 널 모르겠어" 확인.
2. 피드 카드에 `끌림`을 4번 누른다 — 배지 계속 안 보임(judged<5), 문구가 "조금씩 감이 오는데"로 바뀌는지 확인.
3. 5번째 `끌림` — "이제 좀 감이 온다" 플래시 확인, 그 직후 하단 배지에 `취향 N%` 등장 확인.
4. 지도로 이동 → 부스 하나 `이미 봄` → 시트에 "여기 어땠어?" 확인 → `별로` 클릭 → 사라짐 확인.
5. 전시 홈 → "오늘 관람 마치기" → 되묻기 대상 없으면 곧장 회고 시트로 넘어가는지 확인(4번 부스는 이미 답했으므로 목록에 없어야 함).

서버 종료: `kill %1`.

- [ ] **Step 7: 최종 커밋(있다면)**

이 태스크는 보통 코드 변경이 없다(검증만) — 검증 중 발견한 사소한 수정이 있었다면 그것만 별도로 커밋한다. 없으면 커밋 없이 종료.
