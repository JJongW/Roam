# 계획 B — 취향 레이더 · 모바일 확대 버그 · 로미 잘림

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 브레인 시트의 취향 시각화를 8축 레이더로 바꾸고 관심 제거를 가능하게 하며, 폰에서 지도 메모를 누를 때 화면이 확대돼 갇히는 버그와 로미 영상이 잘리는 문제를 고친다.

**Architecture:** 세 갈래가 서로 독립이다. (a) 로미·확대는 클래스 한 줄씩의 국소 수정 + 회귀 테스트. (b) 레이더는 좌표 계산(순수 모듈) → SVG 컴포넌트 → 브레인 시트 교체 순으로 아래에서 위로 쌓는다. (c) 관심 제거는 append-only 신호 원장을 건드리지 않고 `UserBrain` 안의 `mutedSlugs`로 표현한다 — 브레인은 `user_brain.data` JSONB 통째로 저장되므로 **마이그레이션이 필요 없다**.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · Tailwind v4 · vitest + jsdom + @testing-library/react

## Global Constraints

- 스펙: `docs/decisions/2026-08-11_taste-radar-map-sheet-zoom.md`. 이 계획은 §1·§2·§2-4만 다룬다. **§3(지도 하단 시트 재구성)은 계획 A(judgment-vocabulary)에 묶여 있으므로 손대지 않는다.**
- 확신 임계값은 **0.25** — `taste.ts`·`curate.ts`·`reaction-line.ts`가 쓰는 값과 같아야 한다.
- 가치 축은 `src/lib/values/index.ts`의 `VALUE_TAGS` **정의 순서 8개 고정**: `discovery` 발견 · `experience` 체험 · `goods` 굿즈 · `social` 소통 · `learning` 학습 · `trend` 트렌드 · `inspiration` 영감 · `rest` 가볍게.
- 새 npm 의존성을 추가하지 않는다. 차트는 순수 SVG.
- 검증 3종은 매 태스크 끝에 돌린다: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.
- 주석은 한국어, **무엇을 하는지가 아니라 왜 그런지**를 쓴다(레포 관례).
- `ValueMindMap`(`src/components/me/value-mindmap.tsx`)은 **삭제하지 않는다** — `onboarding-result.tsx`가 계속 쓴다.

---

### Task 1: 로미 영상이 잘리지 않게

`headbunting.webm`은 478×620 세로형인데 감싸는 박스는 `size-32` 정사각형이다. `object-cover`가 박스를 채우려 스케일을 키워 세로 38px을 잘라낸다 — 머리와 발이 날아간다. `poster="/logo.svg"`도 같이 잘린다.

**Files:**
- Modify: `src/components/companion/roam-motion.tsx:61`
- Test: `src/components/companion/roam-motion.test.tsx` (신규)

**Interfaces:**
- Consumes: 없음
- Produces: `RoamMotion`의 기본 object-fit이 `contain`. 호출부 시그니처는 그대로(`src?`, `pool?`, `className?`).

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/companion/roam-motion.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { RoamMotion } from "./roam-motion";

// 로미는 자르지 않는다. 영상들이 정사각형이 아니라(headbunting 478×620) object-cover를
// 쓰면 정사각 박스에서 머리·발이 잘린다. poster(logo.svg)도 같은 규칙으로 잘린다.
describe("RoamMotion", () => {
  it("영상을 자르지 않는다 — object-contain", () => {
    const { container } = render(<RoamMotion src="/headbunting.webm" />);
    const video = container.querySelector("video");
    expect(video).not.toBeNull();
    expect(video!.className).toContain("object-contain");
    expect(video!.className).not.toContain("object-cover");
  });

  it("className으로 덮어쓸 수 있다 — 잘라야 할 자리는 opt-in", () => {
    const { container } = render(
      <RoamMotion src="/headbunting.webm" className="object-cover" />,
    );
    expect(container.querySelector("video")!.className).toContain(
      "object-cover",
    );
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/companion/roam-motion.test.tsx`
Expected: FAIL — 첫 테스트에서 `object-cover`가 들어 있어 `toContain("object-contain")`이 깨진다.

- [ ] **Step 3: 구현**

`src/components/companion/roam-motion.tsx`의 `className` 한 줄을 바꾼다. 기존:

```tsx
      className={cn("size-full object-cover", className)}
```

새로:

```tsx
      // object-contain — 로미는 자르지 않는다. 영상이 정사각형이 아니라서
      // (headbunting 478×620) cover를 쓰면 정사각 박스에서 머리·발이 잘린다.
      // 아바타처럼 꽉 채워야 하는 자리가 생기면 className으로 opt-in 한다.
      className={cn("size-full object-contain", className)}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/companion/roam-motion.test.tsx`
Expected: PASS (2 tests)

- [ ] **Step 5: 눈으로 확인**

```bash
npx next dev -p 3120
```

브라우저에서 `http://localhost:3120/` 열고 히어로의 로미가 **머리부터 발까지 다 보이는지** 확인. 서버는 확인 후 종료.

- [ ] **Step 6: 검증 + 커밋**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/components/companion/roam-motion.tsx src/components/companion/roam-motion.test.tsx
git add src/components/companion/roam-motion.tsx src/components/companion/roam-motion.test.tsx
git commit -m "fix(companion): 로미 영상이 잘리지 않게 object-contain

headbunting.webm이 478×620 세로형인데 size-32 정사각 박스에 object-cover로
들어가 세로 38px이 잘렸다 — 머리와 발이 날아갔다. poster로 쓰는 logo.svg도
같이 잘려 영상 로드 전 로고까지 이상해 보였다. rounded-full 아바타 자리
(브레인·회고 시트)도 전부 같은 문제였다.

규칙은 하나 — 로미는 자르지 않는다. 꽉 채워야 할 자리가 생기면 className으로
opt-in 한다."
```

---

### Task 2: 지도 메모 입력 16px — iOS 자동 확대 차단

iOS Safari는 **16px 미만 입력창에 포커스가 가면 페이지를 자동 확대**한다. 지도 메모 입력만 기본 `Input`의 `text-base`(16px)를 `text-sm`(14px)로 덮고 있다. 앱 전체에서 16px 미만이 걸린 입력은 여기 하나뿐이다.

**Files:**
- Modify: `src/components/map/map-view.tsx` (`BoothPopupMemo`의 `<Input className="h-9 pl-8 text-sm" />`)
- Test: `src/components/map/map-input-font.test.ts` (신규)

**Interfaces:**
- Consumes: 없음
- Produces: 없음(내부 수정). 다음 태스크와 무관.

- [ ] **Step 1: 실패하는 테스트 작성**

이 버그는 눈으로 안 보이고 폰에서만 드러나므로 **소스를 직접 검사**한다. 렌더 테스트로는 "왜 14px이면 안 되는지"가 드러나지 않는다.

`src/components/map/map-input-font.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// iOS Safari는 폰트가 16px 미만인 입력창에 포커스가 가면 페이지를 자동 확대한다.
// 지도는 touch-action:none + gesturestart preventDefault로 핀치를 삼키므로,
// 한번 확대되면 두 손가락으로 오므려도 빠져나올 수 없다. 그래서 지도 화면의
// 입력에는 16px 미만 클래스를 절대 붙이면 안 된다.
//
// 렌더 테스트가 아니라 소스 검사인 이유: 이 실수는 데스크톱 브라우저에서 전혀
// 드러나지 않아 리뷰와 수동 QA를 그냥 통과한다. 클래스 문자열을 직접 막는 게
// 유일하게 확실한 방어다.
const SMALL_TEXT = /\btext-(xs|sm)\b/;

describe("지도 화면 입력 폰트", () => {
  it("map-view.tsx의 Input에 16px 미만 클래스가 없다", () => {
    const src = readFileSync("src/components/map/map-view.tsx", "utf8");
    // <Input ... /> 블록만 추출해 검사한다.
    const inputs = src.match(/<Input[\s\S]*?\/>/g) ?? [];
    expect(inputs.length).toBeGreaterThan(0);
    for (const block of inputs) {
      expect(SMALL_TEXT.test(block)).toBe(false);
    }
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/map/map-input-font.test.ts`
Expected: FAIL — `text-sm`이 들어 있어 `expect(...).toBe(false)`가 깨진다.

- [ ] **Step 3: 구현**

`src/components/map/map-view.tsx`의 `BoothPopupMemo` 안 `<Input>`에서 `text-sm`을 뺀다. 기존:

```tsx
          className="h-9 pl-8 text-sm"
```

새로 (높이도 함께 올린다 — 16px 글자가 `h-9`(36px)에 들어가면 위아래가 답답하다):

```tsx
          // text-sm을 쓰지 않는다 — iOS는 16px 미만 입력에 포커스가 가면 페이지를
          // 자동 확대하고, 지도는 핀치를 삼키므로 거기서 빠져나올 수 없다.
          // 기본 Input이 이미 text-base(16px)라 크기 클래스를 얹지 않는다.
          className="h-10 pl-8"
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/map/map-input-font.test.ts`
Expected: PASS (1 test)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/components/map/map-view.tsx src/components/map/map-input-font.test.ts
git add src/components/map/map-view.tsx src/components/map/map-input-font.test.ts
git commit -m "fix(map): 메모 입력 16px — iOS 자동 확대의 근본 원인 제거

폰에서 지도 메모를 누르면 화면 전체가 확대되고, 두 손가락으로 오므려도
축소되지 않아 갇혔다.

원인 두 겹 중 첫 번째다. iOS Safari는 16px 미만 입력창에 포커스가 가면
페이지를 자동 확대하는데, 이 입력만 기본 Input의 text-base(16px)를
text-sm(14px)로 덮고 있었다(앱 전체에서 여기 하나뿐). 두 번째 겹은
지도가 touch-action:none + gesturestart preventDefault로 핀치를 삼켜
확대 상태에서 빠져나올 수 없던 것 — 확대 자체가 안 일어나면 그 경로에
들어가지 않는다.

이 실수는 데스크톱에서 전혀 드러나지 않아 리뷰를 그냥 통과한다.
클래스 문자열을 직접 막는 회귀 테스트를 같이 둔다."
```

---

### Task 3: `UserBrain.mutedSlugs` — 관심 제거를 표현하는 자리

브레인은 append-only 신호 원장에서 증류되므로 신호를 지울 수 없다. 음의 신호는 confidence를 낮출 뿐 0이 안 되고, 전체 목록 멱등 쓰기는 하나 추가하려다 나머지를 부정하게 된다. 그래서 **명시적 뮤트**를 쓴다 — 원장은 그대로 두고 표시·추천에서만 뺀다.

`user_brain`은 `data` JSONB 한 칼럼에 브레인을 통째로 넣으므로 **마이그레이션이 필요 없다**.

**Files:**
- Modify: `src/lib/types/index.ts` (`UserBrain`에 필드 추가)
- Modify: `src/lib/memory/distill.ts` (`emptyBrain`, `updateBrainWithSignals`)
- Test: `src/lib/memory/distill.test.ts` (기존 파일에 추가)

**Interfaces:**
- Consumes: 없음
- Produces:
  - `UserBrain.mutedSlugs: string[]` — 사용자가 끈 가치 slug. 없던 브레인(레거시 행)에서는 `undefined`일 수 있으므로 읽는 쪽이 `?? []`로 받는다.
  - `updateBrainWithSignals(brain, allSignals, nowMs, tuning?, labels?)` — 시그니처 불변. 반환 브레인의 `interests`에서 뮤트된 slug가 빠진다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/memory/distill.test.ts` 맨 아래에 붙인다:

```ts
describe("mutedSlugs", () => {
  // 사용자의 "이건 내 취향 아니야"는 과거 행동의 부정이 아니라 현재 상태 선언이다.
  // 원장(신호)은 그대로 두고 표시·추천에서만 뺀다 — 그래야 되돌리기가 자연스럽다.
  const signals: UserSignal[] = [
    {
      id: "s1",
      userId: "u1",
      exhibitionId: "e1",
      kind: "reaction_interested",
      slugs: ["goods"],
      createdAt: new Date(0).toISOString(),
    },
    {
      id: "s2",
      userId: "u1",
      exhibitionId: "e1",
      kind: "reaction_interested",
      slugs: ["discovery"],
      createdAt: new Date(0).toISOString(),
    },
  ];

  it("emptyBrain은 뮤트 목록이 빈 배열", () => {
    expect(emptyBrain("u1").mutedSlugs).toEqual([]);
  });

  it("뮤트된 slug는 interests에서 빠진다", () => {
    const base = { ...emptyBrain("u1"), mutedSlugs: ["goods"] };
    const next = updateBrainWithSignals(base, signals, 0);
    const keys = next.interests.map((n) => n.key);
    expect(keys).toContain("discovery");
    expect(keys).not.toContain("goods");
  });

  it("뮤트를 풀면 그동안 쌓인 confidence가 그대로 돌아온다", () => {
    const muted = updateBrainWithSignals(
      { ...emptyBrain("u1"), mutedSlugs: ["goods"] },
      signals,
      0,
    );
    const unmuted = updateBrainWithSignals(
      { ...muted, mutedSlugs: [] },
      signals,
      0,
    );
    const goods = unmuted.interests.find((n) => n.key === "goods");
    expect(goods).toBeDefined();
    expect(goods!.confidence).toBeGreaterThan(0);
  });

  it("뮤트 목록은 재증류를 거쳐도 유지된다", () => {
    const next = updateBrainWithSignals(
      { ...emptyBrain("u1"), mutedSlugs: ["goods"] },
      signals,
      0,
    );
    expect(next.mutedSlugs).toEqual(["goods"]);
  });

  it("레거시 브레인(mutedSlugs 없음)도 깨지지 않는다", () => {
    const legacy = { ...emptyBrain("u1") } as UserBrain;
    delete (legacy as Partial<UserBrain>).mutedSlugs;
    const next = updateBrainWithSignals(legacy, signals, 0);
    expect(next.interests.map((n) => n.key)).toContain("goods");
  });
});
```

`distill.test.ts` 상단 import에 `UserSignal`·`UserBrain` 타입과 `emptyBrain`이 없으면 추가한다:

```ts
import { emptyBrain, updateBrainWithSignals } from "./distill";
import type { UserBrain, UserSignal } from "@/lib/types";
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/memory/distill.test.ts`
Expected: FAIL — `mutedSlugs`가 타입에도 구현에도 없어 컴파일/단언이 깨진다.

- [ ] **Step 3: 타입 추가**

`src/lib/types/index.ts`의 `UserBrain`에서 `interests` 바로 아래에 넣는다:

```ts
  interests: InterestNode[]; // top-N만 유지(증류)
  /**
   * 사용자가 "이건 내 취향 아니야"라고 끈 가치 slug.
   *
   * 브레인은 append-only 신호 원장에서 증류되므로 신호를 지울 수 없다. 음의 신호는
   * confidence를 낮출 뿐 0이 안 되고, 전체 목록 멱등 쓰기는 하나 추가하려다 나머지를
   * 부정하게 된다. 그래서 원장은 그대로 두고 여기에만 기록한다 — 끄는 것은 과거
   * 행동의 부정이 아니라 현재 상태 선언이고, 풀면 그동안의 confidence가 그대로 돌아온다.
   *
   * 레거시 행(이 필드 이전에 저장된 브레인)엔 없을 수 있다 — 읽는 쪽이 `?? []`로 받는다.
   */
  mutedSlugs?: string[];
```

- [ ] **Step 4: `emptyBrain`에 기본값**

`src/lib/memory/distill.ts`의 `emptyBrain` 반환 객체에서 `interests: []` 아래에 추가:

```ts
    interests: [],
    mutedSlugs: [],
```

- [ ] **Step 5: 증류에서 뮤트 제외**

`src/lib/memory/distill.ts`의 `updateBrainWithSignals` 안, `distillInterests` 호출 바로 뒤에 넣는다. 기존:

```ts
  const interests = distillInterests(allSignals, nowMs, tuning, labels);
```

새로:

```ts
  // 뮤트된 가치는 증류 결과에서 뺀다. 신호는 그대로 두므로(원장 불변) 뮤트를 풀면
  // 그동안 쌓인 confidence가 그대로 돌아온다.
  const muted = new Set(brain.mutedSlugs ?? []);
  const interests = distillInterests(allSignals, nowMs, tuning, labels).filter(
    (n) => !muted.has(n.key),
  );
```

그리고 같은 함수의 반환 객체에 `mutedSlugs`를 명시해 재증류를 거쳐도 유지되게 한다. 반환 객체의 `...brain` 뒤 어딘가에:

```ts
    mutedSlugs: brain.mutedSlugs ?? [],
```

- [ ] **Step 6: 통과 확인**

Run: `npx vitest run src/lib/memory/distill.test.ts`
Expected: PASS (기존 테스트 + 새 5개)

- [ ] **Step 7: 검증 + 커밋**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/lib/types/index.ts src/lib/memory/distill.ts src/lib/memory/distill.test.ts
git add src/lib/types/index.ts src/lib/memory/distill.ts src/lib/memory/distill.test.ts
git commit -m "feat(memory): UserBrain.mutedSlugs — 관심 제거를 표현할 자리

브레인은 append-only 신호 원장에서 증류되므로 신호를 지울 수 없다. 그래서
'관심 삭제'가 구조적으로 표현이 안 됐고, 브레인 시트의 관심 고치기에도
추가만 있고 삭제가 없었다.

음의 신호는 confidence를 낮출 뿐 0이 안 돼서 '안 지워졌다'고 느껴지고,
전체 목록 멱등 쓰기는 하나 추가하려다 나머지 7개를 부정하게 된다. 명시적
뮤트가 사용자 의도와 1:1이다 — 끄는 것은 과거 행동의 부정이 아니라 현재
상태 선언이고, 풀면 그동안의 confidence가 그대로 돌아온다.

user_brain은 data JSONB 한 칼럼이라 마이그레이션이 필요 없다."
```

---

### Task 4: 뮤트 토글 서비스 + `PUT /api/me/values/[slug]`

**Files:**
- Modify: `src/lib/memory/service.ts` (`setValueMuted` 추가)
- Create: `src/app/api/me/values/[slug]/route.ts`
- Test: `src/lib/memory/service-mute.test.ts` (신규)

**Interfaces:**
- Consumes: `UserBrain.mutedSlugs`(Task 3), `readBrain(userId): Promise<UserBrain>`(기존, `service.ts`)
- Produces:
  - `setValueMuted(userId: string, slug: string, muted: boolean): Promise<UserBrain>` — 갱신된 브레인을 반환
  - `PUT /api/me/values/[slug]` body `{ muted: boolean }` → `204 No Content`. 8가치 밖 slug는 `400 VALIDATION`, 비로그인은 `401 UNAUTHORIZED`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/memory/service-mute.test.ts`:

```ts
import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository, resetStore } from "@/lib/mock/repository";
import { setValueMuted } from "@/lib/memory/service";

// 뮤트는 멱등이어야 한다 — 같은 요청을 두 번 보내도 목록이 중복되면 안 된다.
// 그리고 순서에 의존하면 안 된다(같은 집합이면 같은 결과).
describe("setValueMuted", () => {
  const repo = new MockRepository();
  let userId: string;

  beforeEach(async () => {
    resetStore();
    const user = await repo.createUser("tester");
    userId = user.id;
  });

  it("끄면 목록에 들어간다", async () => {
    const brain = await setValueMuted(userId, "goods", true);
    expect(brain.mutedSlugs).toContain("goods");
  });

  it("두 번 꺼도 중복되지 않는다 — 멱등", async () => {
    await setValueMuted(userId, "goods", true);
    const brain = await setValueMuted(userId, "goods", true);
    expect(brain.mutedSlugs!.filter((s) => s === "goods")).toHaveLength(1);
  });

  it("풀면 목록에서 빠진다", async () => {
    await setValueMuted(userId, "goods", true);
    const brain = await setValueMuted(userId, "goods", false);
    expect(brain.mutedSlugs).not.toContain("goods");
  });

  it("끈 적 없는 걸 풀어도 조용히 성공한다", async () => {
    const brain = await setValueMuted(userId, "goods", false);
    expect(brain.mutedSlugs).toEqual([]);
  });

  it("다른 가치를 건드리지 않는다", async () => {
    await setValueMuted(userId, "goods", true);
    const brain = await setValueMuted(userId, "trend", true);
    expect(brain.mutedSlugs).toEqual(expect.arrayContaining(["goods", "trend"]));
    expect(brain.mutedSlugs).toHaveLength(2);
  });
});
```

> `MockRepository`·`resetStore`의 정확한 export 이름은 `src/lib/mock/repository.test.ts`가 쓰는 것을 그대로 따른다. 다르면 그 파일 상단 import를 복사해 맞춘다.

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/memory/service-mute.test.ts`
Expected: FAIL — `setValueMuted`가 없다.

- [ ] **Step 3: 서비스 구현**

`src/lib/memory/service.ts`에 추가한다(`readBrain` 근처):

```ts
/**
 * 가치 하나를 끄거나 켠다. 멱등 — 같은 요청을 반복해도 목록이 중복되지 않는다.
 *
 * 신호 원장은 건드리지 않는다. 끄는 것은 과거 행동의 부정이 아니라 현재 상태
 * 선언이므로, 풀면 그동안 쌓인 confidence가 그대로 돌아온다(distill.ts).
 */
export async function setValueMuted(
  userId: string,
  slug: string,
  muted: boolean,
): Promise<UserBrain> {
  const repo = await getRepository();
  const brain = await readBrain(userId);
  const current = new Set(brain.mutedSlugs ?? []);
  if (muted) current.add(slug);
  else current.delete(slug);

  // 뮤트가 바뀌면 interests를 다시 걸러야 하므로 재증류한다 — 목록만 갈아끼우면
  // 방금 끈 가치가 interests에 그대로 남는다.
  const signals = await repo.listUserSignals(userId, {});
  const next = updateBrainWithSignals(
    { ...brain, mutedSlugs: [...current] },
    signals,
    Date.now(),
  );
  await repo.saveUserBrain(next);
  return next;
}
```

`service.ts` 상단 import에 `updateBrainWithSignals`가 이미 있는지 확인하고, 없으면 `./distill`에서 가져온다. `UserBrain` 타입 import도 필요하다.

> `listUserSignals(userId, {})`의 두 번째 인자 형태는 `service.ts`의 `reflectFromSignals`가 쓰는 호출을 그대로 따른다(거기선 `{ exhibitionId }`를 넘긴다). 전체 신호가 필요하므로 필터 없이 부른다.

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/memory/service-mute.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: API 라우트 작성**

`src/app/api/me/values/[slug]/route.ts`:

```ts
import { z } from "zod";
import { fail, noContent, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { setValueMuted } from "@/lib/memory/service";
import { VALUE_SLUGS } from "@/lib/values";

type Ctx = { params: Promise<{ slug: string }> };

const schema = z.object({ muted: z.boolean() });

/**
 * 가치 하나를 끄거나 켠다(브레인 시트의 "관심 고치기").
 *
 * POST /api/me/values(추가)와 짝이다. 추가는 명시 긍정 신호를 남기고, 이쪽은
 * 신호를 건드리지 않고 표시에서만 뺀다 — 원장은 append-only라 지울 수 없고,
 * 끄는 것은 과거 행동의 부정이 아니라 현재 상태 선언이기 때문이다.
 *
 * PUT인 이유: 멱등하다. 같은 요청을 두 번 보내도 결과가 같다.
 */
export async function PUT(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { slug } = await params;
  if (!VALUE_SLUGS.includes(slug)) {
    return fail("VALIDATION", "알 수 없는 관심이에요");
  }
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;

  await setValueMuted(user.id, slug, parsed.data.muted);
  return noContent();
}
```

- [ ] **Step 6: 검증 + 커밋**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/lib/memory/service.ts src/lib/memory/service-mute.test.ts "src/app/api/me/values/[slug]/route.ts"
git add src/lib/memory/service.ts src/lib/memory/service-mute.test.ts "src/app/api/me/values/[slug]/route.ts"
git commit -m "feat(api): PUT /api/me/values/[slug] — 관심 끄기·켜기

브레인 시트의 관심 고치기에 추가(POST)만 있고 삭제가 없어서, 이미 있는
가치를 눌러도 신호가 하나 더 쌓여 원이 커질 뿐 반응이 없는 것처럼 보였다.

멱등 PUT으로 개별 가치를 끄고 켠다. 끄면 재증류에서 interests에서 빠지고,
신호 원장은 그대로라 켜면 그동안의 confidence가 돌아온다."
```

---

### Task 5: 레이더 좌표 계산 (순수 모듈)

컴포넌트 안에 삼각함수를 두면 테스트가 닿지 않는다. 좌표는 순수 모듈로 분리한다.

**Files:**
- Create: `src/lib/values/radar.ts`
- Test: `src/lib/values/radar.test.ts`

**Interfaces:**
- Consumes: `VALUE_TAGS`(`src/lib/values/index.ts`)
- Produces:
  - `RADAR_AXES: { slug: string; label: string }[]` — 8개, `VALUE_TAGS` 정의 순서
  - `radarPoints(values: Record<string, number>, radius: number): { slug: string; label: string; frac: number; x: number; y: number; labelX: number; labelY: number; anchor: "start" | "middle" | "end" }[]`
  - `ringPolygon(frac: number, radius: number): string` — SVG `points` 문자열
  - 좌표계: 중심 `(0, 0)`, 첫 축이 **12시 방향**, 시계 방향. 라벨 반지름은 `radius * 1.26`

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/values/radar.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { RADAR_AXES, radarPoints, ringPolygon } from "@/lib/values/radar";

const R = 100;
const near = (a: number, b: number) => Math.abs(a - b) < 0.01;

describe("RADAR_AXES", () => {
  // 축을 고정해야 방문을 거듭해도 모양을 비교할 수 있다. 순서가 바뀌면 과거
  // 스크린샷·기억과 어긋난다.
  it("8가치를 정의 순서 그대로 쓴다", () => {
    expect(RADAR_AXES.map((a) => a.slug)).toEqual([
      "discovery",
      "experience",
      "goods",
      "social",
      "learning",
      "trend",
      "inspiration",
      "rest",
    ]);
  });
});

describe("radarPoints", () => {
  it("값이 없는 축도 0으로 남는다 — 안 채운 쪽이 보여야 치우침이 읽힌다", () => {
    const pts = radarPoints({ discovery: 1 }, R);
    expect(pts).toHaveLength(8);
    expect(pts.find((p) => p.slug === "goods")!.frac).toBe(0);
  });

  it("첫 축은 12시 방향", () => {
    const p = radarPoints({ discovery: 1 }, R)[0];
    expect(near(p.x, 0)).toBe(true);
    expect(near(p.y, -R)).toBe(true);
  });

  it("세 번째 축(굿즈)은 3시 방향 — 시계 방향으로 45도씩", () => {
    const p = radarPoints({ goods: 1 }, R).find((q) => q.slug === "goods")!;
    expect(near(p.x, R)).toBe(true);
    expect(near(p.y, 0)).toBe(true);
  });

  it("frac 0이면 중심에 붙는다", () => {
    const p = radarPoints({}, R)[0];
    expect(near(p.x, 0)).toBe(true);
    expect(near(p.y, 0)).toBe(true);
  });

  it("1을 넘는 값은 1로 자른다 — 폴리곤이 그리드를 뚫으면 안 된다", () => {
    expect(radarPoints({ discovery: 5 }, R)[0].frac).toBe(1);
  });

  it("음수는 0으로 자른다", () => {
    expect(radarPoints({ discovery: -3 }, R)[0].frac).toBe(0);
  });

  it("라벨 앵커 — 위아래는 middle, 오른쪽은 start, 왼쪽은 end", () => {
    const pts = radarPoints({}, R);
    expect(pts.find((p) => p.slug === "discovery")!.anchor).toBe("middle"); // 12시
    expect(pts.find((p) => p.slug === "goods")!.anchor).toBe("start"); // 3시
    expect(pts.find((p) => p.slug === "learning")!.anchor).toBe("middle"); // 6시
    expect(pts.find((p) => p.slug === "inspiration")!.anchor).toBe("end"); // 9시
  });

  it("8가치 밖 slug는 무시한다", () => {
    const pts = radarPoints({ ai: 1, discovery: 0.5 }, R);
    expect(pts).toHaveLength(8);
    expect(pts.find((p) => p.slug === "discovery")!.frac).toBe(0.5);
  });
});

describe("ringPolygon", () => {
  it("8개 좌표쌍을 낸다", () => {
    expect(ringPolygon(1, R).split(" ")).toHaveLength(8);
  });

  it("frac에 비례해 줄어든다", () => {
    const full = ringPolygon(1, R).split(" ")[0].split(",").map(Number);
    const half = ringPolygon(0.5, R).split(" ")[0].split(",").map(Number);
    expect(near(half[1], full[1] / 2)).toBe(true);
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/lib/values/radar.test.ts`
Expected: FAIL — `Cannot find module '@/lib/values/radar'`

- [ ] **Step 3: 구현**

`src/lib/values/radar.ts`:

```ts
import { VALUE_TAGS } from "@/lib/values";

/**
 * 취향 레이더 좌표 계산 — 순수. I/O 없음, DOM 없음.
 *
 * 컴포넌트 안에 삼각함수를 두면 테스트가 닿지 않는다. 각도·클램프·라벨 정렬은
 * 눈으로 검증하기 가장 어려운 부분이라 여기로 뺀다.
 *
 * 좌표계는 중심 (0,0), 첫 축이 12시, 시계 방향. 호출부가 SVG에서 원하는 만큼
 * translate 한다.
 */

/** 축은 VALUE_TAGS 정의 순서로 고정한다 — 순서가 바뀌면 과거 모양과 비교가 안 된다. */
export const RADAR_AXES = VALUE_TAGS.map((v) => ({
  slug: v.slug,
  label: v.label,
}));

const N = RADAR_AXES.length;
/** 라벨은 그리드 바깥에 둔다. 1.26은 8각형 꼭짓점과 안 겹치는 최소치. */
const LABEL_RATIO = 1.26;

function angleOf(i: number): number {
  return -Math.PI / 2 + (2 * Math.PI * i) / N;
}

function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  return Math.min(1, Math.max(0, v));
}

export interface RadarPoint {
  slug: string;
  label: string;
  /** 0~1로 잘린 값. */
  frac: number;
  x: number;
  y: number;
  labelX: number;
  labelY: number;
  anchor: "start" | "middle" | "end";
}

/**
 * 8축 전부를 낸다 — 값이 없는 축도 frac 0으로 남긴다. "안 채운 쪽"이 같이 보여야
 * 치우침이 읽히기 때문이다(원 크기 방식이 실패한 지점).
 */
export function radarPoints(
  values: Record<string, number>,
  radius: number,
): RadarPoint[] {
  return RADAR_AXES.map((axis, i) => {
    const a = angleOf(i);
    const frac = clamp01(values[axis.slug] ?? 0);
    const cos = Math.cos(a);
    const sin = Math.sin(a);
    return {
      slug: axis.slug,
      label: axis.label,
      frac,
      x: cos * radius * frac,
      y: sin * radius * frac,
      labelX: cos * radius * LABEL_RATIO,
      labelY: sin * radius * LABEL_RATIO,
      // 수평 성분이 작으면(12시·6시) 가운데 정렬. 아니면 바깥쪽으로 민다.
      anchor:
        Math.abs(cos) < 0.35 ? "middle" : cos > 0 ? "start" : "end",
    };
  });
}

/** 그리드 링 하나의 SVG points 문자열. */
export function ringPolygon(frac: number, radius: number): string {
  const f = clamp01(frac);
  return RADAR_AXES.map((_, i) => {
    const a = angleOf(i);
    return `${(Math.cos(a) * radius * f).toFixed(2)},${(Math.sin(a) * radius * f).toFixed(2)}`;
  }).join(" ");
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/lib/values/radar.test.ts`
Expected: PASS (11 tests)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/lib/values/radar.ts src/lib/values/radar.test.ts
git add src/lib/values/radar.ts src/lib/values/radar.test.ts
git commit -m "feat(values): 취향 레이더 좌표 계산 — 순수 모듈

8가치 고정축의 각도·클램프·라벨 정렬. 컴포넌트 안에 삼각함수를 두면
테스트가 닿지 않고, 이 부분이 눈으로 검증하기 가장 어렵다.

값이 없는 축도 0으로 남긴다 — '안 채운 쪽'이 같이 보여야 치우침이 읽힌다.
원 크기로 그리던 기존 방식이 실패한 지점이 정확히 그것이었다."
```

---

### Task 6: `TasteRadar` 컴포넌트

**Files:**
- Create: `src/components/me/taste-radar.tsx`
- Test: `src/components/me/taste-radar.test.tsx`

**Interfaces:**
- Consumes: `radarPoints`, `ringPolygon`, `RADAR_AXES`(Task 5)
- Produces: `TasteRadar({ values, label }: { values: Record<string, number>; label: (slug: string) => string })` — 반응형 SVG. 부모 너비를 채운다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/me/taste-radar.test.tsx`:

```tsx
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { TasteRadar } from "./taste-radar";

const label = (s: string) => s;

describe("TasteRadar", () => {
  it("8축 라벨을 모두 그린다 — 값이 없는 축도", () => {
    render(<TasteRadar values={{ discovery: 0.8 }} label={label} />);
    for (const slug of [
      "discovery",
      "experience",
      "goods",
      "social",
      "learning",
      "trend",
      "inspiration",
      "rest",
    ]) {
      expect(screen.getByText(slug)).toBeInTheDocument();
    }
  });

  it("확신 임계(0.25)를 넘는 축과 아닌 축을 다르게 표시한다", () => {
    render(
      <TasteRadar values={{ discovery: 0.8, goods: 0.1 }} label={label} />,
    );
    expect(screen.getByText("discovery").getAttribute("data-strong")).toBe(
      "true",
    );
    expect(screen.getByText("goods").getAttribute("data-strong")).toBe("false");
  });

  it("값이 전부 비어도 축과 그리드는 그린다 — 초기 사용자도 자기 자리를 본다", () => {
    const { container } = render(<TasteRadar values={{}} label={label} />);
    expect(container.querySelector("svg")).not.toBeNull();
    expect(screen.getByText("rest")).toBeInTheDocument();
  });

  it("접근성 이름이 있다", () => {
    render(<TasteRadar values={{}} label={label} />);
    expect(screen.getByRole("img")).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/me/taste-radar.test.tsx`
Expected: FAIL — `Cannot find module './taste-radar'`

- [ ] **Step 3: 구현**

`src/components/me/taste-radar.tsx`:

```tsx
import { radarPoints, ringPolygon } from "@/lib/values/radar";

/**
 * 취향 레이더 — 8가치 고정축.
 *
 * 예전엔 관심을 원 크기로 그렸는데(ValueMindMap), 원 두 개의 넓이 차이는 사람이
 * 못 읽고 값이 없는 가치는 아예 안 그려져 "어디로 치우쳤나"가 보이지 않았다.
 * 축을 고정하고 빈 축을 남기면 치우침이 모양 하나로 읽힌다.
 *
 * 점선 링 = 확신 임계 0.25. taste.ts·curate.ts·reaction-line.ts가 쓰는 그 값이다 —
 * 이 선 안쪽은 "아직 모르는 것", 바깥은 "확실한 것".
 */

/** curate.ts·taste.ts와 같은 확신 임계값. */
const CONFIDENT_THRESHOLD = 0.25;

const R = 100;
/** 라벨이 잘리지 않게 반지름보다 넉넉히 잡는다. */
const VB = 300;
const C = VB / 2;

export function TasteRadar({
  values,
  label,
}: {
  values: Record<string, number>;
  label: (slug: string) => string;
}) {
  const points = radarPoints(values, R);
  return (
    <svg
      viewBox={`0 0 ${VB} ${VB}`}
      className="mx-auto mt-2 block w-full max-w-[300px]"
      role="img"
      aria-label="내 취향 분포"
    >
      <defs>
        <linearGradient id="taste-radar-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--primary)" stopOpacity="0.45" />
          <stop offset="100%" stopColor="var(--primary)" stopOpacity="0.12" />
        </linearGradient>
      </defs>

      <g transform={`translate(${C} ${C})`}>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <polygon
            key={f}
            points={ringPolygon(f, R)}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {/* 축선은 값과 무관하게 항상 바깥 링까지 뻗는다 — 그래야 빈 축도 자리가 보인다. */}
        {ringPolygon(1, R)
          .split(" ")
          .map((pair) => {
            const [x, y] = pair.split(",").map(Number);
            return (
              <line
                key={`axis-${pair}`}
                x1={0}
                y1={0}
                x2={x}
                y2={y}
                stroke="var(--border)"
                strokeWidth={1}
              />
            );
          })}

        {/* 확신 임계선 — 이 안쪽은 아직 모르는 것. */}
        <polygon
          points={ringPolygon(CONFIDENT_THRESHOLD, R)}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={1.2}
          strokeDasharray="3 4"
          opacity={0.55}
        />

        <polygon
          points={points.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ")}
          fill="url(#taste-radar-fill)"
          stroke="var(--primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />

        {points.map((p) => (
          <circle
            key={`dot-${p.slug}`}
            cx={p.x}
            cy={p.y}
            r={4.5}
            fill="var(--card)"
            stroke="var(--primary)"
            strokeWidth={2.5}
          />
        ))}

        {points.map((p) => (
          <text
            key={`label-${p.slug}`}
            x={p.labelX}
            y={p.labelY + 4}
            textAnchor={p.anchor}
            data-strong={p.frac >= CONFIDENT_THRESHOLD ? "true" : "false"}
            className={
              p.frac >= CONFIDENT_THRESHOLD
                ? "fill-foreground text-[12px] font-bold"
                : "fill-muted-foreground text-[12px] font-semibold opacity-60"
            }
          >
            {label(p.slug)}
          </text>
        ))}
      </g>
    </svg>
  );
}
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/me/taste-radar.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/components/me/taste-radar.tsx src/components/me/taste-radar.test.tsx
git add src/components/me/taste-radar.tsx src/components/me/taste-radar.test.tsx
git commit -m "feat(me): 취향 레이더 컴포넌트 — 8축 고정 SVG

값이 없는 축도 남겨서 '안 채운 쪽'이 보이게 하고, 점선 링으로 확신
임계(0.25)를 그린다 — 이 선 안쪽은 아직 모르는 것, 바깥은 확실한 것.
라이브러리 없이 순수 SVG."
```

---

### Task 7: 브레인 시트 교체 + 관심 고치기 토글

**Files:**
- Modify: `src/components/me/brain-sheet.tsx`
- Test: `src/components/me/brain-sheet.test.tsx` (신규)

**Interfaces:**
- Consumes: `TasteRadar`(Task 6), `PUT /api/me/values/[slug]`(Task 4), `UserBrain.mutedSlugs`(Task 3)
- Produces: 없음(화면 끝단)

- [ ] **Step 1: 실패하는 테스트 작성**

`src/components/me/brain-sheet.test.tsx`:

```tsx
import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BrainSheet } from "./brain-sheet";
import { api } from "@/lib/api/client";
import type { UserBrain } from "@/lib/types";

const brain = (over: Partial<UserBrain> = {}): UserBrain => ({
  userId: "u1",
  version: 1,
  updatedAt: "",
  literacy: { overall: 0.4, byTheme: {}, visitsCount: 2, boothsSeenCount: 9 },
  interests: [
    {
      key: "discovery",
      label: "발견",
      confidence: 0.8,
      signals: { explicit: 3, implicit: 1, negative: 0 },
      firstSeenAt: "",
      lastSeenAt: "",
      trend: "up",
    },
  ],
  mutedSlugs: [],
  preferences: {},
  goals: [],
  visits: [],
  health: { lastDistilledAt: "", decayHalfLifeDays: 90 },
  ...over,
});

describe("BrainSheet 관심 고치기", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("고치기 모드에서 8가치가 전부 뜬다 — 뺄 것도 보여야 뺄 수 있다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: brain() });
    const user = userEvent.setup();
    const { container } = render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    expect(
      container.querySelectorAll('[data-testid^="value-toggle-"]'),
    ).toHaveLength(8);
  });

  it("켜진 가치를 누르면 muted:true로 PUT 한다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({ data: brain() });
    const put = vi.spyOn(api, "put").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    await user.click(screen.getByTestId("value-toggle-discovery"));
    expect(put).toHaveBeenCalledWith("/api/me/values/discovery", {
      muted: true,
    });
  });

  it("꺼진 가치를 누르면 muted:false로 PUT 한다", async () => {
    vi.spyOn(api, "get").mockResolvedValue({
      data: brain({ mutedSlugs: ["goods"] }),
    });
    const put = vi.spyOn(api, "put").mockResolvedValue(undefined);
    const user = userEvent.setup();
    render(<BrainSheet open onClose={() => {}} />);
    await waitFor(() => screen.getByText("발견"));
    await user.click(screen.getByRole("button", { name: /고치기|Edit/i }));
    await user.click(screen.getByTestId("value-toggle-goods"));
    expect(put).toHaveBeenCalledWith("/api/me/values/goods", { muted: false });
  });
});
```

> 버튼 이름 정규식은 `myPage.edit` i18n 실제 문구에 맞춘다(`dictionaries.ts`에서 확인).

- [ ] **Step 2: 실패 확인**

Run: `npx vitest run src/components/me/brain-sheet.test.tsx`
Expected: FAIL — `value-toggle` testid도, `api.put` 호출도 없다.

- [ ] **Step 3: 구현**

`src/components/me/brain-sheet.tsx`를 이렇게 바꾼다.

(a) import 교체 — `ValueMindMap` 대신 `TasteRadar`:

```tsx
import { TasteRadar } from "@/components/me/taste-radar";
```

(b) 차트에 넘길 값 맵 만들기. 기존 `nodes` 계산부를 다음으로 바꾼다:

```tsx
  // 레이더는 8축을 항상 그리므로 slug → confidence 맵만 주면 된다. 뮤트된 가치는
  // 서버 증류에서 이미 빠져 있으므로(distill.ts) 여기서 또 거르지 않는다.
  const values: Record<string, number> = {};
  for (const n of brain?.interests ?? []) {
    if (valueDef(n.key)) values[n.key] = n.confidence;
  }
  const muted = new Set(brain?.mutedSlugs ?? []);
  // "비었다"의 기준은 그릴 값이 하나도 없을 때다 — 축은 늘 8개라 노드 수로는 못 센다.
  const empty = !loading && Object.keys(values).length === 0;
```

(c) 렌더 교체:

```tsx
            <TasteRadar values={values} label={(s) => t(`values.${s}`)} />
```

(d) 고치기 블록을 **토글**로. 기존 `{editing && (...)}` 전체를 다음으로 바꾼다:

```tsx
            {editing && (
              <div className="mt-4">
                <p className="mb-2 text-center text-xs text-muted-foreground">
                  {t("myPage.editHint")}
                </p>
                <div className="flex flex-wrap justify-center gap-2">
                  {VALUE_TAGS.map((v) => {
                    // 켜짐 = 값이 있고 뮤트도 아님. 이 상태에서만 뺄 수 있다.
                    const on = !muted.has(v.slug) && (values[v.slug] ?? 0) > 0;
                    return (
                      <button
                        key={v.slug}
                        type="button"
                        data-testid={`value-toggle-${v.slug}`}
                        disabled={saving}
                        aria-pressed={on}
                        onClick={() => toggleValue(v.slug, on)}
                        className="flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs font-semibold active:opacity-70 disabled:opacity-50"
                        style={{
                          color: on ? v.color : "var(--muted-foreground)",
                          borderColor: on ? v.color : "var(--border)",
                        }}
                      >
                        {t(`values.${v.slug}`)}
                        <span aria-hidden>{on ? "×" : "+"}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
```

(e) `addValue`를 `toggleValue`로 교체:

```tsx
  /**
   * 켜진 가치는 끄고(뮤트), 꺼진 가치는 켠다.
   *
   * 켤 때 값이 하나도 없으면 명시 긍정 신호도 같이 남긴다 — 뮤트만 풀어봐야
   * 쌓인 게 없으면 여전히 0이라 화면이 안 변하고, 사용자는 또 "반응이 없다"고
   * 느낀다.
   *
   * 낙관적 갱신은 하지 않는다. confidence는 서버 증류 결과가 유일한 진실이라
   * (취향 정확도와 같은 규칙) 임의로 그려두면 새로고침 때 값이 튄다.
   */
  async function toggleValue(slug: string, on: boolean) {
    if (saving) return;
    setSaving(true);
    try {
      await api.put(`/api/me/values/${slug}`, { muted: on });
      if (!on && (values[slug] ?? 0) === 0) {
        await api.post("/api/me/values", { values: [slug] });
      }
      load();
    } catch {
      // 무시 — 실패해도 다음 load에서 서버 값으로 맞춰진다.
    } finally {
      setSaving(false);
    }
  }
```

(f) i18n — `myPage.addHint`를 그대로 쓰면 "추가"만 말한다. `dictionaries.ts`의 `myPage`에 ko/en 각각 추가하고 위 코드가 그걸 쓴다:

```ts
    editHint: "누르면 켜고 꺼져. 끈 관심은 추천에서 빠져.",
```
```ts
    editHint: "Tap to turn on or off. Muted interests drop out of picks.",
```

- [ ] **Step 4: 통과 확인**

Run: `npx vitest run src/components/me/brain-sheet.test.tsx`
Expected: PASS (3 tests)

- [ ] **Step 5: 눈으로 확인**

```bash
npx next dev -p 3120
```

로그인 후 헤더의 닉네임 → 브레인 시트를 열어 확인:
- 8축 레이더가 뜨고, 값이 없는 축도 라벨이 보인다
- "관심 고치기"를 누르면 8칸이 전부 뜨고, 켜진 건 `×`, 꺼진 건 `+`
- `×`를 누르면 그 축이 0으로 내려간다
- `+`를 누르면 다시 올라온다

서버는 확인 후 종료.

- [ ] **Step 6: 검증 + 커밋**

```bash
npx tsc --noEmit && npx vitest run && npx eslint src/components/me/brain-sheet.tsx src/components/me/brain-sheet.test.tsx src/lib/i18n/dictionaries.ts
git add src/components/me/brain-sheet.tsx src/components/me/brain-sheet.test.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(me): 브레인 시트를 취향 레이더로 + 관심 고치기를 진짜 토글로

원 크기로 그리던 방식은 두 가지가 안 됐다. 원 넓이 차이는 사람이 못 읽고,
값이 없는 가치는 아예 안 그려져 '어디로 치우쳤나'가 보이지 않았다.
8축 고정 레이더로 바꾸고 빈 축을 남긴다.

관심 고치기도 고쳤다. 추가(POST)만 있어서 이미 있는 가치를 눌러도 신호가
하나 더 쌓여 원이 커질 뿐 반응이 없는 것처럼 보였다. 이제 8칸이 전부 뜨고
켜진 건 끄고 꺼진 건 켠다. 켤 때 쌓인 값이 하나도 없으면 명시 긍정 신호도
같이 남긴다 — 뮤트만 풀면 여전히 0이라 화면이 안 변하기 때문이다.

낙관적 갱신은 하지 않는다. confidence는 서버 증류가 유일한 진실이라
임의로 그리면 새로고침 때 값이 튄다."
```

---

## 자기 점검 결과

계획을 쓴 뒤 스펙과 대조해 고친 것들:

- **스펙의 경로 오류** — 스펙 §4가 `components/values/value-mind-map.tsx`라 적었는데 실제는 `components/me/value-mindmap.tsx`다. 계획은 실제 경로를 쓴다.
- **`ValueMindMap` 삭제 금지** — `onboarding-result.tsx`가 계속 쓴다. 스펙 §6의 "참조가 있으면 그대로 둔다"에 해당. Global Constraints에 못 박았다.
- **마이그레이션 불필요** — 스펙 §4가 repo 변경을 예상했지만, `user_brain`은 `data` JSONB 한 칼럼이라 `mutedSlugs`는 스키마 변경 없이 들어간다. Task 3에 명시.
- **뮤트만 풀면 화면이 안 변하는 구멍** — 스펙 §1-4는 "뮤트 해제 + 값이 0이면 POST"라고만 적었다. 왜 그 조건이 필요한지(안 그러면 또 무반응처럼 보임)를 Task 7 코드 주석에 넣었다.
- **`api.put` 확인 완료** — `src/lib/api/client.ts:31`에 이미 있다. 계획에서 조건부 지시를 뺐다.
- **자기수정 제거** — Task 6 축선과 Task 7 testid를 "쓴 뒤 고쳐라"로 적었던 것을 처음부터 맞는 코드로 바꿨다. 계획은 맞는 코드만 담는다.

## 다루지 않는 것

- **§3 지도 하단 시트 재구성** — `interest`/`verdict` 필드를 전제하므로 계획 A(judgment-vocabulary)에 묶는다. 하단 시트를 지도 컨테이너 밖으로 옮기는 작업(§2-3 항목 2)도 같은 JSX를 건드리므로 거기서 함께 한다. Task 2가 확대의 근본 원인을 제거하므로 이번 계획만으로도 증상은 사라진다.
- **`onboarding-result.tsx`의 시각화 통일** — 같은 것을 두 방식으로 그리는 불일치가 남지만, 이번 요청 범위 밖이다.
- **레이더 인터랙션(축 탭·툴팁·애니메이션)** — 정적 렌더까지가 범위(스펙 §6).
