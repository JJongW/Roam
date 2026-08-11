# 판단 어휘 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부스 반응 4칸(끌림·나중에·별로·이미 봄)을 관심(피드, 꼭 갈래·끌려·패스)과 판정(현장, 좋았어·그냥그랬어·아니었어) 두 축으로 가르고, 예측(interest)과 결과(verdict)가 짝지어지도록 데이터 모델·채점·UI·로미 발화·지도 색·회고를 전부 갈아 끼운다.

**Architecture:** `BoothNote.status`(4값 단일 필드) → `interest`/`verdict`/`visitedAt`(직교 3필드)로 바꾼다. 아래에서 위로 쌓는다 — 타입 → 순수 채점 로직 → 저장소 → API → 클라 스토어 → 공유 UI 컴포넌트(`judgment-bar.tsx`, 3 모드) → 화면별 배선(피드·지도·부스상세) → 로미 발화 → 회고. 지도 하단 시트는 `adaptive` 모드로 관심 여부에 따라 자동 분기한다(interest 없음→관심 3칸, interest 있음→판정 3칸, verdict 있음→판정 3칸 선택 표시).

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · Tailwind v4 · Zod · Supabase(Postgres) · vitest + jsdom + @testing-library/react

## Global Constraints

- 스펙: `docs/decisions/2026-08-10_judgment-vocabulary.md`(§8-1/8-2가 `docs/decisions/2026-08-11_taste-radar-map-sheet-zoom.md` §3-3으로 개정됨 — **지도·부스상세는 `both` 고정이 아니라 `adaptive`(관심 여부 분기)를 쓴다**).
- 확신 임계값은 **`CONFIDENT_THRESHOLD`**(`src/lib/constants.ts:190`, 이미 `0.25`로 추출돼 있다 — 새 상수를 또 만들지 않는다).
- 신호 가중치(`SIGNAL_WEIGHTS`): `reaction_must` explicit 1.2 · `reaction_curious` explicit 0.6 · `reaction_pass` negative 0.5 · `verdict_good` explicit 1.5 · `verdict_ok` implicit 0.3 · `verdict_bad` negative 1.2. 유지: `booth_bookmarked` 1.2 · `route_saved` 1.5 · `feed_click` 0.3 · `search_query` 1.3.
- 채점(`judgmentScore`): verdict 있으면 interest 무시. `good`→+1, `ok`→0, `bad`→confident면 -1 아니면 0. verdict 없으면 `must`→+1, `curious`→+0.6, `pass`→confident면 -1 아니면 0, 없음→null.
- 지도 6색(라이트): 꼭 갈래 `#4f46e5`(`--primary` 재사용) · 끌려 `#8b88ee` · 좋았어 `#15c47e`(`--route-visited` 재사용) · 그냥그랬어 `#7edcb4` · 아니었어 `#d0595d` · 패스 `#aab2bf`. 전부 면(fill), 테두리·뱃지로 상태를 나르지 않는다.
- 지도 색 규칙: `verdict ?? interest ?? 존 색`.
- 신호는 append-only 원장이다 — 과거 신호를 지우거나 고치지 않는다. `interest`/`verdict`는 그 위에서 파생된 현재 상태 필드다.
- 주석은 한국어, **무엇을 하는지가 아니라 왜 그런지**를 쓴다(레포 관례).
- 가치 이름을 로미 발화에 쓰지 않는다(`docs/decisions/2026-07-13_romi-ux-writing.md`, 기존 원칙 — 새 6종 발화도 동일).
- 새 npm 의존성을 추가하지 않는다.
- 검증 3종은 매 태스크 끝에 돌린다: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.
- `supabase/`는 gitignore라 로컬 저장소에 전체가 없다(Task 14 참고 — 마이그레이션 번호는 로컬 최신 파일로 알 수 없다).

---

### Task 1: 데이터 모델 — 타입 · 신호 가중치 · 입력 스키마

**Files:**
- Modify: `src/lib/types/index.ts:280-295` (`BoothNote`), `:348-356`(`SignalKind`)
- Modify: `src/lib/constants.ts:152-167` (`SIGNAL_WEIGHTS`)
- Modify: `src/lib/schemas/index.ts:193-203` (`boothNoteInputSchema`)

**Interfaces:**
- Consumes: 없음(최하단 타입 계층)
- Produces:
  - `BoothNote`: `interest?: "must" | "curious" | "pass"`, `verdict?: "good" | "ok" | "bad"`, `visitedAt?: string`(ISO), `judgedClass?: "confident" | "uncertain"`(유지), `memo?/photos?/updatedAt`(유지). `status`·`retro` 필드는 삭제.
  - `SignalKind`: `"reaction_must" | "reaction_curious" | "reaction_pass" | "verdict_good" | "verdict_ok" | "verdict_bad" | "booth_bookmarked" | "route_saved" | "feed_click" | "search_query"`. `reaction_interested`·`reaction_later`·`booth_visited`·`booth_skipped`는 삭제.
  - `SIGNAL_WEIGHTS`: 위 6개 신규 키 + 기존 4개 유지 키를 담은 `Record<SignalKind, {explicit,implicit,negative}>`.
  - `boothNoteInputSchema`: `interest`/`verdict` 각각 nullish enum, `visitedAt` 없음(서버가 verdict 쓰기 시점에 자동 기록 — 클라가 안 보낸다).

- [ ] **Step 1: `BoothNote` 타입 교체**

`src/lib/types/index.ts:280-295`, 기존:

```ts
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

새로:

```ts
/**
 * A signed-in visitor's personal record for a booth (관심 / 판정 / 메모 / 사진).
 *
 * interest와 verdict는 직교한다 — "꼭 갈래로 찍어둔 곳에 다녀와서 좋았어"가 동시에
 * 참일 수 있다. interest는 화면(관람 전)에서 한 판단, verdict는 현장(관람 중·후)에서
 * 한 판단이다. 지도 색은 `verdict ?? interest ?? 존 색`(결과가 예측을 덮는다).
 */
export interface BoothNote {
  userId: string;
  boothId: string;
  /** 관람 전 판단 — 피드·지도에서 아직 안 가본 부스에 매긴다. */
  interest?: "must" | "curious" | "pass";
  /** 현장 판단 — 다녀온 부스의 만족도. 이게 곧 방문 기록이다(verdict 있으면
   *  visitedAt도 항상 있다). */
  verdict?: "good" | "ok" | "bad";
  /** verdict를 남긴 시각(=방문 시각). verdict 해제 시 같이 지운다 — 판정이 곧
   *  방문 기록이므로 둘을 분리해서 남기지 않는다. */
  visitedAt?: string;
  /** 가장 최근 반응(interest 또는 verdict) 판정 시점의 확신 등급 — 취향 정확도
   *  채점용. verdict 기록이 더 나중이자 최종이다. */
  judgedClass?: "confident" | "uncertain";
  memo?: string;
  /** Personal photos (Cloudinary URLs) attached to this booth note. */
  photos?: string[];
  updatedAt: string;
}
```

- [ ] **Step 2: `SignalKind` 교체**

`src/lib/types/index.ts:348-356`, 기존:

```ts
export type SignalKind =
  | "booth_visited"
  | "booth_skipped"
  | "booth_bookmarked"
  | "route_saved"
  | "feed_click"
  | "reaction_interested" // 끌림
  | "reaction_later" // 나중에
  | "search_query"; // 특정 부스 검색 = 강한 능동 관심
```

새로:

```ts
export type SignalKind =
  | "booth_bookmarked"
  | "route_saved"
  | "feed_click"
  | "reaction_must" // 꼭 갈래 — 관람 전, 가겠다고 정한 것
  | "reaction_curious" // 끌려 — 관람 전, 좋은데 확정 아님
  | "reaction_pass" // 패스 — 관람 전, 카드만 보고 내린 거절
  | "verdict_good" // 좋았어 — 현장, 몸으로 확인한 긍정
  | "verdict_ok" // 그냥그랬어 — 현장, 중립
  | "verdict_bad" // 아니었어 — 현장, 가보고 아니었다
  | "search_query"; // 특정 부스 검색 = 강한 능동 관심
```

- [ ] **Step 3: `SIGNAL_WEIGHTS` 교체**

`src/lib/constants.ts:152-167`, 기존:

```ts
/**
 * L4 메모리 — 신호 종류별 가중치. 관심 confidence 수학(순수·결정론)의 입력.
 * booth_visited=암묵 강 / bookmark·route=명시 / skip=음의 신호.
 */
export const SIGNAL_WEIGHTS: Record<
  SignalKind,
  { explicit: number; implicit: number; negative: number }
> = {
  booth_visited: { explicit: 0, implicit: 1.0, negative: 0 },
  booth_bookmarked: { explicit: 1.2, implicit: 0, negative: 0 },
  route_saved: { explicit: 1.5, implicit: 0, negative: 0 },
  booth_skipped: { explicit: 0, implicit: 0, negative: 0.8 },
  // 피드 카드 클릭 = 약한 암묵 관심(둘러봄). 방문보다 가볍게.
  feed_click: { explicit: 0, implicit: 0.3, negative: 0 },
  // 반응 버튼: 끌림=명시 강, 나중에=약한 명시. 별로/이미봄은 skip/visited 재사용.
  reaction_interested: { explicit: 1.2, implicit: 0, negative: 0 },
  reaction_later: { explicit: 0.5, implicit: 0, negative: 0 },
  // 특정 부스를 직접 검색 = 능동적 강한 관심(끌림에 준함).
  search_query: { explicit: 1.3, implicit: 0, negative: 0 },
};
```

새로:

```ts
/**
 * L4 메모리 — 신호 종류별 가중치. 관심 confidence 수학(순수·결정론)의 입력.
 *
 * 원칙: 경험한 판정이 화면상의 판단을 이긴다. verdict_good(1.5) > reaction_must(1.2),
 * verdict_bad(1.2) > reaction_pass(0.5) — 안 가보고 내린 판단보다 가보고 내린
 * 판단을 무겁게 친다(judgment-vocabulary §5).
 */
export const SIGNAL_WEIGHTS: Record<
  SignalKind,
  { explicit: number; implicit: number; negative: number }
> = {
  booth_bookmarked: { explicit: 1.2, implicit: 0, negative: 0 },
  route_saved: { explicit: 1.5, implicit: 0, negative: 0 },
  // 피드 카드 클릭 = 약한 암묵 관심(둘러봄). 방문보다 가볍게.
  feed_click: { explicit: 0, implicit: 0.3, negative: 0 },
  // 관람 전(피드) — 가겠다고 정한 것이 가장 강한 명시 의사, 끌림은 그 절반.
  reaction_must: { explicit: 1.2, implicit: 0, negative: 0 },
  reaction_curious: { explicit: 0.6, implicit: 0, negative: 0 },
  // 카드만 보고 내린 거절 — 근거가 얕아 약하게.
  reaction_pass: { explicit: 0, implicit: 0, negative: 0.5 },
  // 현장(판정) — 몸으로 확인한 긍정이 전체 최고. 가보고 아니었다가 가장 확실한 부정.
  verdict_good: { explicit: 1.5, implicit: 0, negative: 0 },
  verdict_ok: { explicit: 0, implicit: 0.3, negative: 0 },
  verdict_bad: { explicit: 0, implicit: 0, negative: 1.2 },
  // 특정 부스를 직접 검색 = 능동적 강한 관심(꼭 갈래에 준함).
  search_query: { explicit: 1.3, implicit: 0, negative: 0 },
};
```

- [ ] **Step 4: `boothNoteInputSchema` 교체**

`src/lib/schemas/index.ts:193-203`, 기존:

```ts
export const boothNoteInputSchema = z.object({
  // 반응 네 가지 전부 계정에 남는다(0029). 끌림·나중에가 로컬 전용이던 동안엔
  // 폰을 바꾸면 지도 색이 사라졌고, 끌림이 서버의 visited를 null로 덮어썼다.
  status: z
    .enum(["visited", "skipped", "interested", "later"])
    .nullish(),
  memo: z.string().max(300).optional(),
  /** Personal photos (Cloudinary URLs). Capped to keep notes lightweight. */
  photos: z.array(z.string().url()).max(4).optional(),
});
export type BoothNoteInput = z.infer<typeof boothNoteInputSchema>;
```

새로:

```ts
export const boothNoteInputSchema = z.object({
  // interest·verdict 둘 다 계정에 남는다. 둘은 직교라 한 요청이 둘 다 보낼 수도,
  // 하나만 보낼 수도 있다(호출부가 바뀐 필드만 채워 보낸다) — 나머지는 undefined로
  // 두면 서버가 그 필드를 안 건드린다.
  interest: z.enum(["must", "curious", "pass"]).nullish(),
  verdict: z.enum(["good", "ok", "bad"]).nullish(),
  memo: z.string().max(300).optional(),
  /** Personal photos (Cloudinary URLs). Capped to keep notes lightweight. */
  photos: z.array(z.string().url()).max(4).optional(),
});
export type BoothNoteInput = z.infer<typeof boothNoteInputSchema>;
```

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit
```

Expected: 이 시점에서 대량의 타입 에러가 난다 — `status`/`retro`/`reaction_interested` 등을 참조하던 다운스트림 파일(Task 3~13 대상)이 전부 깨진다. **이건 정상이다.** 이 태스크는 타입만 바꾸고, 참조하는 쪽은 이후 태스크가 순서대로 고친다. `npx vitest run`은 이번 태스크에서 돌리지 않는다(전체 스위트가 이 시점엔 컴파일 자체가 안 된다) — Task 1은 타입 파일만 diff에 넣고 커밋한다.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/types/index.ts src/lib/constants.ts src/lib/schemas/index.ts
git commit -m "feat(types): 판단 어휘 데이터 모델 — status/retro를 interest/verdict/visitedAt으로

관심(피드)과 판정(현장)이 서로 다른 두 질문인데 status 한 필드가 둘 다
받고 있었다. interest·verdict를 직교 필드로 분리해 '꼭 갈래로 찍어둔 곳에
가봤더니 아니었다'를 표현할 수 있게 한다.

신호도 6종으로 재편한다. verdict_good(1.5) > reaction_must(1.2),
verdict_bad(1.2) > reaction_pass(0.5) — 경험한 판정이 화면상의 판단을
이긴다.

이 커밋 시점엔 컴파일이 깨진다 — 참조하는 다운스트림은 이후 태스크가
순서대로 고친다."
```

---

### Task 2: 순수 채점 — `judgmentScore` verdict 우선

**Files:**
- Modify: `src/lib/memory/taste.ts`
- Test: `src/lib/memory/taste.test.ts`(기존 파일 대폭 교체)

**Interfaces:**
- Consumes: `BoothNote`(Task 1) — `interest`/`verdict`/`judgedClass` 필드
- Produces: `judgmentScore(interest, verdict, judgedClass): number | null`(시그니처 변경 — 기존은 `(status, judgedClass, retro)`)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/memory/taste.test.ts`를 다음으로 **전체 교체**한다(기존 파일은 `status`/`retro` 기반이라 전부 깨져 있다):

```ts
import { describe, expect, it } from "vitest";
import {
  classifyBooth,
  computeTasteAccuracy,
  judgmentScore,
  INSIGHT_THRESHOLD,
} from "./taste";
import type { Booth, UserBrain } from "@/lib/types";

const brain = (confidence: number): UserBrain => ({
  userId: "u1",
  version: 1,
  updatedAt: "",
  literacy: { overall: 0, byTheme: {}, visitsCount: 0, boothsSeenCount: 0 },
  interests: [
    {
      key: "goods",
      label: "굿즈",
      confidence,
      signals: { explicit: 0, implicit: 0, negative: 0 },
      firstSeenAt: "",
      lastSeenAt: "",
      trend: "flat",
    },
  ],
  mutedSlugs: [],
  preferences: {},
  goals: [],
  visits: [],
  health: { lastDistilledAt: "", decayHalfLifeDays: 90 },
});

const booth = (tags: string[]): Booth => ({
  id: "b1",
  exhibitionId: "e1",
  hallId: "h1",
  categoryId: "c1",
  name: "부스",
  company: "",
  description: "",
  longDescription: "",
  images: [],
  tags,
  x: 0,
  y: 0,
  popularity: 0,
  createdAt: "",
});

describe("classifyBooth", () => {
  it("확신 가치와 겹치면 confident", () => {
    expect(classifyBooth(booth(["goods"]), brain(0.3))).toBe("confident");
  });
  it("겹치는 확신 가치가 없으면 uncertain", () => {
    expect(classifyBooth(booth(["trend"]), brain(0.3))).toBe("uncertain");
  });
});

describe("judgmentScore — verdict 우선", () => {
  it("verdict='good'은 confident 여부와 무관하게 +1", () => {
    expect(judgmentScore(null, "good", "confident")).toBe(1);
    expect(judgmentScore(null, "good", "uncertain")).toBe(1);
  });
  it("verdict='ok'는 항상 0", () => {
    expect(judgmentScore("must", "ok", "confident")).toBe(0);
    expect(judgmentScore(null, "ok", "uncertain")).toBe(0);
  });
  it("verdict='bad'는 confident면 -1, uncertain이면 0", () => {
    expect(judgmentScore(null, "bad", "confident")).toBe(-1);
    expect(judgmentScore(null, "bad", "uncertain")).toBe(0);
  });
  it("verdict가 있으면 interest는 완전히 무시된다", () => {
    // must(예측 긍정)여도 verdict=bad(결과 부정)면 결과가 이긴다.
    expect(judgmentScore("must", "bad", "confident")).toBe(-1);
  });

  it("verdict 없을 때 interest='must'는 +1", () => {
    expect(judgmentScore("must", null, "confident")).toBe(1);
  });
  it("verdict 없을 때 interest='curious'는 +0.6", () => {
    expect(judgmentScore("curious", null, "uncertain")).toBe(0.6);
  });
  it("verdict 없을 때 interest='pass'는 confident면 -1, uncertain이면 0", () => {
    expect(judgmentScore("pass", null, "confident")).toBe(-1);
    expect(judgmentScore("pass", null, "uncertain")).toBe(0);
  });
  it("interest·verdict 둘 다 없으면 null(채점 제외)", () => {
    expect(judgmentScore(null, null, "confident")).toBeNull();
  });
  it("judgedClass가 없으면(소급 채점 금지) 무조건 null", () => {
    expect(judgmentScore("must", null, null)).toBeNull();
    expect(judgmentScore(null, "good", undefined)).toBeNull();
  });
});

describe("computeTasteAccuracy", () => {
  it("판정이 임계값 미만이면 pct는 null이어도 judgedCount는 정확하다", () => {
    const notes = Array.from({ length: 3 }, () => ({
      interest: "must" as const,
      verdict: null,
      judgedClass: "confident" as const,
    }));
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(3);
    expect(r.pct).toBeNull();
  });

  it(`판정 ${INSIGHT_THRESHOLD}개, 1개만 틀림(confident verdict=bad) → 80%`, () => {
    const notes = [
      ...Array.from({ length: 4 }, () => ({
        interest: null,
        verdict: "good" as const,
        judgedClass: "confident" as const,
      })),
      { interest: null, verdict: "bad" as const, judgedClass: "confident" as const },
    ];
    const r = computeTasteAccuracy(notes);
    expect(r.judgedCount).toBe(5);
    // (4*1 + 1*-1) / 5 = 0.6 → (0.6+1)/2*100 = 80
    expect(r.pct).toBe(80);
  });

  it("verdict 없는 must+curious 조합도 채점된다", () => {
    const notes = [
      { interest: "must" as const, verdict: null, judgedClass: "confident" as const },
      { interest: "curious" as const, verdict: null, judgedClass: "uncertain" as const },
      { interest: null, verdict: null, judgedClass: "confident" as const },
      { interest: null, verdict: null, judgedClass: "confident" as const },
      { interest: null, verdict: null, judgedClass: "confident" as const },
    ];
    const r = computeTasteAccuracy(notes);
    // interest만 있는 2개만 채점 대상(null,null인 3개는 제외) → judgedCount 2
    expect(r.judgedCount).toBe(2);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/memory/taste.test.ts`
Expected: FAIL — `judgmentScore`의 시그니처가 아직 `(status, judgedClass, retro)`라 `interest`/`verdict` 인자와 안 맞는다.

- [ ] **Step 3: `taste.ts` 구현**

`src/lib/memory/taste.ts` 전체를 다음으로 교체(기존 import `CONFIDENT_THRESHOLD`는 이미 `constants.ts`에서 가져오고 있다 — Plan B가 추출):

```ts
// L4 메모리 — 로미가 예측한 취향을 사용자가 확인해준 정도(정확도). 순수·결정론,
// I/O 없음. "취향 %"는 여기서 나온다: 반응이 로미의 예측을 맞혔는지 채점한다.
//
// 채점 규칙: 자신 있다고 한 것만 틀렸을 때 깎인다. 부스가 사용자의 확신 가치(브레인
// confidence≥CONFIDENT_THRESHOLD)와 겹치면 confident, 아니면 uncertain — uncertain
// 부스는 맞으면 가산되고 틀려도 무해하다(낯선 부스를 찔러보는 탐색에 벌점을 주지 않는다).
import { CONFIDENT_THRESHOLD } from "@/lib/constants";
import { interestScore } from "@/lib/engine/scoring";
import type { Booth, BoothNote, UserBrain } from "@/lib/types";

export type JudgedClass = "confident" | "uncertain";

/** 부스가 사용자의 확신 가치와 겹치는지 — 판정 시점에 얼려서 저장한다. */
export function classifyBooth(booth: Booth, brain: UserBrain): JudgedClass {
  const confidentSlugs = brain.interests
    .filter((n) => n.confidence >= CONFIDENT_THRESHOLD)
    .map((n) => n.key);
  return interestScore(booth, confidentSlugs) > 0 ? "confident" : "uncertain";
}

/**
 * 반응(interest/verdict) → 채점 점수. 채점 대상이 아니면 null.
 *
 * verdict가 있으면 interest는 완전히 무시한다 — 몸으로 확인한 결과가 화면상의
 * 예측을 이긴다. "꼭 갈래(must)로 찍어놓고 가봤더니 아니었다(verdict=bad)"는
 * 결과가 -1이지, +1과 -1이 상쇄되지 않는다.
 */
export function judgmentScore(
  interest: BoothNote["interest"] | null | undefined,
  verdict: BoothNote["verdict"] | null | undefined,
  judgedClass: JudgedClass | null | undefined,
): number | null {
  // 판정 없이 쌓인 반응(소급 채점 금지)은 무조건 제외.
  if (judgedClass == null) return null;

  if (verdict) {
    switch (verdict) {
      case "good":
        return 1;
      case "ok":
        return 0;
      case "bad":
        return judgedClass === "confident" ? -1 : 0;
    }
  }

  switch (interest) {
    case "must":
      return 1;
    case "curious":
      return 0.6;
    case "pass":
      return judgedClass === "confident" ? -1 : 0;
    default:
      return null; // 해제(둘 다 없음)
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
    interest: BoothNote["interest"] | null | undefined;
    verdict: BoothNote["verdict"] | null | undefined;
    judgedClass: JudgedClass | null | undefined;
  }[],
): TasteAccuracy {
  const scores = notes
    .map((n) => judgmentScore(n.interest, n.verdict, n.judgedClass))
    .filter((s): s is number => s !== null);
  const judgedCount = scores.length;
  if (judgedCount < INSIGHT_THRESHOLD) return { judgedCount, pct: null };
  const sum = scores.reduce((a, b) => a + b, 0);
  // 점수 범위 -1..+1을 0..100으로: -1→0%, 0→50%, +1→100%.
  const pct = Math.round(((sum + judgedCount) / (2 * judgedCount)) * 100);
  return { judgedCount, pct: Math.max(0, Math.min(100, pct)) };
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/memory/taste.test.ts`
Expected: PASS (전체)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "taste.ts\|taste.test.ts"
npx vitest run src/lib/memory/taste.test.ts
npx eslint src/lib/memory/taste.ts src/lib/memory/taste.test.ts
git add src/lib/memory/taste.ts src/lib/memory/taste.test.ts
git commit -m "feat(memory): judgmentScore를 verdict 우선 채점으로

verdict가 있으면 interest는 무시한다 — 몸으로 확인한 결과가 화면상의
예측을 이긴다. 'must+bad'가 처음으로 표현 가능해졌고, 이 조합이 정확히
로미 추천이 빗나간 사례다."
```

---

### Task 3: 저장소 레이어 — `mock`·`supabase` 리포지토리 재작성

**Files:**
- Modify: `src/lib/repositories/types.ts:160-206`
- Modify: `src/lib/mock/repository.ts:713-820`(대략, `listNotes`~`listPendingRetro`)
- Modify: `src/lib/supabase/repository.ts:355-370`(`mapNote`), `:1224-1370`(대략, `listNotes`~`listPendingRetro`)
- Test: `src/lib/mock/repository.test.ts`(관련 부분 교체)

**Interfaces:**
- Consumes: `BoothNote`/`BoothNoteInput`(Task 1)
- Produces:
  - `Repository.upsertNote(userId, boothId, input, judgedClass): Promise<BoothNote>` — 시그니처는 그대로, `input`이 이제 `{interest?, verdict?, memo?, photos?}`.
  - `Repository.listPendingRetro(userId, exhibitionId, limit): Promise<{boothId, boothName}[]>` — **의미가 바뀐다**: "`visitedAt` 있는데 `verdict` 없는" 부스(기존 "visited인데 retro 없는"과 동치 구조, 컬럼만 교체).
  - `Repository.setBoothRetro` — **삭제**. verdict는 이제 `upsertNote`로만 쓴다(retro 전용 API가 필요 없어짐 — verdict가 직교 필드라 upsertNote 한 번으로 interest 건드리지 않고 verdict만 쓸 수 있다).
  - 신규: `Repository.listMustNotVisited(userId, exhibitionId, limit): Promise<{boothId, boothName}[]>` — "interest='must'인데 visitedAt 없는" 부스(§7의 두 번째 되묻기 묶음).

- [ ] **Step 1: `repositories/types.ts` 인터페이스 수정**

`src/lib/repositories/types.ts:160-206`, `setBoothRetro` 선언을 **삭제**하고 `listPendingRetro` 바로 뒤에 신규 메서드를 추가한다. 기존:

```ts
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
```

새로:

```ts
  /** verdict가 있는데 아직 방문 기록(visitedAt)이 없는 부스는 존재할 수 없다 — verdict
   *  자체가 방문 기록이다(judgment-vocabulary §3-3). 그래서 되묻기 대상은 오직
   *  "visitedAt은 있는데 verdict가 없는" 부스뿐이다(레거시 행 + 현장에서 안 누른 것).
   *  관람 마치기용, 최대 limit개. */
  listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]>;
  /** interest='must'로 찍어뒀는데 아직 안 간(visitedAt 없는) 부스 — 관람 마치기에서
   *  "여기 가봤어?"로 단정 없이 묻는 두 번째 되묻기 묶음(judgment-vocabulary §7-2).
   *  최대 limit개. */
  listMustNotVisited(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]>;
```

- [ ] **Step 2: `mock/repository.ts` — `upsertNote`/`getTasteAccuracy`/되묻기 메서드 재작성**

`src/lib/mock/repository.ts:713-820`(대략, `listNotes` 시작부터 `listPendingRetro` 끝까지)를 다음으로 교체한다. `store()`·`now()` 헬퍼는 파일 상단에 이미 있으니 그대로 재사용:

```ts
  async listNotes(userId: string): Promise<BoothNote[]> {
    return store().notes.filter((n) => n.userId === userId);
  }

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
        interest: input.interest ?? undefined,
        verdict: input.verdict ?? undefined,
        // verdict를 새로 쓰는 순간이 곧 방문 시각이다. 해제(verdict===null)면 같이 지운다.
        visitedAt:
          input.verdict !== undefined
            ? (input.verdict ? now() : undefined)
            : undefined,
        memo: input.memo,
        photos: input.photos,
        judgedClass: judgedClass === undefined ? undefined : (judgedClass ?? undefined),
        updatedAt: now(),
      };
      s.notes.push(n);
    } else {
      if (input.interest !== undefined) n.interest = input.interest ?? undefined;
      if (input.verdict !== undefined) {
        n.verdict = input.verdict ?? undefined;
        n.visitedAt = input.verdict ? now() : undefined;
      }
      if (input.memo !== undefined) n.memo = input.memo;
      if (input.photos !== undefined) n.photos = input.photos;
      // Supabase 구현과 같은 규칙: judgedClass가 undefined면 판정 필드를 안 건드린다.
      if (judgedClass !== undefined) {
        n.judgedClass = judgedClass ?? undefined;
      }
      n.updatedAt = now();
    }
    // Drop empty notes so the store stays compact.
    if (!n.interest && !n.verdict && !n.memo?.trim() && !n.photos?.length) {
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
    return computeTasteAccuracy(
      notes.map((n) => ({
        interest: n.interest,
        verdict: n.verdict,
        judgedClass: n.judgedClass,
      })),
    );
  }

  async listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]> {
    const s = store();
    const boothById = new Map(
      s.booths.filter((b) => b.exhibitionId === exhibitionId).map((b) => [b.id, b]),
    );
    return s.notes
      .filter(
        (n) =>
          n.userId === userId &&
          n.visitedAt &&
          !n.verdict &&
          boothById.has(n.boothId),
      )
      .slice(0, limit)
      .map((n) => ({ boothId: n.boothId, boothName: boothById.get(n.boothId)!.name }));
  }

  async listMustNotVisited(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]> {
    const s = store();
    const boothById = new Map(
      s.booths.filter((b) => b.exhibitionId === exhibitionId).map((b) => [b.id, b]),
    );
    return s.notes
      .filter(
        (n) =>
          n.userId === userId &&
          n.interest === "must" &&
          !n.visitedAt &&
          boothById.has(n.boothId),
      )
      .slice(0, limit)
      .map((n) => ({ boothId: n.boothId, boothName: boothById.get(n.boothId)!.name }));
  }
```

`setBoothRetro` 메서드는 완전히 삭제한다(`upsertNote({ verdict: ... })`가 흡수). `computeTasteAccuracy`의 import는 이미 파일 상단에 있을 것이다(없으면 `import { computeTasteAccuracy } from "@/lib/memory/taste";` 확인).

- [ ] **Step 3: `supabase/repository.ts` — `mapNote`/`upsertNote`/되묻기 메서드 재작성**

`src/lib/supabase/repository.ts:355-370`의 `mapNote`, 기존:

```ts
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

새로:

```ts
function mapNote(r: Row): BoothNote {
  return {
    userId: str(r.user_id),
    boothId: str(r.booth_id),
    interest:
      r.interest == null
        ? undefined
        : (String(r.interest) as BoothNote["interest"]),
    verdict:
      r.verdict == null
        ? undefined
        : (String(r.verdict) as BoothNote["verdict"]),
    visitedAt: r.visited_at == null ? undefined : str(r.visited_at),
    judgedClass:
      r.judged_class == null
        ? undefined
        : (String(r.judged_class) as BoothNote["judgedClass"]),
    memo: r.memo == null ? undefined : String(r.memo),
    photos: Array.isArray(r.photos) ? r.photos.map(String) : undefined,
    updatedAt: str(r.updated_at),
  };
}
```

`upsertNote`(`:1233` 부근), 기존:

```ts
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
```

새로:

```ts
  async upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
    judgedClass: "confident" | "uncertain" | null | undefined,
  ): Promise<BoothNote> {
    const db = await this.db();
    const interest = input.interest ?? null;
    const verdict = input.verdict ?? null;
    const memo = input.memo ?? null;
    const photos = input.photos ?? [];
    // Empty note → delete so the gallery/back-end stays clean.
    if (
      !interest &&
      !verdict &&
      (memo == null || !memo.trim()) &&
      photos.length === 0
    ) {
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
      memo,
      photos,
      updated_at: now(),
    };
    // interest·verdict는 각각 "이 요청이 그 필드를 건드리는지"에 따라 SET 절에
    // 넣을지 뺄지 정한다 — undefined면 아예 안 넣어서 upsert 충돌 시 기존 값을
    // 그대로 둔다(메모만 고치는 쓰기가 반응을 조용히 안 건드리게).
    if (input.interest !== undefined) row.interest = interest;
    if (input.verdict !== undefined) {
      row.verdict = verdict;
      // verdict를 새로 쓰는 순간이 곧 방문 시각. 해제하면 같이 지운다 — 판정이
      // 곧 방문 기록이므로 둘을 분리해서 남기지 않는다(judgment-vocabulary §8-2).
      row.visited_at = verdict ? now() : null;
    }
    if (judgedClass !== undefined) row.judged_class = judgedClass;
    const res = await db
      .from("booth_note")
      .upsert(row, { onConflict: "user_id,booth_id" })
      .select("*")
      .single();
    return mapNote(wrote(res, "메모 저장") as Row);
  }
```

`getTasteAccuracy`(`:1298` 부근) 안의 notes 매핑을 `status`/`retro`에서 `interest`/`verdict`로 바꾼다 — 정확한 현재 내용은 파일을 열어 `computeTasteAccuracy(notes.map(...))` 호출부를 찾아 다음 형태로 맞춘다:

```ts
    return computeTasteAccuracy(
      (data ?? []).map((r) => ({
        interest: r.interest == null ? undefined : (String(r.interest) as BoothNote["interest"]),
        verdict: r.verdict == null ? undefined : (String(r.verdict) as BoothNote["verdict"]),
        judgedClass:
          r.judged_class == null
            ? undefined
            : (String(r.judged_class) as BoothNote["judgedClass"]),
      })),
    );
```

`setBoothRetro`(`:1332-1349`)는 **메서드 전체를 삭제**한다.

`listPendingRetro`(`:1352` 부근)의 where 절을 `status='visited'`+`retro is null` → `visited_at is not null`+`verdict is null`로 바꾼다. 기존 구조(부스 이름 맵 만들고 `booth_note`에서 `booth_id` 조회) 그대로, `.eq("status", "visited").is("retro", null)`를 `.not("visited_at", "is", null).is("verdict", null)`로 교체한다. 그 바로 뒤에 `listMustNotVisited`를 같은 패턴으로 신규 추가한다(`.eq("interest", "must").is("visited_at", null)`).

- [ ] **Step 4: mock 테스트 갱신**

`src/lib/mock/repository.test.ts`에서 `status`/`retro`/`listPendingRetro`를 테스트하던 부분을 찾아(`grep -n "status\|retro\|listPendingRetro" src/lib/mock/repository.test.ts`) `interest`/`verdict`/`visitedAt` 기준으로 고친다. 최소한 다음을 커버해야 한다 — 없으면 추가:

```ts
describe("upsertNote — interest/verdict 직교", () => {
  it("interest만 써도 verdict는 안 건드린다", async () => {
    const repo = new MockRepository();
    const user = await repo.createUser("t1");
    await repo.upsertNote(user.id, "b1", { interest: "must" }, "confident");
    await repo.upsertNote(user.id, "b1", { verdict: "good" }, "confident");
    const notes = await repo.listNotes(user.id);
    const n = notes.find((x) => x.boothId === "b1")!;
    expect(n.interest).toBe("must");
    expect(n.verdict).toBe("good");
  });

  it("verdict를 쓰면 visitedAt이 채워진다", async () => {
    const repo = new MockRepository();
    const user = await repo.createUser("t2");
    const note = await repo.upsertNote(user.id, "b1", { verdict: "ok" }, "uncertain");
    expect(note.visitedAt).toBeDefined();
  });

  it("verdict를 해제하면 visitedAt도 같이 지워진다", async () => {
    const repo = new MockRepository();
    const user = await repo.createUser("t3");
    await repo.upsertNote(user.id, "b1", { verdict: "good" }, "confident");
    const cleared = await repo.upsertNote(user.id, "b1", { verdict: null }, null);
    expect(cleared.verdict).toBeUndefined();
    expect(cleared.visitedAt).toBeUndefined();
  });

  it("listPendingRetro: visitedAt 있고 verdict 없는 부스만", async () => {
    const repo = new MockRepository();
    const user = await repo.createUser("t4");
    const ex = /* 기존 테스트가 쓰던 전시 시드 패턴을 그대로 재사용 */;
    // ... 기존 테스트의 전시/부스 시드 방식을 그대로 따라 booth b1(verdict 없음),
    // b2(verdict='good')를 만들고 listPendingRetro가 b1만 반환하는지 확인
  });

  it("listMustNotVisited: interest='must'이고 visitedAt 없는 부스만", async () => {
    const repo = new MockRepository();
    const user = await repo.createUser("t5");
    await repo.upsertNote(user.id, "b1", { interest: "must" }, "confident");
    await repo.upsertNote(user.id, "b2", { interest: "must" }, "confident");
    await repo.upsertNote(user.id, "b2", { verdict: "good" }, "confident"); // b2는 다녀옴
    // listMustNotVisited(user.id, exhibitionId, 10)가 b1만 반환하는지 확인
    // (정확한 전시 시드 호출부는 기존 listPendingRetro 테스트의 패턴을 그대로 따른다)
  });
});
```

> 위 두 개(`listPendingRetro`/`listMustNotVisited`) 테스트는 전시·부스 시드가 필요해서 기존 `it("listPendingRetro: visited이고 retro 없는 부스만, limit 적용"` 테스트(`repository.test.ts:176`)의 셋업 패턴을 그대로 복사해 적용한다 — 그 테스트를 먼저 읽고 동일한 시드 헬퍼를 재사용할 것.

- [ ] **Step 5: 통과 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: PASS

- [ ] **Step 6: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "repository\|repositories/types"
npx vitest run src/lib/mock/repository.test.ts
npx eslint src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/supabase/repository.ts src/lib/mock/repository.test.ts
git add src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/supabase/repository.ts src/lib/mock/repository.test.ts
git commit -m "feat(repo): interest/verdict 직교 저장 — setBoothRetro 폐기, listMustNotVisited 신규

upsertNote가 interest·verdict를 독립적으로 SET한다 — 하나만 보내면 나머지는
안 건드린다. verdict를 쓰는 순간이 곧 visitedAt, 해제하면 같이 지운다
(판정이 곧 방문 기록이므로 분리해서 안 남긴다).

retro 전용 API(setBoothRetro)는 사라진다 — verdict가 직교 필드라 upsertNote
하나로 흡수된다. listMustNotVisited를 신규 추가 — '꼭 갈래인데 아직 안 간'
부스, 회고의 두 번째 되묻기 묶음(§7-2)이 쓴다."
```

---

### Task 4: API 라우트 — 노트 쓰기 + 되묻기 목록

**Files:**
- Modify: `src/app/api/me/notes/[boothId]/route.ts`
- Delete: `src/app/api/me/notes/[boothId]/retro/route.ts`
- Modify: `src/app/api/me/notes/pending-retro/route.ts`
- Create: `src/app/api/me/notes/must-not-visited/route.ts`

**Interfaces:**
- Consumes: `boothNoteInputSchema`(Task 1), `repo.upsertNote`/`listPendingRetro`/`listMustNotVisited`(Task 3), `recordSignal`(Task 5에서 손보지만 시그니처는 그대로 `RecordSignalInput`)
- Produces: `PUT /api/me/notes/[boothId]` — body `{interest?, verdict?, memo?, photos?}` → `{ note, taste }`. `GET /api/me/notes/must-not-visited?exhibitionSlug=&limit=` → `{ pending: {boothId,boothName}[] }`.

- [ ] **Step 1: `[boothId]/route.ts` 재작성**

전체 파일을 다음으로 교체:

```ts
import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { recordSignal, classifyForUser } from "@/lib/memory/service";
import { boothNoteInputSchema } from "@/lib/schemas";
import type { JudgedClass } from "@/lib/memory/taste";
import type { SignalKind } from "@/lib/types";

type Ctx = { params: Promise<{ boothId: string }> };

/** interest 값 → 신호 종류. */
const SIGNAL_BY_INTEREST: Record<string, SignalKind> = {
  must: "reaction_must",
  curious: "reaction_curious",
  pass: "reaction_pass",
};
/** verdict 값 → 신호 종류. */
const SIGNAL_BY_VERDICT: Record<string, SignalKind> = {
  good: "verdict_good",
  ok: "verdict_ok",
  bad: "verdict_bad",
};

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { boothId } = await params;
  const parsed = await parseBody(req, boothNoteInputSchema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const existing = (await repo.listNotes(user.id)).find(
    (n) => n.boothId === boothId,
  );

  // 이 쓰기가 interest·verdict 중 무엇을 실제로 바꾸는지 각각 확인한다 — 메모만
  // 고치는 쓰기(둘 다 undefined로 옴)에서 이미 확정된 판정을 조용히 재계산하면
  // 안 된다(기존 statusChanged 가드와 같은 원칙, 이제 두 필드 각각에 적용).
  const interestChanged =
    parsed.data.interest !== undefined &&
    (existing?.interest ?? null) !== (parsed.data.interest ?? null);
  const verdictChanged =
    parsed.data.verdict !== undefined &&
    (existing?.verdict ?? null) !== (parsed.data.verdict ?? null);

  // 판정 등급은 나중에 바뀐 필드가 최종이다 — verdict가 둘 다 바뀐 요청에서 나중
  // 판정으로 남는다(같은 요청이면 verdict 우선, judgment-vocabulary §6).
  let judgedClass: JudgedClass | null | undefined;
  const booth = interestChanged || verdictChanged ? await repo.getBooth(boothId) : null;
  if (verdictChanged) {
    judgedClass = parsed.data.verdict
      ? booth
        ? await classifyForUser(booth, user.id)
        : null
      : null; // verdict 해제 → 판정도 지운다
  } else if (interestChanged) {
    judgedClass = parsed.data.interest
      ? booth
        ? await classifyForUser(booth, user.id)
        : null
      : null;
  } // else: 둘 다 불변(메모/사진만 편집) → undefined, 기존 판정을 안 건드린다.

  const note = await repo.upsertNote(user.id, boothId, parsed.data, judgedClass);

  // L4 메모리: 상태 변경이 곧 신호다. 이 경로가 유일한 신호 적재 지점.
  if (interestChanged && parsed.data.interest) {
    await recordSignal(user.id, {
      kind: SIGNAL_BY_INTEREST[parsed.data.interest],
      boothId,
    });
  }
  if (verdictChanged && parsed.data.verdict) {
    await recordSignal(user.id, {
      kind: SIGNAL_BY_VERDICT[parsed.data.verdict],
      boothId,
    });
  }

  const taste = booth
    ? await repo.getTasteAccuracy(user.id, booth.exhibitionId)
    : note
      ? await (async () => {
          const b = await repo.getBooth(boothId);
          return b
            ? repo.getTasteAccuracy(user.id, b.exhibitionId)
            : { judgedCount: 0, pct: null };
        })()
      : { judgedCount: 0, pct: null };

  return ok({ note, taste });
}
```

`taste` 계산부가 다소 방어적인 이유: 기존 코드는 `status` 변경이 있을 때만 `booth`를 조회했는데, 이제 interest·verdict 둘 다 바뀌지 않은 순수 메모 편집 요청에서도 taste를 반환해야 한다(기존 동작 유지). `booth`가 위에서 이미 조회됐으면 재사용하고, 아니면 다시 조회한다. **더 간단한 대안**: 항상 `const booth = await repo.getBooth(boothId);`를 함수 맨 위에서 한 번만 부르고 아래에서 재사용해도 된다 — 구현 시 어느 쪽이든 방문 조회가 최대 1번만 일어나게만 하면 된다. 구현자 판단으로 정리해도 좋다(테스트만 통과하면 됨).

- [ ] **Step 2: `retro/route.ts` 삭제**

```bash
rm src/app/api/me/notes/[boothId]/retro/route.ts
```

- [ ] **Step 3: `pending-retro/route.ts`는 변경 없음(주석만 갱신)**

Repo 메서드 시그니처는 Task 3에서 이미 안쪽 의미(visitedAt+verdict 없음)로 바뀌었고, 이 라우트는 그대로 `repo.listPendingRetro(...)`를 부르므로 코드 변경은 필요 없다. 주석 한 줄만 갱신 — 기존:

```ts
// 관람 마치기에서 쓴다 — '가봄'인데 아직 "여기 어땠어?"에 답 안 한 부스를 몇 개만
// 묶어 한 번에 되묻는다(부스가 많은 전시에서 하나씩 되묻는 건 현실적이지 않다).
```

새로:

```ts
// 관람 마치기에서 쓴다 — 다녀왔는데(visitedAt) 아직 판정(verdict)이 없는 부스를
// 몇 개만 묶어 한 번에 되묻는다(부스가 많은 전시에서 하나씩 되묻는 건 비현실적이다).
```

- [ ] **Step 4: `must-not-visited/route.ts` 신규**

`src/app/api/me/notes/pending-retro/route.ts`와 완전히 같은 구조로, `repo.listMustNotVisited`를 부르는 것만 다르다:

```ts
import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";

const querySchema = z.object({
  exhibitionSlug: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(10).default(5),
});

// 관람 마치기 두 번째 되묻기 묶음 — '꼭 갈래'로 찍어뒀는데 아직 안 간(visitedAt
// 없는) 부스에 "여기 가봤어?"로 단정 없이 묻는다(judgment-vocabulary §7-2).
// 무반응은 "못 갔다"로 기록하지 않는다 — 채점에서 빠질 뿐이다.
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

  const pending = await repo.listMustNotVisited(
    user.id,
    detail.exhibition.id,
    parsed.data.limit,
  );
  return ok({ pending });
}
```

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "app/api/me/notes"
npx eslint "src/app/api/me/notes/[boothId]/route.ts" src/app/api/me/notes/pending-retro/route.ts "src/app/api/me/notes/must-not-visited/route.ts"
git add "src/app/api/me/notes/[boothId]/route.ts" "src/app/api/me/notes/must-not-visited/route.ts" src/app/api/me/notes/pending-retro/route.ts
git rm "src/app/api/me/notes/[boothId]/retro/route.ts"
git commit -m "feat(api): 노트 PUT을 interest/verdict 직교 쓰기로 + 되묻기 두 묶음

PUT /api/me/notes/[boothId]가 interest·verdict를 각각 독립적으로 감지해
바뀐 필드만큼만 신호를 적재하고 판정을 얼린다. retro 전용 라우트는
upsertNote로 흡수돼 삭제한다.

GET .../must-not-visited를 신규 — '꼭 갈래인데 아직 안 간' 부스를 되묻는
두 번째 회고 묶음(judgment-vocabulary §7)."
```

---

### Task 5: 신호 기록 — `REFLECT_KINDS` 신호명 교체

**Files:**
- Modify: `src/lib/memory/service.ts:183-188`

**Interfaces:**
- Consumes: `SignalKind`(Task 1)
- Produces: 없음(내부 상수)

- [ ] **Step 1: `REFLECT_KINDS` 교체**

`src/lib/memory/service.ts:183-188`, 기존:

```ts
/** 회고 재료가 되는 신호 — 실제로 보거나 끌린 것만(스킵/단순클릭 제외). */
const REFLECT_KINDS: ReadonlySet<SignalKind> = new Set<SignalKind>([
  "booth_visited",
  "reaction_interested",
  "reaction_later",
  "booth_bookmarked",
]);
```

새로:

```ts
/** 회고 재료가 되는 신호 — 실제로 긍정적으로 관여한 것만(패스·부정 판정 제외,
 *  기존 원칙 유지: 스킵/단순클릭은 회고 서술에 안 남긴다). */
const REFLECT_KINDS: ReadonlySet<SignalKind> = new Set<SignalKind>([
  "reaction_must",
  "reaction_curious",
  "verdict_good",
  "verdict_ok",
  "booth_bookmarked",
]);
```

- [ ] **Step 2: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "memory/service.ts"
npx eslint src/lib/memory/service.ts
git add src/lib/memory/service.ts
git commit -m "fix(memory): REFLECT_KINDS를 새 신호명으로

reaction_visited/reaction_interested/reaction_later는 더 이상 존재하지
않는다. 회고 재료는 긍정 관여 신호(must·curious·verdict_good·verdict_ok·
bookmark)로 — 부정 판정과 패스는 기존처럼 회고 서술에서 뺀다."
```

---

### Task 6: 피드 큐레이션 — `curate.ts` 제외 조건 + 근거 링크

**Files:**
- Modify: `src/lib/feed/curate.ts:103-125`
- Test: `src/lib/feed/curate.test.ts`(신규 — 기존에 이 파일이 없으면 새로 만든다. `find src/lib/feed -name "curate.test.ts"`로 먼저 확인)

**Interfaces:**
- Consumes: `BoothNote`(Task 1), `repo.listNotes`(Task 3, 시그니처 불변)
- Produces: `curateFeed`의 동작 변경(시그니처 불변) — 제외 조건과 근거 링크 소스가 `interest`/`verdict` 기준

- [ ] **Step 1: `decided` 집합 교체**

`src/lib/feed/curate.ts:103-110`, 기존:

```ts
  // 판단이 끝난 부스는 피드에서 뺀다 — 네 반응 전부. 피드는 6칸짜리 결정 큐라
  // (rhythm.ts) 이미 정한 부스가 칸을 차지하면 새 후보가 올라올 자리가 없다.
  // 특히 '끌림'은 그 가치의 가중치를 올려서 같은 부스를 **더 위로** 끌어올렸다 —
  // 반응할수록 같은 카드가 1번 자리에 눌러앉는 구조였다. 다시 보는 곳은 지도(색)와
  // 내 메모장(네 상태 다 표시)이다. 노트는 서버에 있어 재접속해도 유지된다.
  const repo = await getRepository();
  const notes = await repo.listNotes(userId);
  const decided = new Set(notes.filter((n) => n.status).map((n) => n.boothId));
```

새로:

```ts
  // 판단이 끝난 부스는 피드에서 뺀다 — interest·verdict 둘 중 하나라도 있으면.
  // 피드는 6칸짜리 결정 큐라(rhythm.ts) 이미 정한 부스가 칸을 차지하면 새 후보가
  // 올라올 자리가 없다. 다시 보는 곳은 지도(색)와 내 메모장(네 상태 다 표시)이다.
  // 노트는 서버에 있어 재접속해도 유지된다.
  const repo = await getRepository();
  const notes = await repo.listNotes(userId);
  const decided = new Set(
    notes.filter((n) => n.interest || n.verdict).map((n) => n.boothId),
  );
```

- [ ] **Step 2: `positives`(근거 링크 소스) 교체**

`src/lib/feed/curate.ts:112-125`, 기존:

```ts
  // "왜 지금 너한테"를 가치 이름이 아니라 **내가 실제로 누른 부스**로 말하기 위한 표.
  // 최근에 긍정 반응한 부스부터 보고, 후보와 가치가 겹치는 첫 부스를 근거로 삼는다.
  // (겹치는 게 없으면 근거를 안 붙인다 — 없는 이유를 지어내지 않는다.)
  const boothById = new Map(rank.booths.map((b) => [b.id, b]));
  const positives = notes
    .filter((n) => n.status === "interested" || n.status === "visited")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((n) => ({
      booth: boothById.get(n.boothId),
      kind: n.status as "interested" | "visited",
    }))
    .filter((p): p is { booth: Booth; kind: "interested" | "visited" } =>
      Boolean(p.booth),
    );
```

새로:

```ts
  // "왜 지금 너한테"를 가치 이름이 아니라 **내가 실제로 누른 부스**로 말하기 위한 표.
  // 최근에 긍정 반응한 부스부터 보고, 후보와 가치가 겹치는 첫 부스를 근거로 삼는다.
  // (겹치는 게 없으면 근거를 안 붙인다 — 없는 이유를 지어내지 않는다.)
  //
  // verdict='bad'는 절대 긍정 근거로 안 쓴다 — 예전엔 status='visited'가 무조건
  // 긍정 취급이라, 별로였던 부스가 "너 여기 좋아했잖아"의 근거가 될 수 있었다
  // (judgment-vocabulary §1-2의 버그 수정).
  const boothById = new Map(rank.booths.map((b) => [b.id, b]));
  const positives = notes
    .filter(
      (n) => n.interest === "must" || n.interest === "curious" || n.verdict === "good",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((n) => ({
      booth: boothById.get(n.boothId),
      kind: (n.verdict === "good" ? "good" : n.interest) as "must" | "curious" | "good",
    }))
    .filter((p): p is { booth: Booth; kind: "must" | "curious" | "good" } =>
      Boolean(p.booth),
    );
```

`becauseOf`가 반환하는 `{ name, kind }`의 `kind` 타입이 바뀌므로, 이 값을 소비하는 `grounding.ts`의 `buildGrounding` 함수 시그니처도 확인해야 한다 — `grep -n "kind" src/lib/feed/grounding.ts`로 `"interested" | "visited"` 문자열 리터럴을 쓰는 부분을 찾아 `"must" | "curious" | "good"`으로 맞춘다(그 함수가 `kind`로 분기해서 다른 문구를 고르는 로직이 있으면, 문구 자체는 안 바꾸고 매핑되는 조건만 새 문자열로 교체한다: `visited`였던 조건 → `good`, `interested`였던 조건은 `must`/`curious` 둘 다에 해당하도록).

- [ ] **Step 3: 실패하는 테스트 작성**

`src/lib/feed/curate.test.ts`가 없으면 신규 생성(있으면 관련 부분만 교체). `curateFeed`는 `"server-only"`를 import하므로 Plan B의 `src/test/server-only-stub.ts` 별칭이 이미 `vitest.config.ts`에 있어 테스트에서 바로 import할 수 있다. 이 함수는 `getRepository`·`readBrain`·`rankForExhibition` 등 다수 의존성이 있어 완전한 단위 테스트보다는 **순수 로직 부분만 따로 뽑아 테스트**하는 편이 안전하다 — `decided` 계산과 `positives` 필터·근거 배제 로직을 별도 export된 순수 함수로 분리하는 것을 권장한다(아래).

`src/lib/feed/curate.ts` 상단에 두 개의 export를 추가해 로직을 분리한다(파일 나머지는 그대로, `curateFeed` 본문에서 인라인 계산하던 부분을 이 함수 호출로 바꾼다):

```ts
/** 판단이 끝난 부스(피드에서 제외할 대상) — 순수, 테스트 가능. */
export function decidedBoothIds(notes: Pick<BoothNote, "boothId" | "interest" | "verdict">[]): Set<string> {
  return new Set(notes.filter((n) => n.interest || n.verdict).map((n) => n.boothId));
}

/** 근거 링크 후보 — verdict='bad'는 절대 포함하지 않는다. 순수, 테스트 가능. */
export function positiveNotes(
  notes: Pick<BoothNote, "boothId" | "interest" | "verdict" | "updatedAt">[],
): { boothId: string; kind: "must" | "curious" | "good" }[] {
  return notes
    .filter(
      (n) => n.interest === "must" || n.interest === "curious" || n.verdict === "good",
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((n) => ({
      boothId: n.boothId,
      kind: (n.verdict === "good" ? "good" : n.interest) as "must" | "curious" | "good",
    }));
}
```

`curateFeed` 본문의 `decided`/`positives` 계산을 이 두 함수 호출로 교체(`Booth` 조회·필터링은 그대로 `curateFeed` 안에 남긴다 — 순수 함수는 `notes` 배열만 받는다).

`src/lib/feed/curate.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { decidedBoothIds, positiveNotes } from "./curate";

describe("decidedBoothIds", () => {
  it("interest·verdict 어느 쪽이든 있으면 제외 대상", () => {
    const ids = decidedBoothIds([
      { boothId: "b1", interest: "must", verdict: undefined },
      { boothId: "b2", interest: undefined, verdict: "bad" },
      { boothId: "b3", interest: undefined, verdict: undefined },
    ]);
    expect(ids.has("b1")).toBe(true);
    expect(ids.has("b2")).toBe(true);
    expect(ids.has("b3")).toBe(false);
  });
});

describe("positiveNotes — bad는 절대 근거로 안 쓴다", () => {
  it("verdict='bad'는 제외된다", () => {
    const r = positiveNotes([
      { boothId: "b1", interest: undefined, verdict: "bad", updatedAt: "2026-01-01" },
    ]);
    expect(r).toHaveLength(0);
  });

  it("verdict='good'은 kind='good'으로 포함된다", () => {
    const r = positiveNotes([
      { boothId: "b1", interest: undefined, verdict: "good", updatedAt: "2026-01-01" },
    ]);
    expect(r).toEqual([{ boothId: "b1", kind: "good" }]);
  });

  it("interest='must'|'curious'도 포함된다", () => {
    const r = positiveNotes([
      { boothId: "b1", interest: "must", verdict: undefined, updatedAt: "2026-01-01" },
      { boothId: "b2", interest: "curious", verdict: undefined, updatedAt: "2026-01-02" },
    ]);
    expect(r.map((x) => x.kind).sort()).toEqual(["curious", "must"]);
  });

  it("최신순 정렬", () => {
    const r = positiveNotes([
      { boothId: "old", interest: "must", verdict: undefined, updatedAt: "2026-01-01" },
      { boothId: "new", interest: "must", verdict: undefined, updatedAt: "2026-01-02" },
    ]);
    expect(r[0].boothId).toBe("new");
  });

  it("interest='pass'는 근거가 아니다", () => {
    const r = positiveNotes([
      { boothId: "b1", interest: "pass", verdict: undefined, updatedAt: "2026-01-01" },
    ]);
    expect(r).toHaveLength(0);
  });
});
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/feed/curate.test.ts`
Expected: PASS

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "feed/curate\|feed/grounding"
npx vitest run src/lib/feed/curate.test.ts
npx eslint src/lib/feed/curate.ts src/lib/feed/curate.test.ts src/lib/feed/grounding.ts
git add src/lib/feed/curate.ts src/lib/feed/curate.test.ts src/lib/feed/grounding.ts
git commit -m "fix(feed): verdict='bad' 부스를 근거 링크에서 배제

예전엔 status='visited'가 무조건 긍정 취급이라 별로였던 부스가 '너 여기
좋아했잖아'의 근거가 될 수 있었다. positiveNotes를 순수 함수로 분리해
그 배제 규칙을 테스트로 고정한다."
```

---

### Task 7: 클라이언트 스토어 — `stores/visit.ts` 재작성

**Files:**
- Modify: `src/lib/stores/visit.ts`(전체)

**Interfaces:**
- Consumes: `BoothNote`(Task 1), `PUT /api/me/notes/[boothId]`(Task 4)
- Produces:
  - `BoothRecord { interest?, verdict?, memo?, photos? }`(기존 `status`/`retro` 제거)
  - `useVisitStore` 액션: `setInterest(boothId, interest | null)`, `setVerdict(boothId, verdict | null)`, `setMemo`, `setPhotos`(유지), `setFromNotes`(유지), `clear`(유지). `toggleStatus`/`setStatus`/`setRetro`는 삭제.
  - `pushNote(boothId): Promise<TasteUpdate | null>`(시그니처 불변 — 서버로 현재 레코드 전체를 보낸다)
  - `pushRetro`는 **삭제**(verdict가 `pushNote`로 흡수)
  - `idsByStatus(records, field, value)` — 기존 `idsByStatus(records, status)`를 대체. 지도가 6가지 상태별 id 목록을 뽑을 때 쓴다.

- [ ] **Step 1: 전체 교체**

`src/lib/stores/visit.ts` 전체를 다음으로 교체:

```ts
"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { api } from "@/lib/api/client";
import type { BoothNote } from "@/lib/types";

/**
 * A visitor's personal record for a booth, independent of the active route.
 * interest·verdict 둘 다 서버 노트에 동기화된다 — 폰을 바꿔도 지도 색이 남는다.
 */
export type InterestValue = "must" | "curious" | "pass";
export type VerdictValue = "good" | "ok" | "bad";

export interface BoothRecord {
  interest?: InterestValue;
  verdict?: VerdictValue;
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
  /** true면 로컬에 서버로 못 올라간 반응이 있다는 뜻 — pushNote 실패(비로그인·네트워크
   *  등) 때 켜지고, 소급 반영이 전부 성공하면 꺼진다. */
  hasPendingSync: boolean;
  setPendingSync: () => void;
  clearPendingSync: () => void;
  /** interest를 토글 — 같은 값을 다시 누르면 해제. */
  setInterest: (boothId: string, interest: InterestValue | null) => void;
  /** verdict를 토글 — 같은 값을 다시 누르면 해제. */
  setVerdict: (boothId: string, verdict: VerdictValue | null) => void;
  setMemo: (boothId: string, memo: string) => void;
  setPhotos: (boothId: string, photos: string[]) => void;
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
        interest: r?.interest ?? null,
        verdict: r?.verdict ?? null,
        memo: r?.memo ?? "",
        photos: r?.photos ?? [],
      },
    );
    return res.taste;
  } catch {
    /* offline / not signed in — local cache still holds it */
    useVisitStore.getState().setPendingSync();
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
  if (
    !merged.interest &&
    !merged.verdict &&
    !merged.memo?.trim() &&
    !merged.photos?.length
  ) {
    const { [boothId]: _omit, ...rest } = records;
    return rest;
  }
  return { ...records, [boothId]: merged };
}

export const useVisitStore = create<VisitState>()(
  persist(
    (set) => ({
      records: {},
      hasPendingSync: false,
      setPendingSync: () => set({ hasPendingSync: true }),
      clearPendingSync: () => set({ hasPendingSync: false }),
      setInterest: (boothId, interest) =>
        set((s) => ({
          records: patch(s.records, boothId, {
            interest: s.records[boothId]?.interest === interest ? undefined : (interest ?? undefined),
          }),
        })),
      setVerdict: (boothId, verdict) =>
        set((s) => ({
          records: patch(s.records, boothId, {
            verdict: s.records[boothId]?.verdict === verdict ? undefined : (verdict ?? undefined),
          }),
        })),
      setMemo: (boothId, memo) =>
        set((s) => ({ records: patch(s.records, boothId, { memo }) })),
      setPhotos: (boothId, photos) =>
        set((s) => ({ records: patch(s.records, boothId, { photos }) })),
      setFromNotes: (notes) =>
        // 서버 노트를 로컬 위에 병합(교체 아님) — 로컬 전용 상태(아직 미동기 기록)를
        // 보존한다. 서버가 아는 부스는 서버 값이 위에 덮인다.
        set((s) => {
          const records: Record<string, BoothRecord> = { ...s.records };
          for (const n of notes) {
            if (n.interest || n.verdict || n.memo?.trim() || n.photos?.length)
              records[n.boothId] = {
                ...records[n.boothId],
                interest: n.interest ?? records[n.boothId]?.interest,
                verdict: n.verdict ?? records[n.boothId]?.verdict,
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

/** Selector helpers — 특정 interest/verdict 값을 가진 부스 id 목록. */
export function idsByInterest(
  records: Record<string, BoothRecord>,
  interest: InterestValue,
): string[] {
  return Object.entries(records)
    .filter(([, r]) => r.interest === interest)
    .map(([id]) => id);
}

export function idsByVerdict(
  records: Record<string, BoothRecord>,
  verdict: VerdictValue,
): string[] {
  return Object.entries(records)
    .filter(([, r]) => r.verdict === verdict)
    .map(([id]) => id);
}
```

> `setVerdict`를 해제(같은 값 다시 누름)하면 `memo`는 그대로 남는다(§8-2 되돌리기 규칙: "메모는 그대로 유지된다"). 위 구현은 `patch`가 `verdict`만 덮어써서 자연히 그 규칙을 지킨다.

- [ ] **Step 2: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "stores/visit.ts"
npx eslint src/lib/stores/visit.ts
git add src/lib/stores/visit.ts
git commit -m "feat(store): visit 스토어를 interest/verdict 직교로 재작성

BoothStatus(4값 단일 필드) → interest/verdict 두 필드. toggleStatus 하나가
하던 일을 setInterest/setVerdict 둘로 가른다 — 둘은 서로 안 지운다.
setRetro/pushRetro는 verdict 경로로 완전히 흡수돼 사라진다.

컴파일은 아직 깨져 있다 — reaction-bar.tsx 등 호출부는 다음 태스크가 고친다."
```

---

### Task 8: 공유 UI — `judgment-bar.tsx` + 지도 색 토큰

**Files:**
- Create: `src/components/booth/judgment-bar.tsx`
- Modify: `src/app/globals.css`
- Test: `src/components/booth/judgment-bar.test.tsx`

**Interfaces:**
- Consumes: `useVisitStore`(Task 7) — `setInterest`/`setVerdict`, `pushNote`
- Produces: `JudgmentBar({ boothId, boothName, categoryLabel, interestSlugs, exhibitionSlug, mode }: { mode: "interest" | "verdict" | "adaptive"; ... })` — 로미 즉답은 Task 12 완료 전까지는 기존 `buildReactionLine`을 그대로 못 쓰므로(그쪽이 아직 4키), 이 태스크에서는 **로미 발화 없이** 버튼 UI + 스토어 갱신 + `pushNote` 호출까지만 구현한다. 발화 연결은 Task 12에서 이 컴포넌트를 다시 열어 추가한다(아래 Step에 TODO 마커 없이, Task 12의 정확한 삽입 지점을 명시해둔다).

- [ ] **Step 1: globals.css 색 토큰 추가**

`src/app/globals.css`의 `:root`(라이트, 대략 `:22` 부근 `--primary` 근처)에 6개 신규 변수를 추가한다. 정확한 삽입 위치는 `--route-visited`(`:53`) 선언 바로 다음:

```css
  /* 판단 어휘 지도 색 — 전부 면(fill), 테두리·뱃지로 상태를 안 나른다.
     꼭 갈래·좋았어는 기존 브랜드 토큰(--primary·--route-visited)을 재사용한다. */
  --judge-must: var(--primary);
  --judge-curious: #8b88ee;
  --judge-good: var(--route-visited);
  --judge-ok: #7edcb4;
  --judge-bad: #d0595d;
  --judge-pass: #aab2bf;
```

다크 모드 블록(`:118` 부근, `--route-visited: #2ad48f;`(`:147`) 다음)에:

```css
  --judge-must: var(--primary);
  --judge-curious: #a5a2f0;
  --judge-good: var(--route-visited);
  --judge-ok: #5cbf95;
  --judge-bad: #e07478;
  --judge-pass: #6b7280;
```

`--color-route-visited: var(--route-visited);`(`:182` 부근) 아래에 Tailwind 유틸용 매핑을 추가:

```css
  --color-judge-must: var(--judge-must);
  --color-judge-curious: var(--judge-curious);
  --color-judge-good: var(--judge-good);
  --color-judge-ok: var(--judge-ok);
  --color-judge-bad: var(--judge-bad);
  --color-judge-pass: var(--judge-pass);
```

`--booth-skipped`/`--booth-skipped-stroke`(라이트 `:59-60`, 다크 `:150-151`)와 `src/app/admin/design-system/page.tsx:23`의 `{ name: "Booth Skipped", varName: "--booth-skipped" }` 항목은 **삭제**한다(구 '별로' 전용 토큰, Task 10에서 지도 참조가 끊기면 완전히 죽는다).

`--warning`은 **삭제하지 않는다** — `admin/design-system/page.tsx:19`에 범용 시맨틱 토큰으로 등재돼 있어 지도 밖에서도 쓰일 수 있는 일반 토큰이다. Task 10에서 지도 코드의 `--warning` 참조만 없앤다.

- [ ] **Step 2: 실패하는 테스트 작성**

`src/components/booth/judgment-bar.test.tsx`:

```tsx
import { describe, expect, it, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JudgmentBar } from "./judgment-bar";
import { useVisitStore } from "@/lib/stores/visit";

const props = {
  boothId: "b1",
  boothName: "테스트 부스",
  categoryLabel: "독립출판",
  interestSlugs: ["discovery"],
  exhibitionSlug: "sibf-2026",
};

beforeEach(() => {
  useVisitStore.setState({ records: {}, hasPendingSync: false });
});

describe("JudgmentBar mode=interest", () => {
  it("3칸을 렌더한다: 꼭 갈래·끌려·패스", () => {
    render(<JudgmentBar {...props} mode="interest" />);
    expect(screen.getByRole("button", { name: /꼭 갈래/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /끌려/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /패스/ })).toBeInTheDocument();
  });

  it("꼭 갈래를 누르면 스토어에 interest='must'가 반영된다", async () => {
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="interest" />);
    await user.click(screen.getByRole("button", { name: /꼭 갈래/ }));
    expect(useVisitStore.getState().records["b1"]?.interest).toBe("must");
  });

  it("같은 버튼을 다시 누르면 해제된다", async () => {
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="interest" />);
    const btn = screen.getByRole("button", { name: /끌려/ });
    await user.click(btn);
    await user.click(btn);
    expect(useVisitStore.getState().records["b1"]?.interest).toBeUndefined();
  });
});

describe("JudgmentBar mode=verdict", () => {
  it("3칸을 렌더한다: 좋았어·그냥그랬어·아니었어", () => {
    render(<JudgmentBar {...props} mode="verdict" />);
    expect(screen.getByRole("button", { name: /좋았어/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /그냥그랬어/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /아니었어/ })).toBeInTheDocument();
  });

  it("좋았어를 누르면 스토어에 verdict='good'이 반영된다", async () => {
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="verdict" />);
    await user.click(screen.getByRole("button", { name: /좋았어/ }));
    expect(useVisitStore.getState().records["b1"]?.verdict).toBe("good");
  });
});

describe("JudgmentBar mode=adaptive", () => {
  it("interest·verdict 둘 다 없으면 interest 3칸 + '다녀왔어' 링크", () => {
    render(<JudgmentBar {...props} mode="adaptive" />);
    expect(screen.getByRole("button", { name: /꼭 갈래/ })).toBeInTheDocument();
    expect(screen.getByText(/다녀왔어/)).toBeInTheDocument();
  });

  it("interest는 있고 verdict 없으면 verdict 3칸 + '관심 바꾸기' 링크", () => {
    useVisitStore.setState({ records: { b1: { interest: "must" } }, hasPendingSync: false });
    render(<JudgmentBar {...props} mode="adaptive" />);
    expect(screen.getByRole("button", { name: /좋았어/ })).toBeInTheDocument();
    expect(screen.getByText(/관심 바꾸기/)).toBeInTheDocument();
  });

  it("verdict가 있으면 verdict 3칸(선택 표시) + '관심 바꾸기' 링크", () => {
    useVisitStore.setState({
      records: { b1: { interest: "must", verdict: "good" } },
      hasPendingSync: false,
    });
    render(<JudgmentBar {...props} mode="adaptive" />);
    const good = screen.getByRole("button", { name: /좋았어/ });
    expect(good).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText(/관심 바꾸기/)).toBeInTheDocument();
  });

  it("'다녀왔어' 링크를 누르면 verdict 3칸으로 바뀐다", async () => {
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="adaptive" />);
    await user.click(screen.getByText(/다녀왔어/));
    expect(screen.getByRole("button", { name: /좋았어/ })).toBeInTheDocument();
  });

  it("'관심 바꾸기' 링크를 누르면 interest 3칸으로 돌아간다", async () => {
    useVisitStore.setState({ records: { b1: { interest: "must" } }, hasPendingSync: false });
    const user = userEvent.setup();
    render(<JudgmentBar {...props} mode="adaptive" />);
    await user.click(screen.getByText(/관심 바꾸기/));
    expect(screen.getByRole("button", { name: /꼭 갈래/ })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/booth/judgment-bar.test.tsx`
Expected: FAIL — `Cannot find module './judgment-bar'`

- [ ] **Step 3: 구현**

`src/components/booth/judgment-bar.tsx`:

```tsx
"use client";

import { useState } from "react";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import type { InterestValue, VerdictValue } from "@/lib/stores/visit";
import { useAuthStore, promptLoginOncePerExhibition } from "@/lib/stores/auth";
import { useT } from "@/lib/i18n/provider";

/**
 * 부스 판단 UI — 관심(피드, 관람 전)과 판정(현장, 관람 후)을 하나의 컴포넌트로
 * 통일한다. 세 모드:
 *
 * - "interest": 꼭 갈래·끌려·패스 3칸만(피드).
 * - "verdict": 좋았어·그냥그랬어·아니었어 3칸만(부스 상세 등 verdict만 다루는 자리).
 * - "adaptive": 지도·부스상세 하단 시트. interest 없으면 interest 3칸+"다녀왔어"
 *   링크, interest 있으면(verdict 없어도) verdict 3칸+"관심 바꾸기" 링크로 뜬다.
 *   verdict가 이미 있으면 그 값이 선택 표시된 verdict 3칸으로 바로 뜬다.
 *   (judgment-vocabulary §8, 2026-08-11 개정 §3-3)
 *
 * 비로그인이어도 버튼은 로컬(visitStore)에 토글된다 — 로미 즉답은 로그인했을
 * 때만(전시당 1회 로그인 안내), 서버 저장도 로그인해야 된다(pushNote가 401을
 * 조용히 삼킴). 로그인하면 소급 반영된다(auth.ts의 syncPendingReactions).
 */
export function JudgmentBar({
  boothId,
  boothName,
  categoryLabel,
  interestSlugs,
  exhibitionSlug,
  mode,
}: {
  boothId: string;
  boothName?: string;
  categoryLabel?: string;
  interestSlugs: string[];
  exhibitionSlug: string;
  mode: "interest" | "verdict" | "adaptive";
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const record = useVisitStore((s) => s.records[boothId]);
  const setInterest = useVisitStore((s) => s.setInterest);
  const setVerdict = useVisitStore((s) => s.setVerdict);

  // adaptive 전용: 링크로 임시 전환한 화면. interest/verdict 실제 값이 바뀌면
  // 이 로컬 오버라이드는 무시되고 실제 상태를 따른다(전환 즉시 반영되도록).
  const [forcedScreen, setForcedScreen] = useState<"interest" | "verdict" | null>(null);

  const screen: "interest" | "verdict" =
    mode === "interest"
      ? "interest"
      : mode === "verdict"
        ? "verdict"
        : (forcedScreen ??
          (record?.verdict || record?.interest ? "verdict" : "interest"));

  function react(kind: "interest", value: InterestValue): void;
  function react(kind: "verdict", value: VerdictValue): void;
  function react(kind: "interest" | "verdict", value: InterestValue | VerdictValue) {
    if (kind === "interest") setInterest(boothId, value as InterestValue);
    else setVerdict(boothId, value as VerdictValue);
    if (!user) promptLoginOncePerExhibition(exhibitionSlug);
    void pushNote(boothId);
  }

  const interestBtns: { key: InterestValue; label: string }[] = [
    { key: "must", label: t("judge.must") },
    { key: "curious", label: t("judge.curious") },
    { key: "pass", label: t("judge.pass") },
  ];
  const verdictBtns: { key: VerdictValue; label: string }[] = [
    { key: "good", label: t("judge.good") },
    { key: "ok", label: t("judge.ok") },
    { key: "bad", label: t("judge.bad") },
  ];

  return (
    <div className="space-y-1.5">
      {mode === "adaptive" && (record?.interest || record?.verdict) && (
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {record?.interest && `${t(`judge.${record.interest}`)} · `}
            {record?.verdict ? t("judge.visited") : ""}
          </span>
          <button
            type="button"
            className="underline underline-offset-2"
            onClick={() => setForcedScreen(screen === "interest" ? "verdict" : "interest")}
          >
            {screen === "interest" ? t("judge.switchToVerdict") : t("judge.switchToInterest")}
          </button>
        </div>
      )}

      <div className="flex gap-1.5">
        {(screen === "interest" ? interestBtns : verdictBtns).map((btn) => {
          const active =
            screen === "interest"
              ? record?.interest === btn.key
              : record?.verdict === btn.key;
          return (
            <button
              key={btn.key}
              type="button"
              onClick={() =>
                screen === "interest"
                  ? react("interest", btn.key as InterestValue)
                  : react("verdict", btn.key as VerdictValue)
              }
              aria-pressed={active}
              className={
                active
                  ? "flex-1 rounded-lg border border-primary bg-accent/60 py-1.5 text-xs font-semibold text-primary"
                  : "flex-1 rounded-lg border border-border py-1.5 text-xs font-semibold text-muted-foreground"
              }
            >
              {btn.label}
            </button>
          );
        })}
      </div>

      {mode === "adaptive" && screen === "interest" && !record?.verdict && (
        <button
          type="button"
          className="w-full text-center text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setForcedScreen("verdict")}
        >
          {t("judge.visitedLink")}
        </button>
      )}
    </div>
  );
}
```

> 위 테스트가 요구하는 문구("꼭 갈래"·"끌려"·"패스"·"좋았어"·"그냥그랬어"·"아니었어"·"다녀왔어"·"관심 바꾸기")는 `t("judge.*")` i18n 키로 나온다 — Task 12에서 `dictionaries.ts`에 `judge` 네임스페이스를 추가하기 전까지는 `useT()`가 키를 못 찾아 폴백(키 그대로 출력하거나 빈 문자열)일 수 있다. **이 태스크에서 `dictionaries.ts`에 `judge` 네임스페이스를 최소한으로 먼저 추가해야 위 테스트가 통과한다** — Step 3-1로 아래 내용을 `dictionaries.ts`의 `reaction:` 블록(`:223` 부근) 바로 뒤에 추가:

```ts
  judge: {
    must: "꼭 갈래",
    curious: "끌려",
    pass: "패스",
    good: "좋았어",
    ok: "그냥그랬어",
    bad: "아니었어",
    visited: "다녀옴",
    visitedLink: "여기 다녀왔어 →",
    switchToVerdict: "다녀왔어 →",
    switchToInterest: "관심 바꾸기 →",
  },
```

영어 사전(`:721` 부근 `reaction: {...}` 뒤)에도 대응 블록:

```ts
  judge: {
    must: "Must-see",
    curious: "Interested",
    pass: "Pass",
    good: "Loved it",
    ok: "It was okay",
    bad: "Not for me",
    visited: "Visited",
    visitedLink: "I went here →",
    switchToVerdict: "I went here →",
    switchToInterest: "Change interest →",
  },
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/booth/judgment-bar.test.tsx`
Expected: PASS

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "judgment-bar\|globals.css\|dictionaries.ts"
npx vitest run src/components/booth/judgment-bar.test.tsx
npx eslint src/components/booth/judgment-bar.tsx src/components/booth/judgment-bar.test.tsx src/lib/i18n/dictionaries.ts
git add src/components/booth/judgment-bar.tsx src/components/booth/judgment-bar.test.tsx src/app/globals.css src/lib/i18n/dictionaries.ts src/app/admin/design-system/page.tsx
git commit -m "feat(booth): JudgmentBar 공유 컴포넌트 — interest/verdict/adaptive 3모드

피드·지도·부스상세가 각자 다른 반응 UI(4칸/2칸)를 쓰던 걸 하나로 통일한다.
adaptive 모드가 관심 여부로 자동 분기한다 — 다녀왔는지는 시스템이 알 수
없지만 관심을 눌렀는지는 확실히 아는 값이라 그걸로 분기한다.

지도 6색 토큰(--judge-*)을 추가하고 구 '별로' 전용 토큰(--booth-skipped)은
제거한다. --warning은 범용 시맨틱 토큰이라 유지(지도 참조만 다음 태스크에서
없앤다).

로미 즉답은 아직 연결 안 됨 — reaction-line.ts가 6키로 확장되는 다음
태스크에서 이 컴포넌트에 다시 연결한다."
```

---

### Task 9: 피드 배선 — `reaction-bar.tsx` 삭제, `interest-feed.tsx`가 `JudgmentBar` 사용

**Files:**
- Delete: `src/components/feed/reaction-bar.tsx`
- Modify: `src/components/feed/interest-feed.tsx:1-56`(import·visible 필터), `:~260`(반응 블록)
- Modify: `src/components/companion/visited-retro-prompt.tsx`(reaction.interested/skip 아이콘 버튼은 그대로 유지 가능 — Task 13에서 다룬다. 이 태스크에서는 안 건드림)

**Interfaces:**
- Consumes: `JudgmentBar`(Task 8)
- Produces: 없음(화면 배선)

- [ ] **Step 1: `reaction-bar.tsx` 삭제**

```bash
rm src/components/feed/reaction-bar.tsx
```

- [ ] **Step 2: `interest-feed.tsx` import·필터 교체**

`src/components/feed/interest-feed.tsx:13`, 기존:

```ts
import { ReactionBar } from "@/components/feed/reaction-bar";
```

새로:

```ts
import { JudgmentBar } from "@/components/booth/judgment-bar";
```

`:52-56` 부근, 기존:

```ts
  const visible = hydrated
    ? items.filter(({ booth }) => !records[booth.id]?.status)
    : items;
```

새로:

```ts
  const visible = hydrated
    ? items.filter(
        ({ booth }) => !records[booth.id]?.interest && !records[booth.id]?.verdict,
      )
    : items;
```

- [ ] **Step 3: 반응 블록 교체**

`interest-feed.tsx`의 "4) 반응" 블록(`<ReactionBar ... />`를 감싼 곳), 기존:

```tsx
              {/* 4) 반응 */}
              <div className="border-t border-border/60 px-4 py-2.5">
                <ReactionBar
                  boothId={booth.id}
                  boothName={booth.name}
                  interestSlugs={boothValueSlugs(booth)}
                  categoryLabel={categoryById[booth.categoryId]?.name}
                  exhibitionSlug={slug}
                />
              </div>
```

새로:

```tsx
              {/* 4) 반응 — 피드는 관람 전이니 정도(interest)만 묻는다. */}
              <div className="border-t border-border/60 px-4 py-2.5">
                <JudgmentBar
                  mode="interest"
                  boothId={booth.id}
                  boothName={booth.name}
                  interestSlugs={boothValueSlugs(booth)}
                  categoryLabel={categoryById[booth.categoryId]?.name}
                  exhibitionSlug={slug}
                />
              </div>
```

- [ ] **Step 4: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "feed/interest-feed\|feed/reaction-bar"
npx vitest run
npx eslint src/components/feed/interest-feed.tsx
git add -A src/components/feed
git commit -m "feat(feed): ReactionBar를 JudgmentBar(mode=interest)로 교체

피드는 관람 전이라 정도(꼭 갈래·끌려·패스)만 묻는다. 4칸짜리 반응 UI가
공유 컴포넌트로 통일되는 첫 화면."
```

---

### Task 10: 지도 배선 — 색 로직 + 하단 시트(adaptive) + 되묻기 인라인 삭제

**Files:**
- Modify: `src/components/map/exhibition-map.tsx:86-89, 140-143, 299-302, 1205-1246`
- Modify: `src/components/map/map-view.tsx`(props 전달부, 범례, 하단 시트)
- Delete: `src/components/map/visited-retro-inline.tsx`

**Interfaces:**
- Consumes: `JudgmentBar`(Task 8), `idsByInterest`/`idsByVerdict`(Task 7)
- Produces: `ExhibitionMap`의 4개 배열 props(`visitedIds`/`skippedIds`/`laterIds`/`interestedIds`) → 6개로 교체(`mustIds`/`curiousIds`/`passIds`/`goodIds`/`okIds`/`badIds`)

- [ ] **Step 1: `exhibition-map.tsx` props 시그니처 교체**

`:86-89`, 기존:

```ts
  visitedIds?: string[];
  skippedIds?: string[];
  laterIds?: string[];
  interestedIds?: string[];
```

새로:

```ts
  mustIds?: string[];
  curiousIds?: string[];
  passIds?: string[];
  goodIds?: string[];
  okIds?: string[];
  badIds?: string[];
```

`:140-143`(디폴트값), 기존:

```ts
  visitedIds = [],
  skippedIds = [],
  laterIds = [],
  interestedIds = [],
```

새로:

```ts
  mustIds = [],
  curiousIds = [],
  passIds = [],
  goodIds = [],
  okIds = [],
  badIds = [],
```

`:299-302`(Set 생성), 기존:

```ts
  const visitedSet = new Set(visitedIds);
  const skippedSet = new Set(skippedIds);
  const laterSet = new Set(laterIds);
  const interestedSet = new Set(interestedIds);
```

새로:

```ts
  const mustSet = new Set(mustIds);
  const curiousSet = new Set(curiousIds);
  const passSet = new Set(passIds);
  const goodSet = new Set(goodIds);
  const okSet = new Set(okIds);
  const badSet = new Set(badIds);
```

- [ ] **Step 2: 색 결정 로직 교체**

`:1205-1246`, 기존:

```ts
            const isVisited = visitedSet.has(b.id);
            const isInterested = !isVisited && interestedSet.has(b.id);
            const isLater = !isVisited && !isInterested && laterSet.has(b.id);
            const isSkipped =
              !isVisited && !isInterested && !isLater && skippedSet.has(b.id);
            const g = geomOf(b);
            return (
              <g
                key={b.id}
                transform={`translate(${g.x} ${g.y})`}
                className="cursor-pointer"
                role="button"
                aria-label={`${b.name}${b.code ? ` (${b.code})` : ""}`}
              >
                {(() => {
                  const color = cat?.color ?? "var(--primary)";
                  const zone = g.color ?? `${color}26`;
                  // Map uses STATE colors only — 끌림(초록)/가봄(대표색)/나중에(노랑)/별로(흐림).
                  // 끌림=우리 대표 상태색 초록, 가봄=대표색(primary). Category hue는 칩/상세에만.
                  const fill = isInterested
                    ? "var(--route-visited)"
                    : isVisited
                      ? "var(--primary)"
                      : isLater
                        ? "var(--warning)"
                        : isSkipped
                          ? "var(--booth-skipped)"
                          : zone;
                  // primary(남보라)·초록은 어두워 흰 글씨, 노랑(나중에)은 밝아 어두운 글씨.
                  const darkText =
                    isVisited || isInterested || fill === "#3a3d44";
                  const stroke = isSel
                    ? "var(--primary)"
                    : isInterested
                      ? "var(--route-visited)"
                      : isLater
                        ? "var(--warning)"
                        : isSkipped
                          ? "var(--booth-skipped-stroke)"
                          : g.color && g.color !== "#d8dade"
                            ? g.color
                            : "var(--border)";
```

새로:

```ts
            // verdict가 있으면 interest는 안 본다 — 결과가 예측을 덮는다
            // (judgment-vocabulary §4-2: 색 = verdict ?? interest ?? 존 색).
            const isGood = goodSet.has(b.id);
            const isOk = !isGood && okSet.has(b.id);
            const isBad = !isGood && !isOk && badSet.has(b.id);
            const hasVerdict = isGood || isOk || isBad;
            const isMust = !hasVerdict && mustSet.has(b.id);
            const isCurious = !hasVerdict && !isMust && curiousSet.has(b.id);
            const isPass = !hasVerdict && !isMust && !isCurious && passSet.has(b.id);
            const g = geomOf(b);
            return (
              <g
                key={b.id}
                transform={`translate(${g.x} ${g.y})`}
                className="cursor-pointer"
                role="button"
                aria-label={`${b.name}${b.code ? ` (${b.code})` : ""}`}
              >
                {(() => {
                  const color = cat?.color ?? "var(--primary)";
                  const zone = g.color ?? `${color}26`;
                  // Map uses STATE colors only — 전부 면(fill), 테두리·뱃지로 상태를
                  // 나르지 않는다. Category hue는 칩·상세에만.
                  const fill = isGood
                    ? "var(--judge-good)"
                    : isOk
                      ? "var(--judge-ok)"
                      : isBad
                        ? "var(--judge-bad)"
                        : isMust
                          ? "var(--judge-must)"
                          : isCurious
                            ? "var(--judge-curious)"
                            : isPass
                              ? "var(--judge-pass)"
                              : zone;
                  // 진한 색(꼭 갈래·좋았어·아니었어)은 어두워 흰 글씨, 옅은 색은
                  // 어두운 글씨 — 6색 전부 면이라 색마다 대비를 직접 확인해야 한다.
                  const darkText = isGood || isMust || isBad || fill === "#3a3d44";
                  const stroke = isSel
                    ? "var(--primary)"
                    : isGood
                      ? "var(--judge-good)"
                      : isOk
                        ? "var(--judge-ok)"
                        : isBad
                          ? "var(--judge-bad)"
                          : isMust
                            ? "var(--judge-must)"
                            : isCurious
                              ? "var(--judge-curious)"
                              : isPass
                                ? "var(--judge-pass)"
                                : g.color && g.color !== "#d8dade"
                                  ? g.color
                                  : "var(--border)";
```

같은 함수 안에 `isInterested`를 참조하는 다른 곳이 더 있는지 확인한다(`grep -n "isInterested\|isVisited\|isLater\|isSkipped" src/components/map/exhibition-map.tsx`) — 원래 소스의 `:1337` 부근 `{isInterested && !isSel && (`도 찾아 `isMust`(또는 문맥에 맞는 새 변수)로 교체한다. 그 블록이 정확히 무엇을 렌더하는지 파일을 열어 확인 후, 같은 조건 의미(해당 상태일 때만 보이는 장식)를 유지하도록 변수명만 바꾼다.

- [ ] **Step 3: `map-view.tsx` — id 계산 + props 전달 + 범례 + 하단 시트**

`:17`, 기존:

```ts
import { useVisitStore, idsByStatus, pushNote } from "@/lib/stores/visit";
```

새로:

```ts
import { useVisitStore, idsByInterest, idsByVerdict, pushNote } from "@/lib/stores/visit";
```

`:27-28`, 기존:

```ts
import { ReactionBar } from "@/components/feed/reaction-bar";
import { VisitedRetroInline } from "@/components/map/visited-retro-inline";
```

새로:

```ts
import { JudgmentBar } from "@/components/booth/judgment-bar";
```

`:84-90`, 기존:

```ts
  const visitedIds = useMemo(() => idsByStatus(records, "visited"), [records]);
  const skippedIds = useMemo(() => idsByStatus(records, "skipped"), [records]);
  const laterIds = useMemo(() => idsByStatus(records, "later"), [records]);
  const interestedIds = useMemo(
    () => idsByStatus(records, "interested"),
    [records],
  );
```

새로:

```ts
  const mustIds = useMemo(() => idsByInterest(records, "must"), [records]);
  const curiousIds = useMemo(() => idsByInterest(records, "curious"), [records]);
  const passIds = useMemo(() => idsByInterest(records, "pass"), [records]);
  const goodIds = useMemo(() => idsByVerdict(records, "good"), [records]);
  const okIds = useMemo(() => idsByVerdict(records, "ok"), [records]);
  const badIds = useMemo(() => idsByVerdict(records, "bad"), [records]);
```

`<ExhibitionMap ... />` 호출부(`:165-168`), 기존:

```tsx
        visitedIds={visitedIds}
        skippedIds={skippedIds}
        laterIds={laterIds}
        interestedIds={interestedIds}
```

새로:

```tsx
        mustIds={mustIds}
        curiousIds={curiousIds}
        passIds={passIds}
        goodIds={goodIds}
        okIds={okIds}
        badIds={badIds}
```

범례 블록(`:217-258`)을 6색에 맞게 재작성 — 기존 5줄(끌림·가봄·나중에·별로·선택)을 다음으로 교체:

```tsx
      {!heatOn && (
        <div className="pointer-events-none absolute left-3 top-16 z-20 flex flex-col gap-1 rounded-xl border border-border bg-card/90 px-2.5 py-2 text-[11px] font-semibold shadow-[var(--shadow-card)] backdrop-blur">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: "var(--judge-must)" }} />
            {t("map.legendMust")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: "var(--judge-curious)" }} />
            {t("map.legendCurious")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: "var(--judge-good)" }} />
            {t("map.legendGood")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: "var(--judge-bad)" }} />
            {t("map.legendBad")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px]" style={{ backgroundColor: "var(--judge-pass)" }} />
            {t("map.legendPass")}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] border-2" style={{ borderColor: "var(--primary)" }} />
            {t("map.legendSelected")}
          </span>
        </div>
      )}
```

> 범례는 6칸 전부가 아니라 5줄(그냥그랬어는 뺐다)로 압축했다 — 상시 노출 UI라 너무 길면 지도를 가린다. "그냥그랬어"는 색으로 지도에서 보이되 범례 텍스트는 생략(연초록이 "좋았어"의 연한 버전이라는 게 직관적으로 읽힌다). 구현자가 6줄 전부 넣는 쪽을 선호하면 그래도 무방하다 — 어느 쪽이든 `map.legend{Must,Curious,Good,Ok,Bad,Pass,Selected}` i18n 키를 Task 12에서 추가한다(이 태스크에서는 `map.legendMust` 등 아직 없는 키를 써도 되고, `dictionaries.ts`에 임시로 최소 채워 넣어도 된다 — 아래 참고).

이 태스크에서 `dictionaries.ts`의 `map.legendInterested/-Visited/-Later/-Skipped`(`:267-271`, `:761-765`)를 다음으로 교체한다(Task 12가 나머지 `judge.*`/`reaction.*` 큰 개편을 하지만, 지도 범례 키는 지도 파일과 함께 이 태스크에서 정리하는 게 자연스럽다):

```ts
    legendMust: "꼭 갈래",
    legendCurious: "끌려",
    legendGood: "좋았어",
    legendBad: "아니었어",
    legendPass: "패스",
    legendSelected: "선택",
```

영어도 대응:

```ts
    legendMust: "Must-see",
    legendCurious: "Interested",
    legendGood: "Loved it",
    legendBad: "Not for me",
    legendPass: "Pass",
    legendSelected: "Selected",
```

하단 시트의 반응 블록(`:324-335`), 기존:

```tsx
            {/* 저장 대신 반응 — 끌림/나중에/별로/이미봄 → 신호로 브레인에 반영. */}
            <div className="mt-2.5 border-t border-border pt-2.5">
              <ReactionBar
                boothId={selected.id}
                boothName={selected.name}
                interestSlugs={boothValueSlugs(selected)}
                categoryLabel={selectedCat?.name}
                exhibitionSlug={detail.exhibition.slug}
              />
            </div>

            <VisitedRetroInline boothId={selected.id} />
```

새로:

```tsx
            {/* 판단 — 관심 여부로 자동 분기(adaptive). 다녀왔는지는 시스템이 몰라도
                관심을 눌렀는지는 확실히 아는 값이라 그걸로 관심/판정을 가른다. */}
            <div className="mt-2.5 border-t border-border pt-2.5">
              <JudgmentBar
                mode="adaptive"
                boothId={selected.id}
                boothName={selected.name}
                interestSlugs={boothValueSlugs(selected)}
                categoryLabel={selectedCat?.name}
                exhibitionSlug={detail.exhibition.slug}
              />
            </div>
```

- [ ] **Step 4: `visited-retro-inline.tsx` 삭제**

```bash
rm src/components/map/visited-retro-inline.tsx
```

- [ ] **Step 5: 검증**

```bash
npx tsc --noEmit 2>&1 | grep "exhibition-map\|map-view\|visited-retro-inline"
```

Expected: 이 세 파일 관련 에러 0. `grep -rn "isInterested\|isVisited\b\|isLater\b\|isSkipped\b" src/components/map/exhibition-map.tsx`로 놓친 참조가 없는지 직접 확인한다.

```bash
npx vitest run
npx eslint src/components/map/exhibition-map.tsx src/components/map/map-view.tsx src/lib/i18n/dictionaries.ts
```

- [ ] **Step 6: 커밋**

```bash
git add src/components/map/exhibition-map.tsx src/components/map/map-view.tsx src/lib/i18n/dictionaries.ts
git rm src/components/map/visited-retro-inline.tsx
git commit -m "feat(map): 지도 6색 + 하단 시트를 JudgmentBar(adaptive)로

색 규칙을 verdict ?? interest ?? 존색으로 바꾼다 — 결과가 예측을 덮는다.
4색(끌림·가봄·나중에·별로) → 6색(꼭 갈래·끌려·좋았어·그냥그랬어·아니었어·
패스), 전부 면(fill). VisitedRetroInline('여기 어땠어?')은 adaptive 모드가
흡수해 삭제한다."
```

---

### Task 11: 부스 상세 배선 — `booth-personal-panel.tsx`

**Files:**
- Modify: `src/components/booth/booth-personal-panel.tsx`

**Interfaces:**
- Consumes: `JudgmentBar`(Task 8)
- Produces: 없음(화면 배선)

- [ ] **Step 1: 전체 교체**

기존 2칸(`방문함`/`관심`, `toggleStatus`)을 `JudgmentBar mode="adaptive"`로 바꾼다. 이 컴포넌트는 `interestSlugs`·`categoryLabel`·`exhibitionSlug`를 지금 안 받고 있으니, 호출부(`grep -rn "BoothPersonalPanel" src/`)를 먼저 찾아 이 props를 넘기도록 같이 고친다. 전체 파일:

```tsx
"use client";

import { useState } from "react";
import { NotebookPen } from "lucide-react";
import { toast } from "sonner";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { useAuthStore } from "@/lib/stores/auth";
import { Textarea } from "@/components/ui/textarea";
import { NotePhotos } from "@/components/booth/note-photos";
import { JudgmentBar } from "@/components/booth/judgment-bar";
import { useT } from "@/lib/i18n/provider";
import { boothValueSlugs } from "@/lib/values";
import type { Booth, Category } from "@/lib/types";

/**
 * Per-visitor controls for a booth: 판단(JudgmentBar, adaptive) + 메모 + 사진.
 * 지도 하단 시트와 같은 규칙을 쓴다 — 지도·상세가 어긋나면 사용자가 두 개의
 * 다른 앱으로 느낀다(judgment-vocabulary §3-4).
 */
export function BoothPersonalPanel({
  booth,
  category,
  exhibitionSlug,
}: {
  booth: Booth;
  category?: Category;
  exhibitionSlug: string;
}) {
  const t = useT();
  const user = useAuthStore((s) => s.user);
  const ready = useAuthStore((s) => s.ready);
  const openLogin = useAuthStore((s) => s.openLogin);

  const record = useVisitStore((s) => s.records[booth.id]);
  const setMemo = useVisitStore((s) => s.setMemo);

  const [memo, setLocalMemo] = useState("");
  const [hydrated, setHydrated] = useState(false);

  const [syncKey, setSyncKey] = useState<string | null>(null);
  const curKey = `${booth.id}:${user ? "in" : "out"}`;
  if (syncKey !== curKey) {
    setSyncKey(curKey);
    setLocalMemo(useVisitStore.getState().records[booth.id]?.memo ?? "");
    setHydrated(true);
  }

  function onMemoBlur() {
    const prev = useVisitStore.getState().records[booth.id]?.memo ?? "";
    if (memo.trim() === prev.trim()) return;
    setMemo(booth.id, memo);
    void pushNote(booth.id);
    toast.success(memo.trim() ? t("map.memoSaved") : t("map.memoCleared"));
  }

  return (
    <section className="space-y-2.5">
      <h2 className="text-base font-bold">{t("booth.recordHeading")}</h2>

      <JudgmentBar
        mode="adaptive"
        boothId={booth.id}
        boothName={booth.name}
        interestSlugs={boothValueSlugs(booth)}
        categoryLabel={category?.name}
        exhibitionSlug={exhibitionSlug}
      />

      <div className="relative">
        <NotebookPen className="pointer-events-none absolute left-3 top-3 size-4 text-muted-foreground" />
        <Textarea
          value={memo}
          disabled={!hydrated}
          onChange={(e) => setLocalMemo(e.target.value)}
          onBlur={onMemoBlur}
          placeholder={t("notes.memoPlaceholder")}
          rows={2}
          maxLength={300}
          className="resize-none pl-9"
          aria-label={t("notes.memoAria")}
        />
      </div>

      <NotePhotos boothId={booth.id} />

      {ready && !user && (
        <p className="text-xs text-muted-foreground">
          이 기기에 저장돼.{" "}
          <button
            type="button"
            onClick={openLogin}
            className="font-semibold text-primary underline-offset-2 hover:underline"
          >
            로그인
          </button>
          하면 다른 기기와 동기화돼.
        </p>
      )}
    </section>
  );
}
```

> `record` 변수는 이제 이 컴포넌트 안에서 직접 안 쓰인다(`JudgmentBar`가 스스로 스토어를 읽는다) — 남겨두면 미사용 변수 eslint 에러가 나므로 **선언을 지운다**(위 코드에는 이미 빠져 있다).

- [ ] **Step 2: 호출부 props 갱신**

```bash
grep -rn "<BoothPersonalPanel" src/
```

찾은 각 호출부에서 기존에 `boothId={...}` 하나만 넘기던 것을 `booth={...}` (Booth 전체 객체) + `category={...}` + `exhibitionSlug={...}`로 바꾼다. 호출부가 이미 `booth`/`category`/`exhibitionSlug`를 갖고 있는 부모 컴포넌트인지(대개 부스 상세 페이지) 확인 후 그대로 전달한다.

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "booth-personal-panel"
npx vitest run
npx eslint src/components/booth/booth-personal-panel.tsx
git add -A src/components/booth
git commit -m "feat(booth): BoothPersonalPanel을 JudgmentBar(adaptive)로

방문함/관심 2칸이 지도·피드와 다른 어휘를 쓰고 있었다. 지도와 같은
adaptive 규칙으로 통일 — 두 화면이 어긋나면 사용자가 다른 앱으로 느낀다."
```

---

### Task 12: 로미 발화 — `reaction-line.ts` 6종 확장

**Files:**
- Modify: `src/lib/companion/reaction-line.ts`(전체)
- Modify: `src/lib/i18n/dictionaries.ts`(`companion.react*` 블록 교체)
- Modify: `src/components/booth/judgment-bar.tsx`(로미 즉답 연결)
- Test: `src/lib/companion/reaction-line.test.ts`(신규 — 없으면 생성, 있으면 교체)

**Interfaces:**
- Consumes: `InterestNode`(기존), `TFn`(기존)
- Produces: `buildJudgmentLine(kind, value, interestSlugs, boothName, categoryLabel, interests, t): string` — 기존 `buildReactionLine`을 대체(함수명 변경, `kind: "interest"|"verdict"`+값 두 인자로 6종을 다 처리)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/companion/reaction-line.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildJudgmentLine } from "./reaction-line";
import type { InterestNode } from "@/lib/types";
import { makeT } from "@/lib/i18n/resolve";
import { DICTS } from "@/lib/i18n/dictionaries";

const t = makeT(DICTS.ko);
const noInterests: InterestNode[] = [];
const confidentInterests: InterestNode[] = [
  {
    key: "discovery",
    label: "발견",
    confidence: 0.5,
    signals: { explicit: 0, implicit: 0, negative: 0 },
    firstSeenAt: "",
    lastSeenAt: "",
    trend: "flat",
  },
];

describe("buildJudgmentLine — interest", () => {
  it("must: 이름 있으면 이름을 부른다", () => {
    const line = buildJudgmentLine(
      "interest", "must", [], "테스트부스", undefined, noInterests, t,
    );
    expect(line).toContain("테스트부스");
  });
  it("curious: 확신 매칭이면 분야를 언급한다", () => {
    const line = buildJudgmentLine(
      "interest", "curious", ["discovery"], "테스트부스", "독립출판",
      confidentInterests, t,
    );
    expect(line).toContain("독립출판");
  });
  it("pass: 확신 매칭이어도 분야 전체 부정으로 말하지 않는다(헤지)", () => {
    const line = buildJudgmentLine(
      "interest", "pass", ["discovery"], "테스트부스", "독립출판",
      confidentInterests, t,
    );
    expect(line).not.toMatch(/전부|모두|항상/);
  });
});

describe("buildJudgmentLine — verdict", () => {
  it("good: 직전에 interest='must'였다는 걸 알면(matched=true) '맞았네' 계열", () => {
    const line = buildJudgmentLine(
      "verdict", "good", [], "테스트부스", undefined, noInterests, t,
      { matchedPriorInterest: true },
    );
    expect(typeof line).toBe("string");
    expect(line.length).toBeGreaterThan(0);
  });
  it("good: 예측 없었으면 '몰랐는데 좋았다' 계열", () => {
    const line = buildJudgmentLine(
      "verdict", "good", [], "테스트부스", undefined, noInterests, t,
      { matchedPriorInterest: false },
    );
    expect(line.length).toBeGreaterThan(0);
  });
  it("ok: 판단을 강요하지 않는다(느낌표·강한 어조 없음 — 최소한 렌더는 된다)", () => {
    const line = buildJudgmentLine("verdict", "ok", [], "테스트부스", undefined, noInterests, t);
    expect(line.length).toBeGreaterThan(0);
  });
  it("bad: 부스를 깎지 않고 예측이 빗나갔다는 쪽으로 말한다(가치 이름 미포함)", () => {
    const line = buildJudgmentLine(
      "verdict", "bad", ["discovery"], "테스트부스", "독립출판",
      confidentInterests, t,
    );
    expect(line).not.toContain("발견"); // 가치 라벨("발견")을 발화에 쓰지 않는다
  });
});

describe("이름 없을 때(Plain 판본)", () => {
  it("boothName undefined면 부스 이름 없이도 렌더된다", () => {
    const line = buildJudgmentLine("interest", "must", [], undefined, undefined, noInterests, t);
    expect(line.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/companion/reaction-line.test.ts`
Expected: FAIL — `buildJudgmentLine`이 아직 없다(`buildReactionLine`만 있음).

- [ ] **Step 3: `reaction-line.ts` 재작성**

전체 파일 교체:

```ts
// 판단 즉답 — 부스가 속한 관람 가치(interestSlugs) + 브레인 누적 확신도로 톤을 조절한다.
// 순수·LLM 없음.
//
// interest(must/curious)·verdict(good/bad)만 매칭을 탄다. curious는 판정 가중치가
// must의 절반이라(taste.ts judgmentScore) "확실히 좋아하는구나" 톤을 쓰면 신호보다
// 말이 앞선다. pass는 확신 매칭(confidence>=CONFIDENT_THRESHOLD)에서만 분야를
// 말하고, 그마저도 "안에서도 다는 아니다"로 헤지한다 — 부스 하나 뺀 걸 분야 전체
// 부정으로 말하면 과장이다.
//
// 매칭은 interestSlugs(= boothValueSlugs(booth), 가치 축 slug)로 한다 — brain.interests
// 는 거의 항상 이 축으로 쌓인다. 하지만 발화에 얹는 {theme}은 매칭된 노드의 라벨
// (가치 이름 — 발화 금지 대상)이 아니라 호출부가 넘기는 이 부스의 카테고리 이름
// (categoryLabel, 구체적 사실)이다 — 가치 이름은 발화에 절대 쓰지 않는다는 원칙을
// 매칭 축과 발화 축을 분리해서 지킨다.
//
// verdict='bad'가 가장 조심할 자리다. 부스를 깎지 않고 *내 예측이 빗나갔음*을
// 로미가 가져간다 — pass의 헤지 원칙을 그대로 잇는다.
import { CONFIDENT_THRESHOLD } from "@/lib/constants";
import type { InterestNode } from "@/lib/types";
import type { TFn } from "@/lib/i18n/resolve";

export type JudgmentKind = "interest" | "verdict";
export type JudgmentValue = "must" | "curious" | "pass" | "good" | "ok" | "bad";

const BASE_KEY: Record<JudgmentValue, string> = {
  must: "reactMust",
  curious: "reactCurious",
  pass: "reactPass",
  good: "reactGood",
  ok: "reactOk",
  bad: "reactBad",
};

export function buildJudgmentLine(
  kind: JudgmentKind,
  value: JudgmentValue,
  /** boothValueSlugs(booth) — 이 부스가 기여하는 가치 축 slug. brain.interests와
   *  같은 축이라 여기로만 매칭한다. */
  interestSlugs: string[],
  boothName: string | undefined,
  /** 발화에 얹을 구체적 분야 이름(카테고리) — 가치 이름이 아니다. 없으면(부스에
   *  카테고리가 없는 예외 상황) 매칭돼도 분야를 언급하지 않는다. */
  categoryLabel: string | undefined,
  interests: InterestNode[],
  t: TFn,
  /** verdict='good'일 때만 쓴다 — 직전에 interest가 must/curious였는지(예측이
   *  맞았는지). 호출부(judgment-bar)가 판단 직전 record에서 넘긴다. */
  opts?: { matchedPriorInterest?: boolean },
): string {
  if (value === "ok") {
    return line(BASE_KEY.ok, boothName, t);
  }

  // interests는 confidence 내림차순(distill.ts)이라 첫 매치가 곧 최고 확신 가치.
  const match = interests.find((n) => interestSlugs.includes(n.key));

  if (value === "must" || value === "curious") {
    if (!match || !categoryLabel) return line(BASE_KEY[value], boothName, t);
    const tier =
      match.confidence >= CONFIDENT_THRESHOLD
        ? `${BASE_KEY[value]}Confident`
        : `${BASE_KEY[value]}Tentative`;
    return line(tier, boothName, t, categoryLabel);
  }

  if (value === "pass") {
    if (match && match.confidence >= CONFIDENT_THRESHOLD && categoryLabel) {
      return line(`${BASE_KEY.pass}Confident`, boothName, t, categoryLabel);
    }
    return line(BASE_KEY.pass, boothName, t);
  }

  if (value === "good") {
    const key = opts?.matchedPriorInterest ? `${BASE_KEY.good}Matched` : BASE_KEY.good;
    return line(key, boothName, t);
  }

  // value === "bad" — 확신 매칭에서만, 헤지된 문장으로. 부스를 깎지 않고
  // "내 예측이 빗나갔다" 쪽으로 로미가 가져간다.
  if (match && match.confidence >= CONFIDENT_THRESHOLD && categoryLabel) {
    return line(`${BASE_KEY.bad}Confident`, boothName, t, categoryLabel);
  }
  return line(BASE_KEY.bad, boothName, t);
}

function line(
  baseKey: string,
  boothName: string | undefined,
  t: TFn,
  theme?: string,
): string {
  const key = boothName ? baseKey : `${baseKey}Plain`;
  const params: Record<string, string> = {};
  if (boothName) params.booth = boothName;
  if (theme) params.theme = theme;
  return t(`companion.${key}`, params);
}
```

> `makeT`/`DICTS`의 실제 export 이름이 위 테스트가 가정한 것과 다르면(`src/lib/i18n/resolve.ts`, `src/lib/i18n/dictionaries.ts` 확인) 테스트의 import를 실제 이름에 맞게 고친다 — 다른 테스트 파일(예: `src/lib/companion/*.test.ts` 기존 것이 있으면 그 import 패턴)을 참고.

- [ ] **Step 4: `dictionaries.ts` — `companion.react*` 블록 재작성**

`:436-454`(한국어) 기존 블록을 찾아(`grep -n "reactInterested\|reactLater\|reactSkip\|reactSeen" src/lib/i18n/dictionaries.ts`) 다음으로 교체. 각 값은 최소 3변주가 필요한데(스펙 §10), 여기서는 각 키당 **1개 문구**만 명시하고 **변주 2개씩을 구현자가 추가**하도록 지시한다 — 정확한 변주 문구는 로미 어투(`docs/decisions/2026-07-13_romi-ux-writing.md`, 반말·담백·과장 없음)를 참고해 구현자가 짓는다(이 플랜이 창작 카피 전체를 대신 쓰지 않는다). 최소 골격:

```ts
    reactMust: "'{booth}', 꼭 가야겠다. 챙겨둘게.",
    reactMustPlain: "꼭 가야겠다. 챙겨둘게.",
    reactCurious: "'{booth}', 끌리는구나. 기억해둘게.",
    reactCuriousPlain: "끌리는구나. 기억해둘게.",
    reactPass: "'{booth}', 알았어. 비슷한 건 덜 보여줄게.",
    reactPassPlain: "알았어, 이런 건 덜 보여줄게.",
    reactGood: "'{booth}' 좋았구나! 이런 결 더 찾아볼게.",
    reactGoodPlain: "좋았구나! 이런 결 더 찾아볼게.",
    reactGoodMatched: "'{booth}', 찍어둔 데가 맞았네.",
    reactGoodMatchedPlain: "찍어둔 데가 맞았네.",
    reactOk: "'{booth}', 그랬구나.",
    reactOkPlain: "그랬구나.",
    reactBad: "'{booth}', 알았어. 내가 잘못 짚었나 봐.",
    reactBadPlain: "알았어. 내가 잘못 짚었나 봐.",

    reactMustTentative: "'{booth}'도 '{theme}' 쪽이네 — 관심 있나 봐.",
    reactMustTentativePlain: "'{theme}' 쪽에 관심 있나 봐.",
    reactMustConfident: "'{booth}'도 '{theme}'구나 — 확실히 좋아하네.",
    reactMustConfidentPlain: "'{theme}' 확실히 좋아하는구나.",
    reactCuriousTentative: "'{booth}'도 '{theme}' 쪽이네.",
    reactCuriousTentativePlain: "'{theme}' 쪽인가 보네.",
    reactCuriousConfident: "'{booth}'도 '{theme}'구나.",
    reactCuriousConfidentPlain: "'{theme}' 계속 끌리네.",
    reactPassConfident: "'{booth}', 알았어. '{theme}' 안에서도 다는 아닌가 봐.",
    reactPassConfidentPlain: "'{theme}' 안에서도 다는 아닌가 봐.",
    reactBadConfident: "'{booth}', 알았어. '{theme}' 안에서도 다는 아니었나 봐.",
    reactBadConfidentPlain: "'{theme}' 안에서도 다는 아니었나 봐.",
```

기존 `reactInterested*`/`reactLater*`/`reactSkip*`/`reactSeen*` 키들은 전부 삭제한다. 영어 사전(`:928-943` 부근)도 같은 구조로 대응 영역을 교체(문구는 자연스러운 영어로 직접 작성).

`judge.*`(Task 8에서 추가한) 옆에 있어야 자연스러우니, 이 블록은 `companion:` 네임스페이스 안(기존 위치 그대로)에 둔다.

- [ ] **Step 5: `judgment-bar.tsx`에 로미 즉답 연결**

`src/components/booth/judgment-bar.tsx`의 `react` 함수(Task 8에서 만든) 안에 발화 호출을 추가한다. 기존:

```ts
  function react(kind: "interest", value: InterestValue): void;
  function react(kind: "verdict", value: VerdictValue): void;
  function react(kind: "interest" | "verdict", value: InterestValue | VerdictValue) {
    if (kind === "interest") setInterest(boothId, value as InterestValue);
    else setVerdict(boothId, value as VerdictValue);
    if (!user) promptLoginOncePerExhibition(exhibitionSlug);
    void pushNote(boothId);
  }
```

새로(발화 스토어·`buildJudgmentLine` import 추가 필요 — 파일 상단에 `import { useCompanionStore } from "@/lib/stores/companion";`, `import { buildJudgmentLine } from "@/lib/companion/reaction-line";` 추가):

```ts
  const say = useCompanionStore((s) => s.say);
  const interests = useCompanionStore((s) => s.interests);

  function react(kind: "interest", value: InterestValue): void;
  function react(kind: "verdict", value: VerdictValue): void;
  function react(kind: "interest" | "verdict", value: InterestValue | VerdictValue) {
    // good일 때 "예측이 맞았는지"는 반응 직전(스토어 갱신 전)의 interest로 판단한다.
    const matchedPriorInterest =
      kind === "verdict" && value === "good"
        ? record?.interest === "must" || record?.interest === "curious"
        : undefined;

    if (kind === "interest") setInterest(boothId, value as InterestValue);
    else setVerdict(boothId, value as VerdictValue);

    if (user) {
      say(
        buildJudgmentLine(
          kind,
          value,
          interestSlugs,
          boothName,
          categoryLabel,
          interests,
          t,
          { matchedPriorInterest },
        ),
      );
    } else {
      promptLoginOncePerExhibition(exhibitionSlug);
    }
    void pushNote(boothId);
  }
```

> `useCompanionStore`의 `say`/`interests` selector 이름이 실제와 다르면(기존 `reaction-bar.tsx`가 삭제되기 전 이 훅들을 이미 같은 이름으로 쓰고 있었으므로 — Task 9 이전 원본 `reaction-bar.tsx`를 `git show`로 확인 가능: `git show HEAD~N:src/components/feed/reaction-bar.tsx`) 정확한 이름을 그 파일 히스토리에서 확인해 맞춘다.

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run src/lib/companion/reaction-line.test.ts src/components/booth/judgment-bar.test.tsx`
Expected: PASS

- [ ] **Step 7: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "reaction-line\|judgment-bar\|dictionaries"
npx vitest run
npx eslint src/lib/companion/reaction-line.ts src/lib/companion/reaction-line.test.ts src/lib/i18n/dictionaries.ts src/components/booth/judgment-bar.tsx
git add src/lib/companion/reaction-line.ts src/lib/companion/reaction-line.test.ts src/lib/i18n/dictionaries.ts src/components/booth/judgment-bar.tsx
git commit -m "feat(companion): 로미 발화 6종으로 확장 — buildJudgmentLine

reactInterested/Later/Skip/Seen(4종) → reactMust/Curious/Pass/Good/Ok/Bad
(6종). verdict='bad'가 가장 조심할 자리다 — 부스를 깎지 않고 '내 예측이
빗나갔다' 쪽으로 로미가 가져간다. good은 직전 interest가 must/curious였는지로
'찍어둔 데가 맞았네' 톤을 가른다.

가치 이름은 여전히 발화에 안 쓴다(theme=categoryLabel만)."
```

---

### Task 13: 회고 되묻기 — 두 묶음 UI

**Files:**
- Modify: `src/components/companion/visited-retro-prompt.tsx`(전체)
- Modify: 이 컴포넌트를 렌더하는 부모(관람 마치기 플로우) — `grep -rn "VisitedRetroPrompt" src/`로 찾아 두 번째 API 호출을 추가로 배선

**Interfaces:**
- Consumes: `GET /api/me/notes/pending-retro`(기존), `GET /api/me/notes/must-not-visited`(Task 4), `useVisitStore.setVerdict`(Task 7)
- Produces: 없음(화면)

- [ ] **Step 1: `visited-retro-prompt.tsx` 재작성**

verdict 3종(`good`/`ok`/`bad`) 중 배터리·손 안 바쁜 회고 화면이므로 3버튼 다 노출하고, **두 번째 묶음**(꼭 갈래인데 안 간 부스 — "여기 가봤어?")을 같이 처리한다. 전체 교체:

```tsx
"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api/client";
import { useVisitStore, pushNote } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";

interface PendingBooth {
  boothId: string;
  boothName: string;
}

/**
 * 관람 마치기 되묻기 — 두 묶음(judgment-vocabulary §7).
 *
 * 1) 다녀왔는데(visitedAt) 아직 판정(verdict) 없는 부스 → "여기 어땠어?" +
 *    좋았어/그냥그랬어/아니었어 3칸.
 * 2) 꼭 갈래로 찍어뒀는데 아직 안 간 부스 → "여기 가봤어?" 예/아니오. 예를
 *    누르면 그 자리에서 verdict 3칸이 펼쳐진다. **단정하지 않는다** — 안
 *    답하면 채점에서 빠질 뿐 "못 갔다"로 기록하지 않는다.
 *
 * 둘 다 없으면 즉시 onDone(). 답한 부스는 목록에서 바로 빠진다.
 */
export function VisitedRetroPrompt({
  exhibitionSlug,
  onDone,
}: {
  exhibitionSlug: string;
  onDone: () => void;
}) {
  const t = useT();
  const setVerdict = useVisitStore((s) => s.setVerdict);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const [askVerdict, setAskVerdict] = useState<PendingBooth[] | null>(null);
  const [askVisited, setAskVisited] = useState<PendingBooth[] | null>(null);
  const [expandedVisited, setExpandedVisited] = useState<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api.get<{ pending: PendingBooth[] }>(
        `/api/me/notes/pending-retro?exhibitionSlug=${encodeURIComponent(exhibitionSlug)}`,
      ),
      api.get<{ pending: PendingBooth[] }>(
        `/api/me/notes/must-not-visited?exhibitionSlug=${encodeURIComponent(exhibitionSlug)}`,
      ),
    ])
      .then(([v, m]) => {
        if (cancelled) return;
        setAskVerdict(v.pending);
        setAskVisited(m.pending);
      })
      .catch(() => {
        if (cancelled) return;
        setAskVerdict([]);
        setAskVisited([]);
      });
    return () => {
      cancelled = true;
    };
  }, [exhibitionSlug]);

  const loaded = askVerdict !== null && askVisited !== null;
  useEffect(() => {
    if (loaded && askVerdict!.length === 0 && askVisited!.length === 0) onDone();
  }, [loaded, askVerdict, askVisited, onDone]);

  function answerVerdict(boothId: string, verdict: "good" | "ok" | "bad") {
    setAskVerdict((prev) => (prev ? prev.filter((b) => b.boothId !== boothId) : prev));
    setVerdict(boothId, verdict);
    const prevJudged = useCompanionStore.getState().tasteJudged;
    void pushNote(boothId).then((taste) => {
      if (!taste) return;
      setTaste(taste.judgedCount, taste.pct);
      if (prevJudged < 5 && taste.judgedCount >= 5) {
        useCompanionStore.getState().say(t("companion.tasteInsight"));
      }
    });
  }

  function answerVisitedNo(boothId: string) {
    // "못 갔다"로 기록하지 않는다 — 그냥 목록에서 뺀다. 무반응과 동치.
    setAskVisited((prev) => (prev ? prev.filter((b) => b.boothId !== boothId) : prev));
  }

  if (!loaded || (askVerdict!.length === 0 && askVisited!.length === 0)) return null;

  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
      {askVerdict!.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">{t("companion.retroBatchTitle")}</p>
          <ul className="space-y-2">
            {askVerdict!.map((b) => (
              <li
                key={b.boothId}
                className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2"
              >
                <span className="truncate text-sm font-semibold">{b.boothName}</span>
                <div className="flex shrink-0 gap-1">
                  <button
                    type="button"
                    onClick={() => answerVerdict(b.boothId, "good")}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold active:bg-accent/40"
                  >
                    {t("judge.good")}
                  </button>
                  <button
                    type="button"
                    onClick={() => answerVerdict(b.boothId, "ok")}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold active:bg-accent/40"
                  >
                    {t("judge.ok")}
                  </button>
                  <button
                    type="button"
                    onClick={() => answerVerdict(b.boothId, "bad")}
                    className="rounded-lg border border-border px-2 py-1 text-xs font-semibold active:bg-accent/40"
                  >
                    {t("judge.bad")}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {askVisited!.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm font-bold">{t("companion.retroVisitedTitle")}</p>
          <ul className="space-y-2">
            {askVisited!.map((b) => {
              const expanded = expandedVisited.has(b.boothId);
              return (
                <li
                  key={b.boothId}
                  className="space-y-1.5 rounded-xl border border-border px-3 py-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-semibold">{b.boothName}</span>
                    {!expanded && (
                      <div className="flex shrink-0 gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            setExpandedVisited((prev) => new Set(prev).add(b.boothId))
                          }
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
                        >
                          {t("companion.retroVisitedYes")}
                        </button>
                        <button
                          type="button"
                          onClick={() => answerVisitedNo(b.boothId)}
                          className="rounded-lg border border-border px-2.5 py-1 text-xs font-semibold active:bg-accent/40"
                        >
                          {t("companion.retroVisitedNo")}
                        </button>
                      </div>
                    )}
                  </div>
                  {expanded && (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => answerVerdict(b.boothId, "good")}
                        className="flex-1 rounded-lg border border-border py-1 text-xs font-semibold active:bg-accent/40"
                      >
                        {t("judge.good")}
                      </button>
                      <button
                        type="button"
                        onClick={() => answerVerdict(b.boothId, "ok")}
                        className="flex-1 rounded-lg border border-border py-1 text-xs font-semibold active:bg-accent/40"
                      >
                        {t("judge.ok")}
                      </button>
                      <button
                        type="button"
                        onClick={() => answerVerdict(b.boothId, "bad")}
                        className="flex-1 rounded-lg border border-border py-1 text-xs font-semibold active:bg-accent/40"
                      >
                        {t("judge.bad")}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

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

- [ ] **Step 2: 신규 i18n 키 추가**

`dictionaries.ts`의 `companion:` 네임스페이스, `retroBatchTitle`/`retroBatchSkip`(`:462-463` 부근) 옆에 추가:

```ts
    retroVisitedTitle: "여기도 가려고 했었네",
    retroVisitedYes: "가봤어",
    retroVisitedNo: "못 갔어",
```

영어(`:948-949` 부근):

```ts
    retroVisitedTitle: "You planned to visit these too",
    retroVisitedYes: "I went",
    retroVisitedNo: "Didn't make it",
```

- [ ] **Step 3: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "visited-retro-prompt\|dictionaries"
npx vitest run
npx eslint src/components/companion/visited-retro-prompt.tsx src/lib/i18n/dictionaries.ts
git add src/components/companion/visited-retro-prompt.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(companion): 회고 되묻기 두 묶음 — 판정 없는 방문 + 안 간 must

1) 다녀왔는데 판정 없는 부스 → 좋았어/그냥그랬어/아니었어.
2) 꼭 갈래인데 아직 안 간 부스 → '가봤어?' 단정 없이 묻는다. 아니오를
누르면 조용히 목록에서 뺄 뿐 '못 갔다'로 기록하지 않는다(judgment-vocabulary §7)."
```

---

### Task 14: DB 마이그레이션

**Files:**
- Create: `supabase/migrations/00NN_judgment_vocabulary.sql` (번호는 Step 1에서 확정)

**Interfaces:**
- Consumes: 없음
- Produces: `booth_note` 테이블에 `interest`/`verdict`/`visited_at` 컬럼 추가, 기존 데이터 이관, `status`/`retro` 컬럼 제거

- [ ] **Step 1: 마이그레이션 번호 확정**

`supabase/`는 gitignore라 로컬에 최신 파일이 없다. **로컬 파일 목록만으로 다음 번호를 추측하지 말 것.** 다음 중 하나로 실제 다음 번호를 확인한다:
1. Supabase 대시보드의 마이그레이션 히스토리를 본다, 또는
2. 이 프로젝트에 연결된 Supabase MCP 도구가 있으면 그걸로 조회한다, 또는
3. 확실하지 않으면 사용자에게 "현재 Supabase에 적용된 최신 마이그레이션 번호가 몇 번이야?"라고 직접 묻는다.

확정된 번호를 `NN`에 넣어 파일명을 짓는다(예: 실제 다음이 0032면 `0032_judgment_vocabulary.sql`).

- [ ] **Step 2: SQL 작성**

```sql
-- 판단 어휘 재설계: booth_note.status(4값)+retro(2값) → interest/verdict/visited_at(직교 3필드)
-- interest·verdict는 서로 독립이다 — "꼭 갈래로 찍어둔 곳에 가봤더니 아니었다"를
-- 표현하려면 한 컬럼이 아니라 두 컬럼이어야 한다.

alter table booth_note
  add column if not exists interest text
    check (interest in ('must', 'curious', 'pass')),
  add column if not exists verdict text
    check (verdict in ('good', 'ok', 'bad')),
  add column if not exists visited_at timestamptz;

-- 기존 데이터 이관 — 없는 판정을 지어내지 않는다. visited+retro 없음은
-- verdict를 비워두고 visited_at만 채운다 → 회고 되묻기 큐로 자연히 들어간다.
update booth_note set interest = 'curious' where status = 'interested';
update booth_note set interest = 'curious' where status = 'later';
update booth_note set interest = 'pass' where status = 'skipped';
update booth_note set verdict = 'good', visited_at = updated_at
  where status = 'visited' and retro = 'liked';
update booth_note set verdict = 'bad', visited_at = updated_at
  where status = 'visited' and retro = 'disliked';
update booth_note set visited_at = updated_at
  where status = 'visited' and retro is null;

alter table booth_note
  drop column if exists status,
  drop column if exists retro;
```

> `later → curious` 두 UPDATE 문은 순서 무관(서로 배타 조건). 원래 테이블에 `status`/`retro`용 체크 제약이 있었다면 그 제약 이름을 먼저 `alter table booth_note drop constraint if exists <제약이름>;`로 지워야 컬럼 삭제가 막히지 않는다 — 실제 제약 이름은 Supabase 대시보드의 `booth_note` 테이블 정의에서 확인한다(로컬에 스키마 파일이 없어 이름을 알 수 없다).

- [ ] **Step 3: 로컬 mock 시드와의 정합성 확인**

`src/lib/mock/seed.ts`(또는 관련 시드 파일)에 `BoothNote` 목업 데이터가 `status`/`retro`로 하드코딩돼 있는지 확인한다:

```bash
grep -rn "status:.*visited\|status:.*interested\|status:.*skipped\|status:.*later\|retro:" src/lib/mock/seed.ts 2>/dev/null
```

있으면 Task 4-3 마이그레이션 표(스펙 §4-3)와 같은 규칙으로 `interest`/`verdict`/`visitedAt`로 고친다. 없으면 이 스텝은 스킵.

- [ ] **Step 4: 검증 + 커밋**

이 SQL은 `supabase/`가 gitignore라 **git에 커밋되지 않는다** — 파일을 만들었으면 그걸로 끝이다(레포 관례, CLAUDE.md 참고). 대신 전체 프로젝트가 여기까지 다 맞물렸는지 마지막 통합 검증을 돌린다:

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/
```

Expected: 전부 클린. 이 시점에 `status`·`retro`·`reaction_interested`·`reaction_later`·`booth_visited`·`booth_skipped`·`BoothStatus`·`setBoothRetro`·`ReactionBar`·`VisitedRetroInline` 문자열이 `src/` 전체에서 하나도 안 나와야 한다:

```bash
grep -rn "BoothStatus\|setBoothRetro\|reaction_interested\|reaction_later\|booth_visited\|booth_skipped\|ReactionBar\b\|VisitedRetroInline" src/ --include="*.ts" --include="*.tsx"
```

Expected: 빈 출력(주석 속 역사적 언급이 남아 있으면 문제없다 — 실제 식별자/문자열 리터럴 참조만 0이면 됨).

git 커밋은 SQL 파일이 없으므로 이 태스크에서 새로 만들 코드 변경이 없다(seed.ts를 고쳤으면 그것만 커밋):

```bash
git add src/lib/mock/seed.ts 2>/dev/null
git commit -m "chore(seed): 목업 노트 데이터를 interest/verdict로" --allow-empty
```

---

## 자기 점검 결과

계획을 쓴 뒤 스펙과 대조해 고친 것들:

- **§8-1 표가 스펙 원문과 다르다** — 스펙 본문 표는 "지도 시트 mode=`both`"라 적혀 있지만 바로 아래 "개정 2026-08-11" 인용 블록이 `adaptive`로 덮어썼다. 이 계획은 **개정된 `adaptive`**를 따른다(Task 8·10·11). `both` 모드는 아예 구현하지 않는다.
- **`retro` 전용 API 완전 폐기** — 스펙 §12 표는 `retro/route.ts`를 "흡수 후 삭제"라고만 적었는데, 실제로 `upsertNote`가 `interest`/`verdict`를 직교로 받으므로 verdict만 보내는 PUT 요청이 곧 옛 retro 역할을 한다. 별도 흡수 로직 없이 자연히 없어진다(Task 3·4).
- **`judgedClass` "두 시점" 처리** — 스펙 §6은 "얼리는 시점이 둘로 늘어난다"고만 적었다. 실제 구현(Task 4)에서 interest·verdict 각각의 `changed` 여부를 따로 계산해 최신 쪽이 최종이 되도록 정확히 명시했다(원 코드의 `statusChanged` 가드를 두 필드로 쪼갠 것과 동치).
- **`REFLECT_KINDS` 새 목록** — 스펙은 "신호명 교체"라고만 하고 정확히 뭘로 바꿀지 안 적었다. 기존 원칙(부정 신호 제외)을 그대로 이어 `reaction_must`·`reaction_curious`·`verdict_good`·`verdict_ok`·`booth_bookmarked`로 확정했다(Task 5).
- **지도 범례 6→5줄 압축** — 상시 노출 UI가 6줄이면 너무 길다는 실무 판단을 Task 10에 명시하고, 구현자가 6줄을 원하면 그래도 무방하다고 열어뒀다.
- **마이그레이션 번호 미확정** — 로컬 저장소가 `supabase/`를 gitignore해 실제 다음 번호를 알 수 없다. Task 14에 "추측 금지 + 확인 방법 3가지"를 명시했다.
- **`BoothPersonalPanel` props 변경이 호출부에 영향** — 기존 `boothId` 단일 prop을 `booth`/`category`/`exhibitionSlug`로 늘리므로, Task 11에 호출부를 찾아 갱신하는 스텝을 명시적으로 넣었다.

## 다루지 않는 것(스펙 §14 그대로)

- 북마크와 `interest='must'`의 관계 통합.
- 회고 화면 자체의 재설계(문구·레이아웃) — 이 계획은 되묻기 두 묶음을 "넣는" 것까지만.
- 부스 목록·검색 화면의 상태 표시(지도·피드·부스상세 세 곳만 통일).
- `docs/decisions/2026-08-11_taste-radar-map-sheet-zoom.md` §1·§2(이미 별도 계획 B로 구현·머지 완료).
