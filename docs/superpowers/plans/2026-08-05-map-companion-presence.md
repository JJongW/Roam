# 지도 로미 존재감 — 반응 즉답 고도화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 지도에서 부스에 반응(끌림/별로)할 때 뜨는 로미 즉답이 그 부스의 실제 분야와
사용자의 누적 확신도에 따라 톤이 달라지게 하고(조심스러움→확신), 토스트에 로미
얼굴을 붙여 "상주 존재감"을 대신한다.

**Architecture:** 전시 홈(서버 컴포넌트)이 이미 읽는 브레인 `interests`를 컴패니언
스토어에 태워 지도까지 들고 간다(기존 `HomeCompanionContextBridge` 패턴 재사용, 새
API 없음). 지도의 반응 버튼은 그 스토어 값 + 부스의 `tags`(분야)를 클라이언트에서
매칭해 네트워크 없이 즉시 문장을 조립한다.

**Tech Stack:** 기존 zustand 컴패니언 스토어, 기존 i18n 딕셔너리(`t()`), `sonner`
토스트, vitest.

## Global Constraints

- 반응 즉답은 0-latency 유지 — 이 기능은 서버 호출을 추가하지 않는다(CLAUDE.md "탭엔
  LLM 금지")
- 로미 발화에 추상 가치 이름(발견·경험·휴식…)을 쓰지 않는다 — 분야 매칭은 반드시
  `booth.tags`(카테고리 slug, 100% 채워짐)로 한다. `enrichment.themeTags`/`valueTags`는
  이번 스코프에서 안 씀(커버리지 16~66%로 들쭉날쭉)
- 확신 임계값은 기존 값 `0.25`를 그대로 재사용(taste.ts·curate.ts와 동일 값) — 새
  임계값 상수 만들지 않는다
- `later`·`seen` 반응은 분야를 언급하지 않는다(판정 가중치가 낮아 과장이 됨,
  taste.ts의 `judgmentScore`)
- `skip`이 분야를 언급하는 건 확신 분야(confidence≥0.25)일 때만이고, 그때도 "안에서도
  다는 아니다"로 헤지한다(분야 전체 부정 금지)
- 지도 화면에 상시 플로팅 아바타를 추가하지 않는다(`docs/ai-companion-ux-writing-patterns.md:379`,
  "상단바 없음" 원칙) — 존재감은 반응 토스트 아이콘으로만 표현

참고 스펙: `docs/superpowers/specs/2026-08-05-map-companion-presence-design.md`

---

### Task 1: 브레인 관심 분야를 컴패니언 스토어까지 배선

**Files:**
- Modify: `src/lib/stores/companion.ts`
- Modify: `src/components/companion/home-companion-context.tsx`
- Modify: `src/app/(visitor)/exhibitions/[slug]/page.tsx:159-164`

**Interfaces:**
- Consumes: `InterestNode` (`src/lib/types/index.ts:372-380` — 이미 존재, 필드
  `{key, label, confidence, signals, firstSeenAt, lastSeenAt, trend}`), `brain.interests`
  (`page.tsx:65`에서 이미 읽음)
- Produces: `useCompanionStore((s) => s.interests): InterestNode[]` — Task 3/4가 이걸
  읽어 반응 즉답에 쓴다.

이 태스크는 순수 로직이 없는 배선 작업이라(기존 `tasteJudged`/`setTaste`와 같은
성격) 전용 단위 테스트 없이 타입체크 + 빌드로 검증한다.

- [ ] **Step 1: 컴패니언 스토어에 `interests` 추가**

`src/lib/stores/companion.ts` 전체를 아래로 교체:

```ts
"use client";

import { create } from "zustand";
import type { InterestNode } from "@/lib/types";

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

  /**
   * 브레인 상위 관심 분야(신뢰도 내림차순, distill.ts가 이미 정렬해서 준다). 지도
   * 반응 즉답(reaction-line.ts)이 부스 분야와 매칭해 톤을 정하는 데 쓴다.
   * tasteJudged/tastePct와 같은 생명주기 — 화면을 벗어나도 비우지 않는다(지도가
   * 전시 홈을 떠난 뒤에도 이 값이 필요하기 때문). 이 세션에서 전시 홈을 한 번도
   * 안 거치고 지도로 바로 딥링크하면 빈 배열 — 그때 반응 즉답은 분야 언급 없는
   * 기존 문장으로 자연히 떨어진다(별도 처리 없음, 의도된 단순화).
   */
  interests: InterestNode[];
  setInterests: (interests: InterestNode[]) => void;
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
  interests: [],
  setInterests: (interests) => set({ interests }),
}));
```

- [ ] **Step 2: 브리지 컴포넌트가 `interests`도 받아 스토어에 세팅**

`src/components/companion/home-companion-context.tsx` 전체를 아래로 교체:

```tsx
"use client";

import { useEffect } from "react";
import { useCompanionStore } from "@/lib/stores/companion";
import type { InterestNode } from "@/lib/types";

/**
 * 전시 홈(서버 컴포넌트)이 계산한 맥락을 상주 컴패니언 바에 실어주는 클라이언트 브리지.
 * 화면을 벗어나면 홈 맥락은 비워, 다른 화면에서 홈 발화가 새지 않게 한다. taste·
 * interests는 안 비운다 — 둘 다 지도 등 다른 화면에서도 필요하다(reaction-bar.tsx).
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
  interests,
}: {
  values: string[];
  picked: number;
  /** 서버 브레인으로 계산한 판정 수. */
  tasteJudged: number;
  /** 판정 5개 미만이면 null(말로만 표시). */
  tastePct: number | null;
  /** 브레인 상위 관심 분야 — 지도 반응 즉답이 분야를 언급할 때 쓴다. */
  interests: InterestNode[];
}) {
  const setHome = useCompanionStore((s) => s.setHome);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const setInterests = useCompanionStore((s) => s.setInterests);
  const key = values.join("·");
  useEffect(() => {
    setHome({ values, picked });
    setTaste(tasteJudged, tastePct);
    setInterests(interests);
    return () => setHome(null);
    // values는 원시 배열이라 join 키로 비교(불필요 리셋 방지).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    setHome,
    setTaste,
    setInterests,
    key,
    picked,
    tasteJudged,
    tastePct,
    interests,
  ]);
  return null;
}
```

- [ ] **Step 3: 전시 홈 페이지가 `brain.interests`를 브리지에 전달**

`src/app/(visitor)/exhibitions/[slug]/page.tsx:159-164`, 기존:

```tsx
            <HomeCompanionContextBridge
              values={topValues}
              picked={feedItems.length}
              tasteJudged={taste.judgedCount}
              tastePct={taste.pct}
            />
```

교체:

```tsx
            <HomeCompanionContextBridge
              values={topValues}
              picked={feedItems.length}
              tasteJudged={taste.judgedCount}
              tastePct={taste.pct}
              interests={brain?.interests ?? []}
            />
```

- [ ] **Step 4: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음

- [ ] **Step 5: 커밋**

```bash
git add src/lib/stores/companion.ts src/components/companion/home-companion-context.tsx "src/app/(visitor)/exhibitions/[slug]/page.tsx"
git commit -m "feat(companion): 브레인 관심 분야를 컴패니언 스토어까지 배선"
```

---

### Task 2: 반응 즉답 신규 카피(ko/en)

**Files:**
- Modify: `src/lib/i18n/dictionaries.ts:424-431` (ko `companion` 네임스페이스)
- Modify: `src/lib/i18n/dictionaries.ts:897-904` (en `companion` 네임스페이스)

**Interfaces:**
- Produces: `t("companion.reactInterestedTentative"|"reactInterestedTentativePlain"|"reactInterestedConfident"|"reactInterestedConfidentPlain"|"reactSkipConfident"|"reactSkipConfidentPlain")` —
  Task 3이 이 키들을 호출한다. `Dict` 타입(`dictionaries.ts:8`)이 `ko`에서 자동
  파생되므로, ko와 en 양쪽에 **같은 키**를 넣어야 타입체크가 통과한다.

- [ ] **Step 1: ko 카피 추가**

`src/lib/i18n/dictionaries.ts:424-431`, 기존:

```ts
    reactInterested: "‘{booth}’, 기억해둘게. 비슷한 거 더 찾아볼게.",
    reactInterestedPlain: "기억해둘게. 비슷한 거 더 찾아볼게.",
    reactLater: "‘{booth}’, 킵해뒀어.",
    reactLaterPlain: "킵해뒀어. 잊지 않게 챙겨둘게.",
    reactSkip: "‘{booth}’, 알았어. 비슷한 건 덜 보여줄게.",
    reactSkipPlain: "알았어, 이런 건 덜 보여줄게.",
    reactSeen: "‘{booth}’ 봤구나. 다음 걸로 넘어가자.",
    reactSeenPlain: "이미 봤구나. 다음 걸로 넘어가자.",
```

교체(뒤에 6줄 추가):

```ts
    reactInterested: "‘{booth}’, 기억해둘게. 비슷한 거 더 찾아볼게.",
    reactInterestedPlain: "기억해둘게. 비슷한 거 더 찾아볼게.",
    reactLater: "‘{booth}’, 킵해뒀어.",
    reactLaterPlain: "킵해뒀어. 잊지 않게 챙겨둘게.",
    reactSkip: "‘{booth}’, 알았어. 비슷한 건 덜 보여줄게.",
    reactSkipPlain: "알았어, 이런 건 덜 보여줄게.",
    reactSeen: "‘{booth}’ 봤구나. 다음 걸로 넘어가자.",
    reactSeenPlain: "이미 봤구나. 다음 걸로 넘어가자.",
    // 분야 매칭 즉답(reaction-line.ts) — 확신도(0.25 임계값)에 따라 조심스러움→확신.
    // skip은 확신 분야에서만 이름을 말하고, 그때도 "안에서도 다는 아니다"로 헤지한다.
    reactInterestedTentative: "‘{booth}’, 기억해둘게 — ‘{theme}’ 쪽에 관심 있나 봐.",
    reactInterestedTentativePlain: "‘{theme}’ 쪽에 관심 있나 봐.",
    reactInterestedConfident: "‘{booth}’도 그렇고, ‘{theme}’ 확실히 좋아하는구나.",
    reactInterestedConfidentPlain: "‘{theme}’ 확실히 좋아하는구나.",
    reactSkipConfident: "‘{booth}’는 아니었구나. ‘{theme}’ 안에서도 다 취향은 아닌가 봐.",
    reactSkipConfidentPlain: "‘{theme}’ 안에서도 다 취향은 아닌가 봐.",
```

- [ ] **Step 2: en 카피 추가**

`src/lib/i18n/dictionaries.ts:897-904`, 기존:

```ts
    reactInterested: "“{booth}” — noted. I'll find more like it.",
    reactInterestedPlain: "Noted. I'll find more like it.",
    reactLater: "“{booth}” — saved for later.",
    reactLaterPlain: "Saved for later.",
    reactSkip: "“{booth}” — got it. I'll show fewer like it.",
    reactSkipPlain: "Got it. I'll show fewer like these.",
    reactSeen: "You've seen “{booth}”. On to the next.",
    reactSeenPlain: "Seen it already. Let's move on.",
```

교체(뒤에 6줄 추가):

```ts
    reactInterested: "“{booth}” — noted. I'll find more like it.",
    reactInterestedPlain: "Noted. I'll find more like it.",
    reactLater: "“{booth}” — saved for later.",
    reactLaterPlain: "Saved for later.",
    reactSkip: "“{booth}” — got it. I'll show fewer like it.",
    reactSkipPlain: "Got it. I'll show fewer like these.",
    reactSeen: "You've seen “{booth}”. On to the next.",
    reactSeenPlain: "Seen it already. Let's move on.",
    reactInterestedTentative: "“{booth}” — noted. Looks like {theme} is catching your eye.",
    reactInterestedTentativePlain: "Looks like {theme} is catching your eye.",
    reactInterestedConfident: "“{booth}” fits too — you really go for {theme}.",
    reactInterestedConfidentPlain: "You really go for {theme}.",
    reactSkipConfident: "“{booth}” wasn't it. Guess not every {theme} booth is your thing.",
    reactSkipConfidentPlain: "Guess not every {theme} booth is your thing.",
```

- [ ] **Step 3: 타입체크**

Run: `npx tsc --noEmit`
Expected: 에러 없음(ko/en 키 불일치 시 `Dict` 타입 에러가 난다)

- [ ] **Step 4: 커밋**

```bash
git add src/lib/i18n/dictionaries.ts
git commit -m "feat(i18n): 분야 매칭 반응 즉답 카피 추가"
```

---

### Task 3: `reaction-line.ts` — 분야 매칭 순수 함수 (TDD)

**Files:**
- Create: `src/lib/companion/reaction-line.ts`
- Test: `src/lib/companion/reaction-line.test.ts`

**Interfaces:**
- Consumes: `InterestNode[]`(Task 1), `companion.react*` i18n 키(Task 2), `TFn`
  (`src/lib/i18n/resolve.ts`)
- Produces: `buildReactionLine(key: ReactionKey, booth: Pick<Booth, "tags">, boothName: string | undefined, interests: InterestNode[], t: TFn): string`
  및 `export type ReactionKey = "interested" | "later" | "skip" | "seen"` — Task 4가
  이 함수로 `reaction-bar.tsx`의 기존 `reactionLine()`을 대체한다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/companion/reaction-line.test.ts` 새로 작성:

```ts
import { describe, expect, it } from "vitest";
import { buildReactionLine } from "@/lib/companion/reaction-line";
import { makeT } from "@/lib/i18n/resolve";
import { DICTS } from "@/lib/i18n/dictionaries";
import type { InterestNode } from "@/lib/types";

const t = makeT(DICTS.ko);

function node(key: string, confidence: number, label: string): InterestNode {
  return {
    key,
    label,
    confidence,
    signals: { explicit: 0, implicit: 0, negative: 0 },
    firstSeenAt: "2026-01-01T00:00:00.000Z",
    lastSeenAt: "2026-01-01T00:00:00.000Z",
    trend: "flat",
  };
}

describe("buildReactionLine", () => {
  it("interested, 매칭 없음 → 기존 문장", () => {
    const result = buildReactionLine(
      "interested",
      { tags: ["illust"] },
      "책방나비",
      [],
      t,
    );
    expect(result).toBe(t("companion.reactInterested", { booth: "책방나비" }));
  });

  it("interested, 매칭 confidence<0.25 → tentative", () => {
    const result = buildReactionLine(
      "interested",
      { tags: ["illust"] },
      "책방나비",
      [node("illust", 0.1, "일러스트")],
      t,
    );
    expect(result).toBe(
      t("companion.reactInterestedTentative", {
        booth: "책방나비",
        theme: "일러스트",
      }),
    );
  });

  it("interested, 매칭 confidence>=0.25 → confident", () => {
    const result = buildReactionLine(
      "interested",
      { tags: ["illust"] },
      "책방나비",
      [node("illust", 0.4, "일러스트")],
      t,
    );
    expect(result).toBe(
      t("companion.reactInterestedConfident", {
        booth: "책방나비",
        theme: "일러스트",
      }),
    );
  });

  it("skip, 확신 분야(>=0.25) → 헤지된 문장", () => {
    const result = buildReactionLine(
      "skip",
      { tags: ["illust"] },
      "책방나비",
      [node("illust", 0.5, "일러스트")],
      t,
    );
    expect(result).toBe(
      t("companion.reactSkipConfident", { booth: "책방나비", theme: "일러스트" }),
    );
  });

  it("skip, 매칭 있어도 confidence<0.25 → 기존 문장(단정 안 함)", () => {
    const result = buildReactionLine(
      "skip",
      { tags: ["illust"] },
      "책방나비",
      [node("illust", 0.1, "일러스트")],
      t,
    );
    expect(result).toBe(t("companion.reactSkip", { booth: "책방나비" }));
  });

  it("skip, 매칭 없음 → 기존 문장", () => {
    const result = buildReactionLine(
      "skip",
      { tags: ["illust"] },
      "책방나비",
      [],
      t,
    );
    expect(result).toBe(t("companion.reactSkip", { booth: "책방나비" }));
  });

  it("later는 확신 분야가 있어도 분야 언급 없이 기존 문장(판정 가중치가 약함)", () => {
    const result = buildReactionLine(
      "later",
      { tags: ["illust"] },
      "책방나비",
      [node("illust", 0.9, "일러스트")],
      t,
    );
    expect(result).toBe(t("companion.reactLater", { booth: "책방나비" }));
  });

  it("seen은 항상 기존 문장", () => {
    const result = buildReactionLine(
      "seen",
      { tags: ["illust"] },
      "책방나비",
      [node("illust", 0.9, "일러스트")],
      t,
    );
    expect(result).toBe(t("companion.reactSeen", { booth: "책방나비" }));
  });

  it("여러 분야가 매칭되면 confidence 최고(정렬상 첫 매치)를 말한다", () => {
    const result = buildReactionLine(
      "interested",
      { tags: ["illust", "photobook"] },
      "책방나비",
      [node("illust", 0.6, "일러스트"), node("photobook", 0.3, "포토북")],
      t,
    );
    expect(result).toBe(
      t("companion.reactInterestedConfident", {
        booth: "책방나비",
        theme: "일러스트",
      }),
    );
  });

  it("부스 이름이 없으면 Plain 판본으로 자연 degrade", () => {
    const result = buildReactionLine(
      "interested",
      { tags: ["illust"] },
      undefined,
      [node("illust", 0.4, "일러스트")],
      t,
    );
    expect(result).toBe(
      t("companion.reactInterestedConfidentPlain", { theme: "일러스트" }),
    );
  });
});
```

- [ ] **Step 2: 테스트 실행 → 실패 확인**

Run: `npx vitest run src/lib/companion/reaction-line.test.ts`
Expected: FAIL — `Cannot find module '@/lib/companion/reaction-line'`

- [ ] **Step 3: 구현**

`src/lib/companion/reaction-line.ts` 새로 작성:

```ts
// 반응 즉답 — 부스 분야(booth.tags) + 브레인 누적 확신도로 톤을 조절한다. 순수·LLM 없음.
//
// interested/skip만 분야 매칭을 탄다. later는 판정 가중치가 interested의 0.3배라
// (taste.ts judgmentScore) "확실히 좋아하는구나" 톤을 쓰면 신호보다 말이 앞선다.
// skip은 확신 분야(confidence>=0.25)에서만 분야를 말하고, 그마저도 "안에서도 다는
// 아니다"로 헤지한다 — 부스 하나 뺀 걸 분야 전체 부정으로 말하면 과장이다
// (reaction-bar.tsx의 기존 교훈을 분야 축에서도 반복하지 않는다).
//
// 추상 가치 이름(발견·경험·휴식…)은 절대 말하지 않는다 — booth.tags(카테고리 slug,
// 항상 채워짐)로만 매칭한다. enrichment.themeTags/valueTags(저작 필드, 커버리지
// 16~66%)는 안 쓴다.
import type { Booth, InterestNode } from "@/lib/types";
import type { TFn } from "@/lib/i18n/resolve";

export type ReactionKey = "interested" | "later" | "skip" | "seen";

/** curate.ts·taste.ts와 같은 확신 임계값. */
const CONFIDENT_THRESHOLD = 0.25;

const BASE_KEY: Record<ReactionKey, string> = {
  interested: "reactInterested",
  later: "reactLater",
  skip: "reactSkip",
  seen: "reactSeen",
};

export function buildReactionLine(
  key: ReactionKey,
  booth: Pick<Booth, "tags">,
  boothName: string | undefined,
  interests: InterestNode[],
  t: TFn,
): string {
  if (key === "later" || key === "seen") {
    return line(BASE_KEY[key], boothName, t);
  }

  // interests는 confidence 내림차순(distill.ts)이라 첫 매치가 곧 최고 확신 분야.
  const match = interests.find((n) => booth.tags.includes(n.key));

  if (key === "interested") {
    if (!match) return line(BASE_KEY.interested, boothName, t);
    const tier =
      match.confidence >= CONFIDENT_THRESHOLD
        ? "reactInterestedConfident"
        : "reactInterestedTentative";
    return line(tier, boothName, t, match.label);
  }

  // key === "skip" — 확신 분야에서만, 헤지된 문장으로.
  if (match && match.confidence >= CONFIDENT_THRESHOLD) {
    return line("reactSkipConfident", boothName, t, match.label);
  }
  return line(BASE_KEY.skip, boothName, t);
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

- [ ] **Step 4: 테스트 실행 → 통과 확인**

Run: `npx vitest run src/lib/companion/reaction-line.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 커밋**

```bash
git add src/lib/companion/reaction-line.ts src/lib/companion/reaction-line.test.ts
git commit -m "feat(companion): 분야 매칭 반응 즉답 순수 함수 + 테스트"
```

---

### Task 4: `reaction-bar.tsx`가 새 함수를 쓰도록 교체

**Files:**
- Modify: `src/components/feed/reaction-bar.tsx`
- Modify: `src/components/map/map-view.tsx:327`
- Modify: `src/components/feed/interest-feed.tsx:239`

**Interfaces:**
- Consumes: `buildReactionLine`(Task 3), `useCompanionStore((s) => s.interests)`(Task 1)
- Produces: `<ReactionBar boothId boothName boothTags />` — `boothTags: string[]` prop
  신규 추가(기존 `boothId`/`boothName`은 그대로 유지).

- [ ] **Step 1: `reaction-bar.tsx`에서 로컬 `reactionLine()`을 새 모듈로 교체**

`src/components/feed/reaction-bar.tsx` 전체를 아래로 교체:

```tsx
"use client";

import { Check, Clock3, Heart, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { useVisitStore, pushNote, type BoothStatus } from "@/lib/stores/visit";
import { useCompanionStore } from "@/lib/stores/companion";
import { useT } from "@/lib/i18n/provider";
import { buildReactionLine, type ReactionKey } from "@/lib/companion/reaction-line";

/**
 * 부스 반응 버튼(끌림/나중에/별로/이미봄). 스스로 갈지 말지 판단한 결과를 상태로 남기면
 * 지도 부스 색이 칠해지고(초록=가봄, 노랑=끌림), 서버가 그 상태 변화를 신호로 적재해
 * 브레인에 반영한다. companion-reframe §7.5 — 명령이 아니라 사용자의 반응을 받는다.
 */
const REACTIONS: {
  key: ReactionKey;
  status: BoothStatus;
  Icon: typeof Heart;
}[] = [
  { key: "interested", status: "interested", Icon: Heart },
  { key: "later", status: "later", Icon: Clock3 },
  { key: "skip", status: "skipped", Icon: X },
  { key: "seen", status: "visited", Icon: Check },
];

/** 저장된 상태 → 초기 선택 버튼 키. */
function keyForStatus(s: BoothStatus | undefined): string | null {
  if (s === "visited") return "seen";
  if (s === "skipped") return "skip";
  if (s === "interested") return "interested";
  if (s === "later") return "later";
  return null;
}

export function ReactionBar({
  boothId,
  boothName,
  boothTags,
}: {
  boothId: string;
  /** 로미가 이 부스를 이름으로 부르게 한다. 없으면 이름 없는 판본으로 떨어진다. */
  boothName?: string;
  /** 분야 slug(카테고리 tags) — 반응 즉답이 브레인 관심 분야와 매칭하는 데 쓴다
   *  (reaction-line.ts). 없으면 매칭 없이 기존 문장으로 떨어진다. */
  boothTags: string[];
}) {
  const t = useT();
  const storeStatus = useVisitStore((s) => s.records[boothId]?.status);
  const setStatus = useVisitStore((s) => s.setStatus);
  const say = useCompanionStore((s) => s.say);
  const setTaste = useCompanionStore((s) => s.setTaste);
  const interests = useCompanionStore((s) => s.interests);
  // 눌린 버튼은 스토어에서 파생한다 — 복사본을 두면 부스가 바뀌어도 앞 부스의 상태가
  // 남아, 실제로는 아무 반응도 없는 부스에 버튼이 눌린 채로 보인다(지도에서 부스를
  // 옮겨 다닐 때 실제로 그랬다). 진실은 visitStore 한 곳뿐이다.
  const picked = keyForStatus(storeStatus);

  function react(r: (typeof REACTIONS)[number]) {
    const isSame = picked === r.key;
    setStatus(boothId, isSame ? null : r.status);
    if (!isSame) {
      // 로미 즉답 — 취소가 아니라 새 반응일 때만. 내 행동에 바로 반응한다는 느낌.
      say(buildReactionLine(r.key, { tags: boothTags }, boothName, interests, t));
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

  return (
    <div className="flex gap-1.5">
      {REACTIONS.map((r) => (
        <button
          key={r.key}
          type="button"
          onClick={() => react(r)}
          aria-pressed={picked === r.key}
          className={cn(
            "flex flex-1 items-center justify-center gap-1 rounded-lg border py-1.5 text-xs font-semibold active:opacity-70",
            picked === r.key
              ? "border-primary bg-accent/60 text-primary"
              : "border-border text-muted-foreground",
          )}
        >
          <r.Icon className="size-3.5" aria-hidden />
          {t(`reaction.${r.key}`)}
        </button>
      ))}
    </div>
  );
}
```

(`TFn` import와 `reactionLine()` 함수는 제거됐다 — `useT()`의 반환 타입을 그대로
`buildReactionLine`에 넘기므로 더 필요 없다.)

- [ ] **Step 2: 지도 호출부에 `boothTags` 전달**

`src/components/map/map-view.tsx:327`, 기존:

```tsx
              <ReactionBar boothId={selected.id} boothName={selected.name} />
```

교체:

```tsx
              <ReactionBar
                boothId={selected.id}
                boothName={selected.name}
                boothTags={selected.tags}
              />
```

- [ ] **Step 3: 피드 호출부에 `boothTags` 전달**

`src/components/feed/interest-feed.tsx:239`, 기존:

```tsx
                <ReactionBar boothId={booth.id} boothName={booth.name} />
```

교체:

```tsx
                <ReactionBar
                  boothId={booth.id}
                  boothName={booth.name}
                  boothTags={booth.tags}
                />
```

- [ ] **Step 4: 타입체크 + 전체 테스트**

Run: `npx tsc --noEmit && npx vitest run`
Expected: 에러 없음, 전체 테스트 통과(기존 208개 + 신규 11개)

- [ ] **Step 5: 커밋**

```bash
git add src/components/feed/reaction-bar.tsx src/components/map/map-view.tsx src/components/feed/interest-feed.tsx
git commit -m "feat(companion): 반응 즉답이 부스 분야를 매칭해 톤을 조절하게"
```

---

### Task 5: 로미 아이콘 추출 + 지도 반응 토스트에 부착

**Files:**
- Create: `src/components/companion/roam-avatar.tsx`
- Modify: `src/components/companion/companion-bar.tsx`
- Modify: `src/components/map/map-view.tsx`

**Interfaces:**
- Produces: `<RoamAvatar className? />` — `companion-bar.tsx`와 `map-view.tsx` 양쪽이
  임포트해 쓴다.

- [ ] **Step 1: `RoamAvatar`를 별도 파일로 추출**

`src/components/companion/roam-avatar.tsx` 새로 작성:

```tsx
import Image from "next/image";
import { cn } from "@/lib/utils";

/** 정적 로미 로고 아바타 — 상주 필·반응 토스트 등 작은 자리에서 재사용한다. */
export function RoamAvatar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-full ring-1 ring-border",
        className,
      )}
    >
      <Image
        src="/logo.svg"
        alt="Roam"
        width={32}
        height={32}
        className="size-full object-cover"
        unoptimized
      />
    </span>
  );
}
```

- [ ] **Step 2: `companion-bar.tsx`에서 로컬 정의 제거, 새 파일에서 임포트**

`src/components/companion/companion-bar.tsx` 상단 import에서 `Image` 임포트 줄
(`import Image from "next/image";`)을 지우고, 아래 줄을 추가:

```tsx
import { RoamAvatar } from "@/components/companion/roam-avatar";
```

파일 하단의 `function RoamAvatar() { ... }` 정의 전체(기존 144-157줄)를 삭제한다.

- [ ] **Step 3: 지도 반응 토스트에 아이콘 부착**

`src/components/map/map-view.tsx` 상단 import에 추가:

```tsx
import { RoamAvatar } from "@/components/companion/roam-avatar";
```

같은 파일의 flash 구독 effect(기존 65-74줄 근처), 기존:

```tsx
  const flash = useCompanionStore((s) => s.flash);
  const clearFlash = useCompanionStore((s) => s.clearFlash);
  useEffect(() => {
    if (!flash) return;
    toast(flash);
    clearFlash();
  }, [flash, clearFlash]);
```

교체:

```tsx
  const flash = useCompanionStore((s) => s.flash);
  const clearFlash = useCompanionStore((s) => s.clearFlash);
  useEffect(() => {
    if (!flash) return;
    toast(flash, { icon: <RoamAvatar className="size-5" /> });
    clearFlash();
  }, [flash, clearFlash]);
```

- [ ] **Step 4: 타입체크 + lint + 전체 테스트**

Run: `npx tsc --noEmit && npx eslint src/components/companion/roam-avatar.tsx src/components/companion/companion-bar.tsx src/components/map/map-view.tsx && npx vitest run`
Expected: 에러 없음, 전체 테스트 통과

- [ ] **Step 5: 커밋**

```bash
git add src/components/companion/roam-avatar.tsx src/components/companion/companion-bar.tsx src/components/map/map-view.tsx
git commit -m "refactor(companion): RoamAvatar 추출 + 지도 반응 토스트에 부착"
```

---

## 최종 검증 (전체 태스크 완료 후)

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/companion src/lib/stores/companion.ts src/components/companion src/components/map/map-view.tsx src/components/feed/reaction-bar.tsx src/components/feed/interest-feed.tsx "src/app/(visitor)/exhibitions/[slug]/page.tsx" src/lib/i18n/dictionaries.ts
```

수동 확인(코드 변경 아님, 눈으로 1회):
- 지도 진입 시 로딩 화면에 로미 걷는 영상이 실제로 뜨는지(`loading-screen.tsx`는
  이미 구현돼 있음 — 라우터 캐시로 순간 이동하면 안 뜰 수 있어 확인만).
- 전시 홈에서 관심 있는 분야 부스에 여러 번 반응 → 지도에서 그 분야 부스에 반응 시
  문장이 "관심 있나 봐" → "확실히 좋아하는구나"로 바뀌는지.
- 반응 토스트에 로미 아이콘이 붙어 나오는지.
