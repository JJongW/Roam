# 관람 중 co-presence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로미의 발화를 관람 전(피드)에서 관람 중(지도·현장)으로 확장한다 — 부스 선택·틀림 인정·미방문 이탈·검색 네 지점에서 결정론 한 줄을 적시에 말하되, 잔소리가 되지 않게 자발 발화엔 상한을 건다.

**Architecture:** 새 순수 함수 `lib/companion/copresence.ts`가 트리거별 발화를 조립한다(기억 절 + 사실 절, 우선순위대로 결합, 둘 다 없으면 null). `stores/companion.ts`에 자발 발화 쿨다운 게이트(`canSaySpontaneous`, 순수 함수 + 스토어 액션)를 추가한다. T1+T2(지도 부스 선택)는 하나의 "select" 트리거로 합친다 — 같은 UI 순간에서 기억/사실 어느 쪽이 있든 합성 규칙이 알아서 처리하므로 트리거를 둘로 나눌 이유가 없다. T4(틀림 인정)는 기존 `reaction-line.ts` 확장이라 copresence.ts와 무관하게 독립적으로 처리한다. 발화 채널은 전부 기존 `say()`/`flash`/토스트 재사용 — 새 UI 없음.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · Zustand · vitest

## 절대 규칙 (모든 태스크에 적용)

- speed rule 유지 — LLM 호출 0곳. 전부 결정론.
- 가치 이름을 발화에 쓰지 않는다 — 매칭 축(가치 slug)과 발화 축(카테고리 라벨)을 분리한다(reaction-line.ts의 기존 규약과 동일).
- 재료(기억·사실)가 없으면 null(침묵) — 억지 발화 금지.
- 후회방지 절은 실제 임박 사실(cue)이 있을 때만 붙인다.
- 자발 발화(select·unvisitedMust·searchHit)는 쿨다운(45초 AND 직전 이후 행동 3회, 둘 다 만족)과 "직전과 같은 트리거 연속 금지"를 통과해야 한다. 직접 유발 발화(반응 탭·검색은 본 검색 실행 자체가 아니라 그 반응/즉답은 상한 제외 — §스펙 T3·T4·T6 참고, 단 이 계획은 T6도 자발로 분류해 상한을 건다는 원문서 §2 표를 따른다)는 게이트를 안 거친다.
- i18n은 ko·en 양쪽.
- 주석은 한국어, why 중심.
- 새 npm 의존성을 추가하지 않는다.
- 검증 3종은 매 태스크 끝에: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.

---

### Task 1: 발화 조립 순수 함수 — `copresence.ts`

**Files:**
- Create: `src/lib/companion/copresence.ts`
- Test: `src/lib/companion/copresence.test.ts`

**Interfaces:**
- Consumes: `Booth`(`@/lib/types`). `boothValueSlugs(booth): string[]`(`@/lib/values`, 이미 구현됨). `TFn`(`@/lib/i18n/resolve`).
- Produces: `CopresencePositive = {booth: Booth; kind: "must"|"curious"|"good"}`. `CopresenceInput = {trigger:"select"; booth:Booth; positives:CopresencePositive[]; cue?:string; categoryLabel?:string} | {trigger:"unvisitedMust"; boothName:string} | {trigger:"searchHit"; booth:Booth; positives:CopresencePositive[]; categoryLabel?:string}`. `buildCopresenceLine(input: CopresenceInput, t: TFn): string | null`.

- [ ] **Step 1: i18n 카피 추가**

`src/lib/i18n/dictionaries.ts`의 ko `companion` 블록(446번째 줄 근처, `lineDefault: "..."` 다음 줄)에 추가:

```ts
    copresenceMemory: "아까 ‘{booth}’ 좋아했잖아, 여기도 그런 결이야.",
    copresenceCue: "{cue}",
    copresenceMemoryAndCue: "아까 ‘{booth}’ 좋아했잖아, {cue}",
    copresenceUnvisitedMust: "꼭 간다던 ‘{booth}’ 아직 안 갔어.",
    copresenceSearchHit: "‘{booth}’는 어때 — 네가 {theme} 쪽 좋아하는 결이라.",
```

en `companion` 블록(1139번째 줄 근처, `lineDefault: "..."` 다음 줄)에 추가:

```ts
    copresenceMemory: "You liked ‘{booth}’ earlier — this one's a similar vibe.",
    copresenceCue: "{cue}",
    copresenceMemoryAndCue: "You liked ‘{booth}’ earlier, and {cue}",
    copresenceUnvisitedMust: "You said ‘{booth}’ was a must — haven't been yet.",
    copresenceSearchHit: "How about ‘{booth}’ — fits the {theme} side you go for.",
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/companion/copresence.test.ts` 전체 내용:

```ts
import { describe, expect, it } from "vitest";
import { buildCopresenceLine } from "./copresence";
import { makeT } from "@/lib/i18n/resolve";
import { DICTS } from "@/lib/i18n/dictionaries";
import type { Booth } from "@/lib/types";

const t = makeT(DICTS.ko);

function booth(id: string, valueSlugs: string[], name = `부스-${id}`): Booth {
  return {
    id,
    exhibitionId: "e1",
    hallId: "h1",
    categoryId: "c1",
    name,
    company: "회사",
    description: "",
    longDescription: "",
    images: [],
    tags: valueSlugs,
    x: 0,
    y: 0,
    popularity: 0,
  } as unknown as Booth;
}

describe("buildCopresenceLine — select", () => {
  it("기억(가치 겹침)과 사실(cue)이 둘 다 있으면 결합한다", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const candidate = booth("cand1", ["discovery"], "이번부스");
    const line = buildCopresenceLine(
      {
        trigger: "select",
        booth: candidate,
        positives: [{ booth: past, kind: "must" }],
        cue: "5시 사인회 있어",
      },
      t,
    );
    expect(line).toContain("지난부스");
    expect(line).toContain("5시 사인회");
  });

  it("기억만 있으면 기억만 말한다", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const candidate = booth("cand1", ["discovery"], "이번부스");
    const line = buildCopresenceLine(
      { trigger: "select", booth: candidate, positives: [{ booth: past, kind: "must" }] },
      t,
    );
    expect(line).toContain("지난부스");
  });

  it("사실만 있으면 사실만 말한다", () => {
    const candidate = booth("cand1", ["discovery"], "이번부스");
    const line = buildCopresenceLine(
      { trigger: "select", booth: candidate, positives: [], cue: "5시 사인회 있어" },
      t,
    );
    expect(line).toContain("5시 사인회");
  });

  it("겹치는 가치도 cue도 없으면 null — 억지 발화 금지", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const candidate = booth("cand1", ["social"], "이번부스");
    const line = buildCopresenceLine(
      { trigger: "select", booth: candidate, positives: [{ booth: past, kind: "must" }] },
      t,
    );
    expect(line).toBeNull();
  });

  it("자기 자신은 기억 근거로 안 쓴다", () => {
    const self = booth("self1", ["discovery"], "이번부스");
    const line = buildCopresenceLine(
      { trigger: "select", booth: self, positives: [{ booth: self, kind: "must" }] },
      t,
    );
    expect(line).toBeNull();
  });
});

describe("buildCopresenceLine — unvisitedMust", () => {
  it("부스 이름으로 미방문을 짚는다", () => {
    const line = buildCopresenceLine(
      { trigger: "unvisitedMust", boothName: "꼭갈부스" },
      t,
    );
    expect(line).toContain("꼭갈부스");
  });
});

describe("buildCopresenceLine — searchHit", () => {
  it("겹치는 가치가 있으면 카테고리 라벨로 제안한다", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const hit = booth("hit1", ["discovery"], "검색결과");
    const line = buildCopresenceLine(
      {
        trigger: "searchHit",
        booth: hit,
        positives: [{ booth: past, kind: "must" }],
        categoryLabel: "독립출판",
      },
      t,
    );
    expect(line).toContain("검색결과");
    expect(line).toContain("독립출판");
  });

  it("겹치는 가치가 없으면 null", () => {
    const past = booth("past1", ["discovery"], "지난부스");
    const hit = booth("hit1", ["social"], "검색결과");
    const line = buildCopresenceLine(
      { trigger: "searchHit", booth: hit, positives: [{ booth: past, kind: "must" }] },
      t,
    );
    expect(line).toBeNull();
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/lib/companion/copresence.test.ts`
Expected: FAIL — `./copresence` 모듈이 없음.

- [ ] **Step 4: 구현**

`src/lib/companion/copresence.ts` 전체 내용:

```ts
// 관람 중(현장·지도) 발화 조립 — 순수·LLM 없음. 관람 전(피드) 발화는 reaction-line.ts가
// 맡고, 이 파일은 부스 선택·미방문 이탈·검색 같은 현장 트리거를 다룬다.
//
// 한 줄이 두 일을 한다: 기억(과거 긍정 반응 겹침) + 사실(cue: 실제 이벤트/타이밍)을
// 가능하면 결합한다. 우선순위는 사실 > 기억 — 실제로 확인 가능한 사실이 더 신뢰를
// 준다. 둘 다 없으면 null(침묵) — 억지 발화 금지는 grounding.ts·curate.ts와 같은 원칙.
//
// 가치 이름은 쓰지 않는다 — 카테고리 라벨(분야)만 발화에 얹는다. reaction-line.ts의
// "매칭 축(가치 slug) vs 발화 축(카테고리 라벨) 분리" 규약을 그대로 따른다.
import { boothValueSlugs } from "@/lib/values";
import type { Booth } from "@/lib/types";
import type { TFn } from "@/lib/i18n/resolve";

export interface CopresencePositive {
  booth: Booth;
  kind: "must" | "curious" | "good";
}

export type CopresenceInput =
  | {
      trigger: "select";
      booth: Booth;
      /** 과거 긍정 반응(자기 자신 제외 필요 없음 — 이 함수가 필터한다). */
      positives: CopresencePositive[];
      /** 실제 사실(임박 이벤트/타이밍) — deriveCue 결과. */
      cue?: string;
    }
  | { trigger: "unvisitedMust"; boothName: string }
  | {
      trigger: "searchHit";
      booth: Booth;
      positives: CopresencePositive[];
      /** 검색 결과 부스의 분야 라벨 — 가치 이름 아님. */
      categoryLabel?: string;
    };

/** positives 중 booth와 가치가 겹치는 첫 항목(자기 자신 제외). 없으면 undefined. */
function findMemoryMatch(
  booth: Booth,
  positives: CopresencePositive[],
): CopresencePositive | undefined {
  const vals = new Set(boothValueSlugs(booth));
  return positives.find(
    (p) =>
      p.booth.id !== booth.id &&
      boothValueSlugs(p.booth).some((v) => vals.has(v)),
  );
}

export function buildCopresenceLine(input: CopresenceInput, t: TFn): string | null {
  if (input.trigger === "unvisitedMust") {
    return t("companion.copresenceUnvisitedMust", { booth: input.boothName });
  }

  if (input.trigger === "searchHit") {
    const memory = findMemoryMatch(input.booth, input.positives);
    if (!memory || !input.categoryLabel) return null;
    return t("companion.copresenceSearchHit", {
      booth: input.booth.name,
      theme: input.categoryLabel,
    });
  }

  // trigger === "select" — 기억 + 사실을 우선순위대로 결합.
  const memory = findMemoryMatch(input.booth, input.positives);
  const cue = input.cue;
  if (memory && cue) {
    return t("companion.copresenceMemoryAndCue", { booth: memory.booth.name, cue });
  }
  if (cue) {
    return t("companion.copresenceCue", { cue });
  }
  if (memory) {
    return t("companion.copresenceMemory", { booth: memory.booth.name });
  }
  return null;
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `npx vitest run src/lib/companion/copresence.test.ts`
Expected: PASS(9개 전부)

- [ ] **Step 6: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "companion/copresence"
npx vitest run
npx eslint src/lib/companion/copresence.ts src/lib/companion/copresence.test.ts src/lib/i18n/dictionaries.ts
git add src/lib/companion/copresence.ts src/lib/companion/copresence.test.ts src/lib/i18n/dictionaries.ts
git commit -m "feat(companion): 현장 발화 조립 순수 함수 추가

부스 선택·미방문 이탈·검색 세 트리거의 발화를 한 곳에서 조립한다.
기억(과거 반응 겹침)과 사실(cue)을 우선순위대로 결합하고, 둘 다 없으면
말하지 않는다. 다음 태스크에서 자발 발화 상한 게이트를 붙인다."
```

---

### Task 2: 자발 발화 쿨다운 게이트 — `stores/companion.ts`

**Files:**
- Modify: `src/lib/stores/companion.ts`
- Test: `src/lib/stores/companion.test.ts`(신규)

**Interfaces:**
- Consumes: 없음(순수 상태 로직).
- Produces: `canSaySpontaneous(state: {lastSpontaneousAt: number|null; lastSpontaneousTrigger: string|null; actionsSinceLastSpontaneous: number}, trigger: string, now: number): boolean`(export). `useCompanionStore`에 `lastSpontaneousAt`·`lastSpontaneousTrigger`·`actionsSinceLastSpontaneous`·`recordAction()`·`saySpontaneous(trigger: string, text: string, now: number)` 추가.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/stores/companion.test.ts` 전체 내용:

```ts
import { describe, expect, it } from "vitest";
import { canSaySpontaneous } from "./companion";

const fresh = {
  lastSpontaneousAt: null as number | null,
  lastSpontaneousTrigger: null as string | null,
  actionsSinceLastSpontaneous: 0,
};

describe("canSaySpontaneous", () => {
  it("첫 발화는 항상 허용", () => {
    expect(canSaySpontaneous(fresh, "select", 1000)).toBe(true);
  });

  it("직전과 같은 트리거면 연속 금지", () => {
    const state = { ...fresh, lastSpontaneousTrigger: "select" };
    expect(canSaySpontaneous(state, "select", 1000)).toBe(false);
  });

  it("45초 안 지났으면 억제(행동 3회 이상이어도)", () => {
    const state = {
      lastSpontaneousAt: 1000,
      lastSpontaneousTrigger: "select",
      actionsSinceLastSpontaneous: 5,
    };
    expect(canSaySpontaneous(state, "searchHit", 1000 + 44_000)).toBe(false);
  });

  it("45초 지나도 행동 3회 미만이면 억제", () => {
    const state = {
      lastSpontaneousAt: 1000,
      lastSpontaneousTrigger: "select",
      actionsSinceLastSpontaneous: 2,
    };
    expect(canSaySpontaneous(state, "searchHit", 1000 + 46_000)).toBe(false);
  });

  it("45초 지나고 행동 3회 이상 + 다른 트리거면 허용", () => {
    const state = {
      lastSpontaneousAt: 1000,
      lastSpontaneousTrigger: "select",
      actionsSinceLastSpontaneous: 3,
    };
    expect(canSaySpontaneous(state, "searchHit", 1000 + 46_000)).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/stores/companion.test.ts`
Expected: FAIL — `canSaySpontaneous`가 export 안 됨.

- [ ] **Step 3: 구현**

`src/lib/stores/companion.ts`의 `CompanionState` interface에서 `appOnboardingJustCompleted`/`signalAppOnboardingComplete`/`clearAppOnboardingJustCompleted` 선언 다음에 추가:

```ts
  /**
   * 자발 발화(현장 부스 선택·미방문 이탈·검색) 쿨다운 상태 — "나그지 않기". 직접
   * 유발 발화(반응 탭 즉답)는 이 게이트를 안 거친다.
   */
  lastSpontaneousAt: number | null;
  lastSpontaneousTrigger: string | null;
  /** saySpontaneous가 성공한 뒤로 쌓인 사용자 행동 수 — recordAction()이 늘린다. */
  actionsSinceLastSpontaneous: number;
  /** 부스 선택·검색 등 자발 발화 후보가 될 수 있는 행동마다 호출. */
  recordAction: () => void;
  /** 자발 발화 시도 — 쿨다운을 통과하면 flash를 세팅하고 상태를 갱신, 아니면
   *  조용히 아무것도 안 한다(무음이 기본). now는 호출부가 Date.now()로 넘긴다. */
  saySpontaneous: (trigger: string, text: string, now: number) => void;
```

파일 끝(`export const useCompanionStore = create<CompanionState>((set) => ({` 시작 부분) **바로 위**에 추가:

```ts
/**
 * 자발 발화 쿨다운 판정 — 순수 함수(테스트 가능). "45초 또는 행동 3회당 1회 중
 * 늦은 쪽"은 두 조건 다 만족해야 한다는 뜻이다(더 늦게 만족되는 쪽이 실제 게이트가
 * 열리는 시점이므로). 직전과 같은 트리거면 그 자체로 금지(연속 같은 유형 금지).
 * 첫 발화(lastSpontaneousAt이 null)는 무조건 허용한다 — 비교할 기준이 없다.
 */
export function canSaySpontaneous(
  state: {
    lastSpontaneousAt: number | null;
    lastSpontaneousTrigger: string | null;
    actionsSinceLastSpontaneous: number;
  },
  trigger: string,
  now: number,
): boolean {
  if (state.lastSpontaneousTrigger === trigger) return false;
  if (state.lastSpontaneousAt === null) return true;
  const cooledDown = now - state.lastSpontaneousAt >= 45_000;
  const actedEnough = state.actionsSinceLastSpontaneous >= 3;
  return cooledDown && actedEnough;
}
```

`useCompanionStore`의 `create<CompanionState>((set) => ({` 객체 리터럴 마지막 필드(`clearAppOnboardingJustCompleted: () => set({ appOnboardingJustCompleted: false }),`) 다음에 추가:

```ts
  lastSpontaneousAt: null,
  lastSpontaneousTrigger: null,
  actionsSinceLastSpontaneous: 0,
  recordAction: () =>
    set((s) => ({
      actionsSinceLastSpontaneous: s.actionsSinceLastSpontaneous + 1,
    })),
  saySpontaneous: (trigger, text, now) =>
    set((s) => {
      if (!canSaySpontaneous(s, trigger, now)) return {};
      return {
        flash: text,
        lastSpontaneousAt: now,
        lastSpontaneousTrigger: trigger,
        actionsSinceLastSpontaneous: 0,
      };
    }),
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/stores/companion.test.ts`
Expected: PASS(5개 전부)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "stores/companion"
npx vitest run
npx eslint src/lib/stores/companion.ts src/lib/stores/companion.test.ts
git add src/lib/stores/companion.ts src/lib/stores/companion.test.ts
git commit -m "feat(companion): 자발 발화 쿨다운 게이트 추가

부스 선택·미방문 이탈·검색 같은 자발 발화가 잔소리가 되지 않게 최소
간격(45초 AND 행동 3회)과 연속 같은 유형 금지를 건다. 게이트 판정은
순수 함수(canSaySpontaneous)로 분리해 테스트한다."
```

---

### Task 3: 틀림 인정 발화(T4)

**Files:**
- Modify: `src/lib/companion/reaction-line.ts`
- Modify: `src/components/booth/judgment-bar.tsx`
- Modify: `src/lib/i18n/dictionaries.ts`(`companion` 네임스페이스)
- Test: `src/lib/companion/reaction-line.test.ts`

**Interfaces:**
- Consumes: 없음(기존 `buildJudgmentLine` 시그니처 확장).
- Produces: 없음(기존 함수 동작 확장 — `opts.matchedPriorInterest`가 `bad`에도 적용됨).

- [ ] **Step 1: i18n 카피 추가**

`src/lib/i18n/dictionaries.ts`의 ko `companion` 블록에 `reactBad`/`reactBadConfident` 관련 키가 있는 자리 근처에 추가(정확한 위치는 `reactBadConfident`를 검색해 그 주변에 넣는다):

```ts
    reactBadMissed: "내가 이거 좋아할 줄 알았는데 아니었네. 하나 배웠다.",
    reactBadMissedPlain: "내가 좋아할 줄 알았는데 아니었네. 하나 배웠다.",
```

en 블록에도 같은 자리에:

```ts
    reactBadMissed: "Thought you'd love this one — guess I learned something.",
    reactBadMissedPlain: "Thought you'd love that one — guess I learned something.",
```

- [ ] **Step 2: 실패하는 테스트 작성**

`src/lib/companion/reaction-line.test.ts` 파일 끝에 추가:

```ts
describe("buildJudgmentLine — bad, 직전 interest가 must/curious였으면 '배움' 톤", () => {
  it("matchedPriorInterest면 reactBadMissed를 쓴다(분야 매칭 여부와 무관)", () => {
    const line = buildJudgmentLine(
      "verdict", "bad", [], "테스트부스", undefined, noInterests, t,
      { matchedPriorInterest: true },
    );
    expect(line).toContain("배웠다");
  });

  it("matchedPriorInterest가 아니면 기존 reactBad 경로 그대로", () => {
    const line = buildJudgmentLine(
      "verdict", "bad", [], "테스트부스", undefined, noInterests, t,
      { matchedPriorInterest: false },
    );
    expect(line).not.toContain("배웠다");
  });
});
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/lib/companion/reaction-line.test.ts`
Expected: FAIL — 새 테스트 케이스가 기존 `reactBad`(변함없음)를 반환해 `"배웠다"`를 안 담음.

- [ ] **Step 4: `reaction-line.ts` 구현**

기존:

```ts
  // value === "bad" — 확신 매칭에서만, 헤지된 문장으로. 부스를 깎지 않고
  // "내 예측이 빗나갔다" 쪽으로 로미가 가져간다.
  if (match && match.confidence >= CONFIDENT_THRESHOLD && categoryLabel) {
    return line(`${BASE_KEY.bad}Confident`, boothName, t, categoryLabel);
  }
  return line(BASE_KEY.bad, boothName, t);
```

를 다음으로 교체:

```ts
  // value === "bad" — 직전 interest가 must/curious였으면(예측이 있었다는 뜻)
  // 분야 매칭 여부와 무관하게 명시적 "배움" 톤이 가장 구체적인 근거다 — 브레인
  // 확신도 매칭(아래 Confident 분기)보다 우선한다. 부스를 깎지 않고 "내 예측이
  // 빗나갔다"로 로미가 가져가는 원칙은 그대로다.
  if (opts?.matchedPriorInterest) {
    return line("reactBadMissed", boothName, t);
  }
  if (match && match.confidence >= CONFIDENT_THRESHOLD && categoryLabel) {
    return line(`${BASE_KEY.bad}Confident`, boothName, t, categoryLabel);
  }
  return line(BASE_KEY.bad, boothName, t);
```

`opts` 매개변수의 doc comment(46-48번째 줄 근처, `/** verdict='good'일 때만 쓴다...`)를 다음으로 교체:

```ts
  /** verdict='good'|'bad'일 때 쓴다 — 직전에 interest가 must/curious였는지(예측이
   *  맞았는지/빗나갔는지). 호출부(judgment-bar)가 판단 직전 record에서 넘긴다. */
```

- [ ] **Step 5: `judgment-bar.tsx` 구현**

기존:

```tsx
    // good일 때 "예측이 맞았는지"는 반응 직전(스토어 갱신 전)의 interest로 판단한다.
    const matchedPriorInterest =
      kind === "verdict" && value === "good"
        ? record?.interest === "must" || record?.interest === "curious"
        : undefined;
```

를 다음으로 교체:

```tsx
    // good·bad일 때 "예측이 맞았는지/빗나갔는지"는 반응 직전(스토어 갱신 전)의
    // interest로 판단한다.
    const matchedPriorInterest =
      kind === "verdict" && (value === "good" || value === "bad")
        ? record?.interest === "must" || record?.interest === "curious"
        : undefined;
```

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/lib/companion/reaction-line.test.ts`
Expected: PASS(전체)

- [ ] **Step 7: 검증 + 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/companion/reaction-line.ts src/lib/companion/reaction-line.test.ts src/components/booth/judgment-bar.tsx src/lib/i18n/dictionaries.ts
git add src/lib/companion/reaction-line.ts src/lib/companion/reaction-line.test.ts src/components/booth/judgment-bar.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(companion): 예측이 빗나갔을 때 로미가 배웠다고 인정

verdict=bad인데 직전 interest가 must·curious였으면(로미가 확신을 갖고
예측했었다는 뜻) 분야 매칭 여부와 무관하게 명시적으로 '내가 틀렸다'를
말한다. 실제로 다음 피드에서 그 결이 줄어드는 게 distill에 이미 반영돼
있어 이 발화는 빈말이 아니라 사실을 말로 잇는 것뿐이다."
```

---

### Task 4: 지도 부스 선택 발화(T1+T2)

**Files:**
- Modify: `src/app/(visitor)/exhibitions/[slug]/map/page.tsx`
- Modify: `src/components/map/map-view.tsx`

**Interfaces:**
- Consumes: Task 1의 `buildCopresenceLine`. Task 2의 `saySpontaneous`/`recordAction`. `deriveCue(booth, events): string|undefined`(`@/lib/feed/cue`, 이미 구현됨). `repo.listEvents(slug, opts?): Promise<BoothEvent[]>`(이미 구현됨).

- [ ] **Step 1: 이벤트 데이터를 지도 페이지에서 불러와 부스별로 묶기**

`src/app/(visitor)/exhibitions/[slug]/map/page.tsx` 전체를 다음으로 교체:

```tsx
import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { MapView } from "@/components/map/map-view";
import type { BoothEvent } from "@/lib/types";

export const metadata = { title: "지도" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ booth?: string }>;
};

export default async function MapPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { booth } = await searchParams;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const [booths, events] = await Promise.all([
    repo.listBoothsByExhibitionId(detail.exhibition.id),
    repo.listEvents(slug),
  ]);
  // 지도에서 부스를 선택했을 때 임박 이벤트(cue)를 즉시 말할 수 있게 부스별로
  // 미리 묶어 내려준다 — curateFeed가 이미 하는 것과 같은 그룹핑.
  const eventsByBooth: Record<string, BoothEvent[]> = {};
  for (const e of events) (eventsByBooth[e.boothId] ??= []).push(e);

  return (
    <MapView
      detail={detail}
      booths={booths}
      initialFocusId={booth}
      eventsByBooth={eventsByBooth}
    />
  );
}
```

- [ ] **Step 2: `MapView`가 부스 선택 시 co-presence 발화**

`src/components/map/map-view.tsx`의 컴포넌트 props 타입, 기존:

```tsx
export function MapView({
  detail,
  booths,
  initialFocusId,
}: {
  detail: ExhibitionDetail;
  booths: Booth[];
  /** Deep-link target (e.g. from the 메모장 "지도에서 보기"): preselect + center. */
  initialFocusId?: string;
}) {
```

를 다음으로 교체:

```tsx
export function MapView({
  detail,
  booths,
  initialFocusId,
  eventsByBooth,
}: {
  detail: ExhibitionDetail;
  booths: Booth[];
  /** Deep-link target (e.g. from the 메모장 "지도에서 보기"): preselect + center. */
  initialFocusId?: string;
  /** 부스별 이벤트 — 선택 시 co-presence 발화의 cue 재료. */
  eventsByBooth: Record<string, BoothEvent[]>;
}) {
```

import 목록에 추가:

```tsx
import { deriveCue } from "@/lib/feed/cue";
import { buildCopresenceLine, type CopresencePositive } from "@/lib/companion/copresence";
import type { BoothEvent } from "@/lib/types";
```

(`useEffect`가 이미 react import에 있는지 확인 — 없으면 추가.)

`const selected = booths.find((b) => b.id === selectedId) ?? null;`(120번째 줄 근처) 바로 뒤, `const selectedCat = ...` 다음에 추가:

```tsx
  // 부스 선택 = co-presence 트리거(T1+T2 통합) — 과거 긍정 반응과 가치가
  // 겹치거나(기억) 임박 이벤트가 있으면(사실) 로미가 한 줄 말한다. 둘 다 없으면
  // 침묵(억지 발화 금지). 자발 발화라 쿨다운 게이트를 거친다.
  const say = useCompanionStore((s) => s.saySpontaneous);
  const recordAction = useCompanionStore((s) => s.recordAction);
  useEffect(() => {
    if (!selected) return;
    recordAction();
    const positives: CopresencePositive[] = booths
      .map((b) => {
        const r = records[b.id];
        if (r?.verdict === "good") return { booth: b, kind: "good" as const };
        if (r?.interest === "must") return { booth: b, kind: "must" as const };
        if (r?.interest === "curious") return { booth: b, kind: "curious" as const };
        return null;
      })
      .filter((p): p is CopresencePositive => p !== null);
    const cue = deriveCue(selected, eventsByBooth[selected.id] ?? []);
    const line = buildCopresenceLine(
      { trigger: "select", booth: selected, positives, cue },
      t,
    );
    if (line) say("select", line, Date.now());
    // selectedId가 바뀔 때만(부스를 다시 고를 때만) — records/booths 참조가
    // 매 렌더 바뀌어도 재실행되면 안 된다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);
```

(`useCompanionStore`는 파일에 이미 import돼 있다 — `flash`/`clearFlash`에 쓰는 그 import에 `saySpontaneous`·`recordAction` selector만 추가로 쓰는 것.)

- [ ] **Step 3: 검증**

이 컴포넌트·페이지는 다른 지도/방문객 페이지와 마찬가지로 유닛테스트가 없다 — 새로 만들지 않는다(copresence.ts 자체 로직은 Task 1에서 이미 테스트됨).

```bash
npx tsc --noEmit
npx vitest run
npx eslint "src/app/(visitor)/exhibitions/[slug]/map/page.tsx" src/components/map/map-view.tsx
```

- [ ] **Step 4: 수동 확인(선택, 가능하면)**

`npx next dev`로 mock 모드 실행 후 지도에서 이전에 반응한 부스와 같은 분야의 부스를 선택 → 토스트가 뜨는지, 짧은 시간 안에 여러 부스를 눌러도 매번 뜨지 않고(쿨다운) 잔소리가 안 되는지 확인.

- [ ] **Step 5: 커밋**

```bash
git add "src/app/(visitor)/exhibitions/[slug]/map/page.tsx" src/components/map/map-view.tsx
git commit -m "feat(map): 부스 선택 시 co-presence 발화(T1+T2)

부스를 탭하면 과거 긍정 반응과 가치가 겹치거나 임박 이벤트가 있을 때
로미가 짧게 짚어준다. 지금까지 지도에서 로미는 반응 즉답에만 말했다 —
'같이 걷는' 순간에는 조용했다."
```

---

### Task 5: 관심 부스 미방문 이탈(T5)

**Files:**
- Modify: `src/components/companion/finish-visit.tsx`

**Interfaces:**
- Consumes: Task 1의 `buildCopresenceLine`. Task 2의 `saySpontaneous`/`recordAction`. `GET /api/me/notes/must-not-visited?exhibitionSlug=&limit=`(이미 구현됨, 응답 `{pending: {boothId,boothName}[]}`).

- [ ] **Step 1: 구현**

`src/components/companion/finish-visit.tsx`에서 import 목록에 추가:

```tsx
import { buildCopresenceLine } from "@/lib/companion/copresence";
```

`useCompanionStore` import(있다면 그 옆에, 없으면 추가):

```tsx
import { useCompanionStore } from "@/lib/stores/companion";
```

컴포넌트 안, `const [retroOpen, setRetroOpen] = useState(false);` 등 기존 state 선언 다음에 추가:

```tsx
  const say = useCompanionStore((s) => s.saySpontaneous);
  const recordAction = useCompanionStore((s) => s.recordAction);
```

버튼의 기존 `onClick={() => setRetroOpen(true)}`를 다음으로 교체:

```tsx
  async function openRetro() {
    recordAction();
    // 마치기 시도 = T5 트리거. 꼭 갈래인데 아직 안 간 부스가 있으면(1개만, 첫
    // 결과) 로미가 짚어준다 — 막지는 않는다, 그냥 한 번 알려주고 그대로 진행.
    try {
      const res = await api.get<{ pending: { boothId: string; boothName: string }[] }>(
        `/api/me/notes/must-not-visited?exhibitionSlug=${slug}&limit=1`,
      );
      const first = res.pending[0];
      if (first) {
        const line = buildCopresenceLine(
          { trigger: "unvisitedMust", boothName: first.boothName },
          t,
        );
        if (line) say("unvisitedMust", line, Date.now());
      }
    } catch {
      /* 조회 실패해도 마치기 흐름은 막지 않는다 */
    }
    setRetroOpen(true);
  }
```

버튼의 `onClick`을 `onClick={openRetro}`로 바꾼다.

- [ ] **Step 2: 검증**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/companion/finish-visit.tsx
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/companion/finish-visit.tsx
git commit -m "feat(companion): 마치기 시도 시 미방문 관심 부스 짚기(T5)

'오늘 관람 마치기'를 누르는 순간, 꼭 갈래로 찍어뒀는데 아직 안 간
부스가 있으면 로미가 한 번 짚어준다. 막지는 않는다 — 알려주고 그대로
진행."
```

---

### Task 6: 검색 첫 결과 발화(T6)

**Files:**
- Modify: `src/components/feed/booth-search.tsx`

**Interfaces:**
- Consumes: Task 1의 `buildCopresenceLine`. Task 2의 `saySpontaneous`/`recordAction`.

- [ ] **Step 1: 구현**

`src/components/feed/booth-search.tsx`에서 import 목록에 추가:

```tsx
import { useCompanionStore } from "@/lib/stores/companion";
import { buildCopresenceLine, type CopresencePositive } from "@/lib/companion/copresence";
import { useVisitStore } from "@/lib/stores/visit";
import { boothValueSlugs } from "@/lib/values";
```

컴포넌트 안, 기존 state 선언들(`q`/`results`/`loading`/`seq`) 다음에 추가:

```tsx
  const say = useCompanionStore((s) => s.saySpontaneous);
  const recordAction = useCompanionStore((s) => s.recordAction);
  const records = useVisitStore((s) => s.records);
```

`useEffect`의 `.then((page) => { if (id !== seq.current) return; setResults(page.data); })` 블록을 다음으로 교체:

```tsx
        .then((page) => {
          if (id !== seq.current) return;
          setResults(page.data);
          // 검색 첫 결과 = T6 트리거. 결과 목록 전체가 아니라 최상단 하나만
          // 대상으로 한다 — 검색 결과 개수만큼 발화하면 그게 더 잔소리다.
          recordAction();
          const first = page.data[0];
          if (first) {
            const positives: CopresencePositive[] = page.data
              .map((b) => {
                const r = records[b.id];
                if (r?.verdict === "good") return { booth: b, kind: "good" as const };
                if (r?.interest === "must") return { booth: b, kind: "must" as const };
                if (r?.interest === "curious")
                  return { booth: b, kind: "curious" as const };
                return null;
              })
              .filter((p): p is CopresencePositive => p !== null);
            const line = buildCopresenceLine(
              {
                trigger: "searchHit",
                booth: first,
                positives,
                categoryLabel: categoryById[first.categoryId]?.name,
              },
              t,
            );
            if (line) say("searchHit", line, Date.now());
          }
        })
```

(`positives`는 검색 결과 자기 자신이 후보로 안 섞이게 `findMemoryMatch`가 이미 자기 자신을 걸러낸다 — 그대로 넘겨도 안전하다.)

- [ ] **Step 2: 검증**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/feed/booth-search.tsx
```

- [ ] **Step 3: 커밋**

```bash
git add src/components/feed/booth-search.tsx
git commit -m "feat(companion): 검색 첫 결과에 co-presence 발화(T6)

검색해서 나온 첫 부스가 과거 긍정 반응과 가치가 겹치면 로미가 짧게
제안한다. 겹치는 게 없으면 말하지 않는다."
```

---

## 자기 점검 결과

- **스펙 커버리지**: 원문서의 T1·T2·T4·T5·T6 다섯 트리거 모두 Task 1~6에 대응(T1+T2는 Task 1의 설계 판단으로 "select" 트리거 하나로 합침 — 같은 UI 순간이라 결합 규칙이 어차피 처리). T3(반응 즉답)은 이미 구현돼 있어 손대지 않는다. T7(dwell)은 원문서가 명시적으로 스코프 밖. 쿨다운(§4)·틀림 인정(§5) 모두 전용 태스크로 구현+테스트.
- **플레이스홀더 스캔**: 없음 — 모든 코드가 실제 파일 경로·실제 함수 시그니처를 참조.
- **타입 일관성**: `CopresenceInput`/`CopresencePositive`(Task 1 정의) → Task 4·6(호출부) 동일 형태로 소비. `canSaySpontaneous`의 상태 shape(Task 2 정의)가 스토어의 실제 필드명과 정확히 일치. `saySpontaneous`/`recordAction` 시그니처가 Task 2(정의)와 Task 4·5·6(호출) 전체에서 일치.
- **범위 점검**: 6태스크 모두 독립 커밋 가능. Task 1·2는 서로 무관(순서 안 중요, 이 계획은 1→2 순서로 뒀다). Task 3(T4)은 Task 1·2와 완전히 무관 — 기존 reaction-line.ts 확장일 뿐. Task 4·5·6은 각각 Task 1·2를 소비하므로 그 뒤에 온다.
- **속도 규칙**: 6태스크 전부 결정론 — LLM 호출 0곳.
