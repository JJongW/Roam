# 앱 진입 플로우 재설계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 로그인 직후 아무 설명 없이 전시 홈이 뜨는 문제를 고친다 — 기존 `AppOnboardingGate`(첫 진입 온보딩)에 "이렇게 쓰면 돼" 3단계 사용법 안내를 끼워 넣고, 홈(`/`)에서도 이 온보딩이 뜨도록 과거 노출 제외 규칙을 없앤다.

**Architecture:** 완전히 새 컴포넌트를 만들지 않는다. `AppOnboardingGate`의 상태 기계(`Phase: "intro" | "quiz" | "saving"`)에 `"guide"` 단계 하나를 끼워 넣어 `intro → guide → quiz → saving`으로 확장한다. 3단계 미리보기 UI는 앱 실제 색상 토큰(`--judge-*`, `--primary`)과 카드 스타일을 그대로 재사용해 신뢰도를 준다(아이콘 카드 아님).

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · Tailwind v4 · vitest

## Global Constraints

- 기존 `intro`/`quiz`/`saving` phase의 로직·마크업은 변경하지 않는다 — `guide`만 새로 끼워 넣는다.
- 새 `guide` phase의 내부 진행 상태(몇 번째 슬라이드인지)도 세션스토리지에 저장한다 — 뒤로가기로 언마운트·재마운트돼도 리셋되지 않아야 한다(기존 `use-session-state.ts` 패턴 그대로 재사용, 이미 구현돼 있음 — 새로 만들지 않는다).
- 3단계 각각 건너뛰기 가능 — 강제하지 않는다(기존 `intro`의 건너뛰기와 같은 원칙).
- 미리보기는 실제 색상 토큰을 쓴다: `--judge-must`(=var(--primary)) · `--judge-good`(=var(--route-visited)) · `--judge-bad`(#d0595d) · `--judge-pass`(#aab2bf) — `src/app/globals.css`에 이미 정의돼 있다(judgment-vocabulary 작업에서 추가됨), 새로 만들지 않는다.
- 새 npm 의존성을 추가하지 않는다.
- 주석은 한국어, 무엇을 하는지가 아니라 왜 그런지를 쓴다.
- 검증 3종은 매 태스크 끝에 돌린다: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.

---

### Task 1: 홈(`/`) 노출 제외 규칙 제거

**Files:**
- Modify: `src/lib/onboarding/app-onboarding-gate.ts`
- Modify: `src/lib/onboarding/app-onboarding-gate.test.ts`

**Interfaces:**
- Consumes: 없음(순수 함수 레이어)
- Produces: `canShowAppOnboarding(pathname: string): boolean` — 시그니처 불변, 반환 로직만 바뀐다(`/`도 이제 `true`).

- [ ] **Step 1: 실패하는 테스트로 먼저 고친다**

`src/lib/onboarding/app-onboarding-gate.test.ts`의 기존 테스트:

```ts
describe("canShowAppOnboarding", () => {
  it("랜딩(/)에서는 안 뜬다", () => {
    expect(canShowAppOnboarding("/")).toBe(false);
  });

  it("전시 상세에서는 뜬다", () => {
    expect(canShowAppOnboarding("/exhibitions/sibf-2026")).toBe(true);
  });

  it("지도에서도 뜬다 — 공유 링크로 바로 들어온 사람도 만나야 한다", () => {
    expect(canShowAppOnboarding("/exhibitions/sibf-2026/map")).toBe(true);
  });

  it("부스 상세에서도 뜬다", () => {
    expect(canShowAppOnboarding("/booths/b_a1406")).toBe(true);
  });
});
```

이걸 다음으로 교체한다(랜딩도 이제 뜨는 게 맞는 동작이므로 기대값을 바꾼다):

```ts
describe("canShowAppOnboarding", () => {
  it("랜딩(/)에서도 뜬다 — 홈을 먼저 보여줘도 OAuth 재심사가 계속 반려돼서 이 제약을 없앴다", () => {
    expect(canShowAppOnboarding("/")).toBe(true);
  });

  it("전시 상세에서도 뜬다", () => {
    expect(canShowAppOnboarding("/exhibitions/sibf-2026")).toBe(true);
  });

  it("지도에서도 뜬다 — 공유 링크로 바로 들어온 사람도 만나야 한다", () => {
    expect(canShowAppOnboarding("/exhibitions/sibf-2026/map")).toBe(true);
  });

  it("부스 상세에서도 뜬다", () => {
    expect(canShowAppOnboarding("/booths/b_a1406")).toBe(true);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/onboarding/app-onboarding-gate.test.ts`
Expected: FAIL — "랜딩(/)에서도 뜬다" 테스트가 현재 구현(`pathname !== "/"`)에서 `false`를 반환해 실패.

- [ ] **Step 3: 구현 수정**

`src/lib/onboarding/app-onboarding-gate.ts` 전체를 다음으로 교체:

```ts
// 앱 온보딩 게이트 재노출 판정 — 순수 함수, 테스트 가능하도록 분리.
//
// 로컬 dismissal(anonDismissed, localStorage 기반)이 항상 우선한다 — 한 번 껐으면
// (완료든 건너뛰기든) 이 브라우저에선 계속 안 뜬다. 로그인 상태에선 서버 신호
// (needsOnboarding)가 추가로 다시 띄울 이유가 된다 — 로컬엔 기록이 없는 새
// 브라우저·새 기기에서 계정에 실제로 취향이 없을 때만 해당한다.
//
// 예전엔 로그인 여부로 완전히 갈라(로그인=서버 신호만, 비로그인=로컬만) 판정했는데,
// 그러면 "방금 로그인 응답의 needsOnboarding는 로그인 시점 기준이라 동기화 전 상태"
// 라는 타이밍 문제와 "로그인 상태 건너뛰기가 서버에 안 남는다"는 두 가지 버그가
// 생겼다 — 둘 다 로컬 dismissal을 무조건 최우선으로 두면 사라진다.
export function isAppOnboardingDismissed(params: {
  user: unknown;
  needsOnboarding: boolean;
  anonDismissed: boolean;
}): boolean {
  return (
    params.anonDismissed || (params.user ? !params.needsOnboarding : false)
  );
}

/**
 * 이 경로에서 온보딩 게이트를 띄워도 되는가.
 *
 * 모든 경로에서 뜬다 — 랜딩(`/`)도 포함. 예전엔 "첫 화면이 전체화면 인트로면
 * 이 서비스가 뭔지 알 방법이 없다"(Google OAuth가 그 사유로 반려)는 이유로
 * 랜딩만 제외했는데, 이후 랜딩을 먼저 보여준 채로 재심사를 넣어도 Google이
 * 같은 사유로 계속 반려했다 — "홈을 무조건 먼저 보여줘야 통과한다"는 전제 자체가
 * 성립하지 않았다는 뜻이라 이 제약을 없앤다(2026-08-11 판단, 앱 진입 플로우 재설계).
 * pathname 인자는 향후 다시 경로별 예외가 필요해질 가능성을 열어두기 위해 그대로
 * 남긴다(현재는 항상 true).
 */
export function canShowAppOnboarding(_pathname: string): boolean {
  return true;
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/onboarding/app-onboarding-gate.test.ts`
Expected: PASS (4/4)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "app-onboarding-gate"
npx vitest run src/lib/onboarding/app-onboarding-gate.test.ts
npx eslint src/lib/onboarding/app-onboarding-gate.ts src/lib/onboarding/app-onboarding-gate.test.ts
git add src/lib/onboarding/app-onboarding-gate.ts src/lib/onboarding/app-onboarding-gate.test.ts
git commit -m "fix(onboarding): 홈(/)에서도 첫 진입 온보딩이 뜨도록

홈을 먼저 보여줘도 Google OAuth 재심사가 같은 사유로 계속 반려하고 있어
'홈을 무조건 먼저 보여줘야 통과한다'는 전제가 성립하지 않았다. 랜딩만
제외하던 규칙을 없앤다."
```

---

### Task 2: "이렇게 쓰면 돼" 3단계 안내(guide phase) 추가

**Files:**
- Modify: `src/components/onboarding/app-onboarding.tsx`
- Modify: `src/lib/i18n/dictionaries.ts`

**Interfaces:**
- Consumes: `useSessionState`/`clearSessionState`(`src/lib/hooks/use-session-state.ts`, 이미 구현됨) — `useSessionState<T>(key: string, initial: T): [T, (next: T) => void]`. `useT()`(`src/lib/i18n/provider.tsx`) — `t(key: string, params?: Record<string, string|number>): string`.
- Produces: `Phase` 타입에 `"guide"` 추가. `intro` 완료 시 `"guide"`로 이동(기존엔 `"quiz"`로 바로 이동했다). `guide` 완료/건너뛰기 시 `"quiz"`로 이동.

- [ ] **Step 1: `Phase` 타입 확장 + intro의 다음 단계를 guide로 변경**

`src/components/onboarding/app-onboarding.tsx:28`, 기존:

```ts
type Phase = "intro" | "quiz" | "saving";
```

새로:

```ts
type Phase = "intro" | "guide" | "quiz" | "saving";
```

같은 파일의 intro CTA 버튼(현재 45번째 줄 부근), 기존:

```tsx
            <Button
              size="lg"
              className="w-full"
              onClick={() => setPhase("quiz")}
            >
              {t("onboardingQ.introCta")}
            </Button>
```

새로:

```tsx
            <Button
              size="lg"
              className="w-full"
              onClick={() => setPhase("guide")}
            >
              {t("onboardingQ.introCta")}
            </Button>
```

- [ ] **Step 2: guide 단계 내부 진행 상태 + 콘텐츠 정의**

같은 파일 상단, `const FLAG = "roam-app-onboarded";` 바로 아래에 3단계 콘텐츠 배열을 추가한다:

```ts
const FLAG = "roam-app-onboarded";
type Phase = "intro" | "guide" | "quiz" | "saving";

/** "이렇게 쓰면 돼" 3단계 — 기능 자랑이 아니라 실제 사용 순서를 그대로 보여준다
 *  (브레인스토밍에서 "기능 카드"로 먼저 시도했다가 "신뢰가 안 간다"는 피드백으로
 *  이 안내형 구조로 바뀌었다). titleKey/descKey는 dictionaries.ts의 onboardingQ.*
 *  네임스페이스를 가리킨다. */
const GUIDE_STEPS = [
  { titleKey: "onboardingQ.guide1Title", descKey: "onboardingQ.guide1Desc" },
  { titleKey: "onboardingQ.guide2Title", descKey: "onboardingQ.guide2Desc" },
  { titleKey: "onboardingQ.guide3Title", descKey: "onboardingQ.guide3Desc" },
] as const;
```

- [ ] **Step 3: 컴포넌트 안에 guide 진행 상태 훅 추가**

`src/components/onboarding/app-onboarding.tsx`의 `phase` 상태 선언 바로 아래(기존 `const [phase, setPhase] = useSessionState<Phase>(...)` 다음 줄)에 추가:

```ts
  // guide phase 자체의 몇 번째 슬라이드인지도 세션스토리지에 남긴다 — phase가
  // "guide"로 남아있어도 이 값이 리셋되면 뒤로가기 한 번에 슬라이드 진행이
  // 처음으로 돌아간 것처럼 보인다.
  const [guideStep, setGuideStep] = useSessionState<number>(
    "roam-onboarding-app-guide-step",
    0,
  );
```

- [ ] **Step 4: guide 완료/건너뛰기 처리 함수 추가**

`dismissLocally` 함수 바로 아래에 추가:

```ts
  // guide는 3장 다 보거나 건너뛰면 quiz로 — 둘 다 같은 목적지라 별도 분기가
  // 필요 없다(건너뛰기가 "이 온보딩 전체를 그만둔다"는 뜻이 아니라 "안내만
  // 생략한다"는 뜻이므로 dismissLocally를 부르지 않는다).
  function finishGuide() {
    setGuideStep(0);
    setPhase("quiz");
  }
```

- [ ] **Step 5: guide phase의 JSX 추가**

`quiz` phase 렌더 블록(`{phase === "quiz" && ( ... )}`) 바로 위에 다음 블록을 추가:

```tsx
      {phase === "guide" && (
        <GuideSlide
          step={guideStep}
          onNext={() =>
            guideStep >= GUIDE_STEPS.length - 1
              ? finishGuide()
              : setGuideStep(guideStep + 1)
          }
          onSkip={finishGuide}
          t={t}
        />
      )}

```

- [ ] **Step 6: `GuideSlide` 하위 컴포넌트 구현**

파일 맨 아래(`export function AppOnboardingGate() { ... }` 함수가 끝나는 마지막 `}` 바로 다음)에 추가:

```tsx

/**
 * "이렇게 쓰면 돼" 3단계 안내 슬라이드 — 각 단계는 실제 앱 화면을 최소한으로
 * 재현한 미리보기를 보여준다(아이콘 카드가 아니다 — 브레인스토밍에서 아이콘
 * 버전은 "신뢰가 안 간다"는 반응을 받았다). 색상은 지도·JudgmentBar와 같은
 * --judge-* 토큰을 그대로 참조해, 나중에 실제 화면에서 볼 색과 여기서 미리
 * 본 색이 어긋나지 않게 한다.
 */
function GuideSlide({
  step,
  onNext,
  onSkip,
  t,
}: {
  step: number;
  onNext: () => void;
  onSkip: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const current = GUIDE_STEPS[step];
  const isLast = step === GUIDE_STEPS.length - 1;

  return (
    <div className="flex flex-1 flex-col px-6 pb-8 pt-safe">
      <div className="flex items-center gap-1.5 pt-2">
        {GUIDE_STEPS.map((_, i) => (
          <span
            key={i}
            className={
              "h-1 flex-1 rounded-full transition-colors " +
              (i <= step ? "bg-primary" : "bg-secondary")
            }
          />
        ))}
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          STEP {step + 1}
        </span>
        <h2 className="max-w-[18rem] text-2xl font-extrabold leading-snug">
          {t(current.titleKey)}
        </h2>
        <p className="max-w-[20rem] text-[15px] leading-relaxed text-muted-foreground">
          {t(current.descKey)}
        </p>

        <GuidePreview step={step} />
      </div>

      <div className="space-y-2">
        <button
          type="button"
          onClick={onNext}
          className="w-full rounded-2xl bg-primary px-5 py-4 text-center font-bold text-primary-foreground active:scale-[0.99]"
        >
          {isLast ? t("onboardingQ.guideDone") : t("onboardingQ.guideNext")}
        </button>
        {!isLast && (
          <button
            type="button"
            onClick={onSkip}
            className="w-full py-2 text-sm font-medium text-muted-foreground active:opacity-70"
          >
            {t("onboardingQ.introSkip")}
          </button>
        )}
      </div>
    </div>
  );
}

/** 단계별 미니 미리보기 — 실제 색상 토큰·카드 형태를 그대로 쓴다. */
function GuidePreview({ step }: { step: number }) {
  if (step === 0) {
    // STEP 1: 취향 질문 카드 — Conversation의 답변 카드와 같은 모양.
    return (
      <div className="w-full max-w-[16rem] rounded-2xl border border-border bg-card px-4 py-3.5 text-left">
        <div className="mb-2.5 text-[13px] font-bold">
          오늘은 뭐가 끌려?
        </div>
        <div className="space-y-1.5">
          <div className="rounded-xl border border-border px-3 py-2 text-xs">
            직접 만져보고 사는 게 좋아
          </div>
          <div className="rounded-xl border border-primary px-3 py-2 text-xs font-semibold text-primary">
            몰랐던 걸 발견하고 싶어
          </div>
        </div>
      </div>
    );
  }
  if (step === 1) {
    // STEP 2: 피드 카드 + JudgmentBar와 같은 반응 버튼 모양(색은 --judge-must).
    return (
      <div className="w-full max-w-[16rem] rounded-2xl border border-border bg-card p-3.5 text-left">
        <div className="mb-2 h-16 rounded-lg bg-secondary" />
        <div className="mb-2 text-[13px] font-bold">단어의 시각적 번역</div>
        <div className="flex gap-1.5">
          <div
            className="flex-1 rounded-lg border py-1.5 text-center text-[11px] font-semibold"
            style={{
              borderColor: "var(--judge-must)",
              backgroundColor:
                "color-mix(in srgb, var(--judge-must) 16%, transparent)",
              color: "var(--judge-must)",
            }}
          >
            꼭 갈래
          </div>
          <div className="flex-1 rounded-lg border border-border py-1.5 text-center text-[11px] text-muted-foreground">
            패스
          </div>
        </div>
      </div>
    );
  }
  // STEP 3: 지도 색 미리보기 — 판단 색 4가지를 점으로.
  return (
    <div className="flex w-full max-w-[16rem] items-center justify-center gap-4 rounded-2xl border border-border bg-card px-4 py-6">
      {(
        [
          ["var(--judge-must)", "꼭 갈래"],
          ["var(--judge-good)", "좋았어"],
          ["var(--judge-bad)", "아니었어"],
          ["var(--judge-pass)", "패스"],
        ] as const
      ).map(([color, label]) => (
        <div key={label} className="flex flex-col items-center gap-1">
          <span
            className="size-5 rounded-full"
            style={{ backgroundColor: color }}
          />
          <span className="text-[10px] text-muted-foreground">{label}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: i18n 키 추가 — 한국어**

`src/lib/i18n/dictionaries.ts`의 `onboardingQ` 네임스페이스(한국어, `:97` 부근), `introSkip: "먼저 둘러볼게",` 바로 다음 줄에 추가:

```ts
    guide1Title: "몇 가지만 물어볼게",
    guide1Desc: "굿즈가 좋아, 새로운 걸 보는 게 좋아? 30초면 끝나.",
    guide2Title: "그럼 이런 걸 골라올게",
    guide2Desc:
      "답한 대로 부스를 추려서 순서대로 보여줘. 맘에 들면 '꼭 갈래', 아니면 '패스' — 그걸로 또 다듬어져.",
    guide3Title: "돌아다니면서 확인해",
    guide3Desc:
      "지도에서 찜한 곳이 색으로 바로 보여. 실제로 가본 다음엔 어땠는지 한 번 더 물어볼게 — 그래야 다음엔 더 정확해져.",
    guideNext: "다음",
    guideDone: "시작하자",
```

- [ ] **Step 8: i18n 키 추가 — 영어**

`src/lib/i18n/dictionaries.ts`의 `onboardingQ` 네임스페이스(영어, `:760` 부근), `introSkip: "I'll look around first",` 바로 다음 줄에 추가:

```ts
    guide1Title: "Just a few questions",
    guide1Desc: "Into hands-on goods, or discovering new things? Takes 30 seconds.",
    guide2Title: "Then I'll pick some for you",
    guide2Desc:
      "I'll narrow down booths based on your answers and show them in order. Like one? Tap 'Must-see'. Not for you? 'Pass' — either way I get sharper.",
    guide3Title: "Check in as you walk around",
    guide3Desc:
      "Spots you're into show up in color on the map. Once you've actually been, I'll ask how it went — that's what makes me more accurate next time.",
    guideNext: "Next",
    guideDone: "Let's start",
```

- [ ] **Step 9: 검증**

```bash
npx tsc --noEmit 2>&1 | grep "app-onboarding\|dictionaries"
```
Expected: 에러 없음.

```bash
npx vitest run
```
Expected: 전체 그린(이 태스크는 새 테스트를 추가하지 않는다 — `AppOnboardingGate`는 기존에도 컴포넌트 테스트가 없다. `app-onboarding-gate.test.ts`는 Task 1에서 이미 갱신·통과 확인됨).

```bash
npx eslint src/components/onboarding/app-onboarding.tsx src/lib/i18n/dictionaries.ts
```
Expected: 클린.

- [ ] **Step 10: 수동 확인(선택, 가능하면)**

`npx next dev`로 mock 모드 실행 후 로컬스토리지의 `roam-app-onboarded`를 지우고 `/`(홈)에 접속 — intro → CTA 클릭 → guide 3장(다음/건너뛰기 동작 확인) → quiz로 자연스럽게 이어지는지 확인. 브라우저 개발자도구에서 뒤로가기 후 다시 앞으로가기를 눌러 guide 슬라이드 진행 상태가 유지되는지도 확인.

- [ ] **Step 11: 커밋**

```bash
git add src/components/onboarding/app-onboarding.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(onboarding): 첫 진입 온보딩에 '이렇게 쓰면 돼' 3단계 안내 추가

로그인 직후 설명 없이 전시 홈이 뜨는 문제 — 기존 로미 인트로와 취향 질문
사이에 실사용 순서를 그대로 보여주는 3단계(물어볼게/골라올게/다녀와서
확인해)를 끼워 넣는다. 브레인스토밍에서 기능 자랑 카드로 먼저 시도했는데
'신뢰가 안 간다'는 피드백을 받아 실제 사용 순서 안내형으로 바꿨고, 미리보기도
아이콘 대신 앱 실제 색상 토큰·카드 스타일을 그대로 재현했다.

건너뛰기 가능(강제 안 함), 슬라이드 진행 상태도 세션스토리지에 남겨 뒤로가기
리셋 문제가 여기도 재현되지 않는다."
```

---

## 자기 점검 결과

- **스펙 커버리지**: 스펙의 플로우 섹션(intro → guide → quiz → saving → 완료)을 Task 1(홈 노출)+Task 2(guide phase)로 전부 구현. "건너뛰기 가능"(스펙 요구) — Step 5의 `!isLast` 조건부 건너뛰기 버튼으로 충족. "로딩 단계는 기존 saving으로 충분"(스펙에서 이미 확인 완료) — 변경 없음, 별도 태스크 불필요. "세션스토리지 상태 유지는 이미 구현됨"(스펙 명시) — Task 2에서 `guideStep`도 같은 패턴으로 확장, 새 인프라 추가 없음.
- **플레이스홀더 스캔**: 모든 코드 블록이 실제 값(정확한 색상 토큰, 실제 카피, 실제 조건문)으로 채워져 있다. "TBD"/"나중에" 없음.
- **타입 일관성**: `Phase` 타입에 `"guide"` 추가가 Step 1·5·6에서 일관되게 쓰인다. `GuideSlide`/`GuidePreview`의 props 타입이 호출부(Step 5)와 정의부(Step 6)에서 일치.
- **범위 점검**: 단일 컴포넌트 파일 확장 + 사전 파일 키 추가로 끝나는 크기 — 추가 분해 불필요.
