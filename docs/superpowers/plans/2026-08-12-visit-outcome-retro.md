# 관람 종료 회고 애니메이션(E) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 관람 종료 회고 화면(`RecapSheet`)에 "네 예측이 맞았는지"를 보여주는 탭-넘김 카드 섹션을 추가한다.

**Architecture:** interest+verdict가 둘 다 있는 부스를 적중/반전 2단계로 분류하는 순수 함수를 만들고, `GET /api/me/recap`이 그 결과를 계산해 `outcomeCards` 필드로 내려준다. `RecapSheet`는 이 카드를 서사 박스 바로 위에서 `GuideSlide`와 같은 탭-넘김 스텝퍼로 렌더한다.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · vitest

## Global Constraints

- 대상 부스는 `interest`와 `verdict`가 **둘 다** 있는 노트만 — 한쪽만 있으면 비교 대상에서 제외.
- 카테고리는 **2단계만**(적중/반전) — 더 세분화하지 않는다.
- 최대 **3~4개**만 표시, `judgedClass="confident"` 우선 정렬.
- 넘기는 방식은 **탭으로만**(다음 버튼) — 자동 타이머 없음.
- 대상 부스가 0개면 섹션 자체를 렌더하지 않는다.
- 삽입 위치는 `RecapSheet` 서사 박스 바로 위 — 별도 시트를 새로 만들지 않는다. 게이트 없이 항상 마운트(사용자가 자기 속도로 탭).
- 주석은 한국어, 무엇을 하는지가 아니라 왜 그런지를 쓴다.
- 새 npm 의존성을 추가하지 않는다.
- 검증 3종은 매 태스크 끝에: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.

---

### Task 1: 분류 순수 함수 — `retro-outcomes.ts`

**Files:**
- Create: `src/lib/memory/retro-outcomes.ts`
- Test: `src/lib/memory/retro-outcomes.test.ts`

**Interfaces:**
- Consumes: `BoothNote`(`@/lib/types` — `{userId, boothId, interest?: "must"|"curious"|"pass", verdict?: "good"|"ok"|"bad", judgedClass?: "confident"|"uncertain", ...}`, 이미 정의됨).
- Produces: `OutcomeKind = "hit" | "reversal"`. `OutcomeCard = {boothId: string; boothName: string; interest: "must"|"curious"|"pass"; verdict: "good"|"ok"|"bad"; kind: OutcomeKind}`. `classifyOutcome(interest, verdict): OutcomeKind`. `buildOutcomeCards(notes: BoothNote[], boothNameById: Record<string,string>, limit?: number): OutcomeCard[]`.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/memory/retro-outcomes.test.ts` 전체 내용:

```ts
import { describe, expect, it } from "vitest";
import { classifyOutcome, buildOutcomeCards } from "./retro-outcomes";
import type { BoothNote } from "@/lib/types";

describe("classifyOutcome", () => {
  it("관심 있었고(must) 결과도 좋으면(good) 적중", () => {
    expect(classifyOutcome("must", "good")).toBe("hit");
  });
  it("관심 있었고(curious) 결과도 나쁘지 않으면(ok) 적중", () => {
    expect(classifyOutcome("curious", "ok")).toBe("hit");
  });
  it("패스했고(pass) 결과도 나쁘면(bad) 적중 — 패스가 옳았다", () => {
    expect(classifyOutcome("pass", "bad")).toBe("hit");
  });
  it("패스했는데(pass) 결과가 좋으면(good) 반전", () => {
    expect(classifyOutcome("pass", "good")).toBe("reversal");
  });
  it("관심 있었는데(must) 결과가 나쁘면(bad) 반전", () => {
    expect(classifyOutcome("must", "bad")).toBe("reversal");
  });
});

describe("buildOutcomeCards", () => {
  function note(overrides: Partial<BoothNote> & { boothId: string }): BoothNote {
    return {
      userId: "u1",
      updatedAt: "2026-08-11T00:00:00Z",
      ...overrides,
    };
  }

  const names = { b1: "부스1", b2: "부스2", b3: "부스3", b4: "부스4", b5: "부스5" };

  it("interest·verdict 둘 다 있는 노트만 카드로 만든다", () => {
    const notes = [
      note({ boothId: "b1", interest: "must", verdict: "good" }),
      note({ boothId: "b2", interest: "must" }), // verdict 없음 — 제외
      note({ boothId: "b3", verdict: "good" }), // interest 없음 — 제외
    ];
    const cards = buildOutcomeCards(notes, names);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({
      boothId: "b1",
      boothName: "부스1",
      interest: "must",
      verdict: "good",
      kind: "hit",
    });
  });

  it("judgedClass=confident인 카드를 먼저 배치한다", () => {
    const notes = [
      note({ boothId: "b1", interest: "must", verdict: "good", judgedClass: "uncertain" }),
      note({ boothId: "b2", interest: "must", verdict: "good", judgedClass: "confident" }),
    ];
    const cards = buildOutcomeCards(notes, names);
    expect(cards.map((c) => c.boothId)).toEqual(["b2", "b1"]);
  });

  it("limit개까지만 반환한다(기본 4)", () => {
    const notes = ["b1", "b2", "b3", "b4", "b5"].map((id) =>
      note({ boothId: id, interest: "must", verdict: "good" }),
    );
    expect(buildOutcomeCards(notes, names)).toHaveLength(4);
    expect(buildOutcomeCards(notes, names, 2)).toHaveLength(2);
  });

  it("대상이 없으면 빈 배열", () => {
    expect(buildOutcomeCards([], names)).toEqual([]);
  });
});
```

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/memory/retro-outcomes.test.ts`
Expected: FAIL — `./retro-outcomes` 모듈이 없음.

- [ ] **Step 3: 구현**

`src/lib/memory/retro-outcomes.ts` 전체 내용:

```ts
import type { BoothNote } from "@/lib/types";

export type OutcomeKind = "hit" | "reversal";

export interface OutcomeCard {
  boothId: string;
  boothName: string;
  interest: "must" | "curious" | "pass";
  verdict: "good" | "ok" | "bad";
  kind: OutcomeKind;
}

/**
 * 관심(피드)과 결과(현장 판정)가 같은 방향이면 적중, 다르면 반전. "관심 있었다"는
 * must·curious, "패스했다"는 pass. "결과가 좋았다"는 good·ok(그냥그랬어도 나쁘진
 * 않았다는 뜻이라 "적중" 쪽으로 묶는다 — 2단계로만 나누기로 했다), "나빴다"는 bad.
 */
export function classifyOutcome(
  interest: "must" | "curious" | "pass",
  verdict: "good" | "ok" | "bad",
): OutcomeKind {
  const wasInterested = interest === "must" || interest === "curious";
  const wasGood = verdict === "good" || verdict === "ok";
  return wasInterested === wasGood ? "hit" : "reversal";
}

/**
 * interest·verdict 둘 다 있는 노트만 "예측-결과" 카드로 만든다(한쪽만 있으면
 * 비교 자체가 성립하지 않는다). judgedClass=confident(브레인 확신 가치와 겹치는
 * 부스)를 먼저 배치해 상위 limit개만 남긴다 — 판정한 부스가 많아도 "빠르게
 * 회고하는 느낌"을 지키려고 다 보여주지 않는다.
 */
export function buildOutcomeCards(
  notes: BoothNote[],
  boothNameById: Record<string, string>,
  limit = 4,
): OutcomeCard[] {
  const eligible = notes.filter((n) => n.interest && n.verdict);
  const sorted = [...eligible].sort((a, b) => {
    const aConf = a.judgedClass === "confident" ? 0 : 1;
    const bConf = b.judgedClass === "confident" ? 0 : 1;
    return aConf - bConf;
  });
  return sorted.slice(0, limit).map((n) => ({
    boothId: n.boothId,
    boothName: boothNameById[n.boothId] ?? n.boothId,
    interest: n.interest as "must" | "curious" | "pass",
    verdict: n.verdict as "good" | "ok" | "bad",
    kind: classifyOutcome(
      n.interest as "must" | "curious" | "pass",
      n.verdict as "good" | "ok" | "bad",
    ),
  }));
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/memory/retro-outcomes.test.ts`
Expected: PASS(9개 전부)

- [ ] **Step 5: 검증 + 커밋**

```bash
npx tsc --noEmit 2>&1 | grep "memory/retro-outcomes"
npx vitest run
npx eslint src/lib/memory/retro-outcomes.ts src/lib/memory/retro-outcomes.test.ts
git add src/lib/memory/retro-outcomes.ts src/lib/memory/retro-outcomes.test.ts
git commit -m "feat(recap): 예측-결과 대조 순수 함수 추가

관심(interest)과 실제 판정(verdict)이 둘 다 있는 부스를 적중/반전으로
나누는 로직을 순수 함수로 분리한다. 다음 태스크에서 회고 API가 이 함수로
카드를 계산한다."
```

---

### Task 2: `GET /api/me/recap` 확장

**Files:**
- Modify: `src/app/api/me/recap/route.ts`

**Interfaces:**
- Consumes: Task 1의 `buildOutcomeCards`. 기존 `repo.listBoothsByExhibitionId(exhibitionId): Promise<Booth[]>`, `repo.listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]>`(D2에서 추가됨), `ensureLatestRecap(userId): Promise<VisitDigest|null>`(기존).
- Produces: `GET /api/me/recap` 응답이 `{data: {visit, question}}`에서 `{data: {visit, question, outcomeCards}}`로 확장. `outcomeCards: OutcomeCard[]`(`visit`이 null이면 빈 배열).

- [ ] **Step 1: 구현**

`src/app/api/me/recap/route.ts` 전체를 다음으로 교체:

```ts
import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { ensureLatestRecap, readBrain } from "@/lib/memory/service";
import { nextReflectQuestion } from "@/lib/memory/reflect-questions";
import { buildOutcomeCards } from "@/lib/memory/retro-outcomes";
import { getRepository } from "@/lib/repositories";

// 최근 관람 회고(Companion 서술) + 이번에 물을 질문 하나 + 예측-결과 대조 카드.
// 회고는 "오늘 이랬어"로 끝나면 안 되고, 클릭으로 알 수 없는 걸 하나 물어
// 다음 전시를 더 잘 고르게 해야 한다(관람 아크의 '후'). 질문은 아직 답하지
// 않은 것 중 하나 — 다 채워졌으면 null이고 그때는 더 묻지 않는다.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const [visit, brain] = await Promise.all([
    ensureLatestRecap(user.id),
    readBrain(user.id),
  ]);

  let outcomeCards: ReturnType<typeof buildOutcomeCards> = [];
  if (visit) {
    const repo = await getRepository();
    const booths = await repo.listBoothsByExhibitionId(visit.exhibitionId);
    const boothIds = booths.map((b) => b.id);
    const notes = await repo.listNotesByBoothIds(boothIds);
    const boothNameById: Record<string, string> = {};
    for (const b of booths) boothNameById[b.id] = b.name;
    outcomeCards = buildOutcomeCards(notes, boothNameById);
  }

  return ok({
    data: { visit, question: nextReflectQuestion(brain), outcomeCards },
  });
}
```

- [ ] **Step 2: 검증 + 커밋**

이 라우트 파일엔 기존에도 테스트가 없다(admin·me API 라우트 전반이 이 레포에서 유닛테스트 대상이 아니다) — 새로 만들지 않는다.

```bash
npx tsc --noEmit 2>&1 | grep "api/me/recap"
npx vitest run
npx eslint src/app/api/me/recap/route.ts
git add src/app/api/me/recap/route.ts
git commit -m "feat(recap): 회고 API가 예측-결과 카드도 같이 내려줌

방문 전시의 부스·노트를 조회해 Task 1의 순수 함수로 카드를 계산한다.
관람 기록이 없으면(visit null) 빈 배열."
```

---

### Task 3: 카드 UI + 로미 대사 + RecapSheet 연결

**Files:**
- Create: `src/components/route/visit-outcome-cards.tsx`
- Modify: `src/lib/i18n/dictionaries.ts`(`recap` 네임스페이스, ko 646번째 줄 근처 + en 1296번째 줄 근처)
- Modify: `src/components/route/recap-sheet.tsx`

**Interfaces:**
- Consumes: Task 1의 `OutcomeCard` 타입. `useT()`(`@/lib/i18n/provider`, 이미 구현됨 — `t(key, params?)`가 배열 값이면 무작위 선택은 `resolve.ts`가 이미 처리한다).
- Produces: `VisitOutcomeCards({cards: OutcomeCard[]}): JSX.Element` — 내부에서 스텝 관리, 완료 후에도 별도 콜백 없음(게이트 없이 항상 마운트라 "완료" 개념이 필요 없다 — 마지막 카드에서 "확인" 누르면 그냥 사라진다).

- [ ] **Step 1: i18n 카피 추가**

`src/lib/i18n/dictionaries.ts`의 ko `recap` 블록(646번째 줄 근처, `finishing: "..."` 다음 줄)에 추가:

```ts
    outcomeHit: [
      "‘{booth}’, 역시 네 말이 맞았네.",
      "‘{booth}’ — 딱 네가 생각한 대로였어.",
      "‘{booth}’, 그 느낌 정확했다.",
      "‘{booth}’는 예상 그대로였어.",
    ],
    outcomeReversal: [
      "‘{booth}’, 이건 좀 의외였지?",
      "‘{booth}’ — 생각이랑 다르게 흘러갔네.",
      "‘{booth}’, 예상 밖이었어.",
      "‘{booth}’는 뜻밖이었네.",
    ],
    outcomeNext: "다음",
    outcomeDone: "확인",
```

en `recap` 블록(1296번째 줄 근처, `finishing: "..."` 다음 줄)에 추가:

```ts
    outcomeHit: [
      "“{booth}” — you called it.",
      "“{booth}”, exactly what you expected.",
      "“{booth}” turned out just like you thought.",
      "“{booth}” — your instinct was right.",
    ],
    outcomeReversal: [
      "“{booth}” — that one surprised you.",
      "“{booth}”, didn't go the way you thought.",
      "“{booth}” was unexpected.",
      "“{booth}” — plot twist.",
    ],
    outcomeNext: "Next",
    outcomeDone: "Got it",
```

- [ ] **Step 2: 카드 컴포넌트 작성**

`src/components/route/visit-outcome-cards.tsx` 전체 내용:

```tsx
"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import type { OutcomeCard } from "@/lib/memory/retro-outcomes";

/**
 * "네 예측이 맞았는지" 탭-넘김 카드. app-onboarding.tsx의 GuideSlide와 같은
 * 인터랙션(진행 점 + 다음 버튼) — 이 프로젝트에서 이미 검증된 "짧은 단계
 * 훑기" 패턴을 그대로 재사용한다. 게이트 없이 항상 마운트되므로 별도 완료
 * 콜백은 없다 — 마지막 카드에서 "확인"을 누르면 그냥 사라진다.
 */
export function VisitOutcomeCards({ cards }: { cards: OutcomeCard[] }) {
  const t = useT();
  const [step, setStep] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  if (cards.length === 0 || dismissed) return null;

  const current = cards[Math.min(step, cards.length - 1)];
  const isLast = step === cards.length - 1;
  const line = t(`recap.${current.kind === "hit" ? "outcomeHit" : "outcomeReversal"}`, {
    booth: current.boothName,
  });

  return (
    <div className="mb-3 rounded-2xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-1.5">
        {cards.map((_, i) => (
          <span
            key={i}
            className={
              "h-1 flex-1 rounded-full transition-colors " +
              (i <= step ? "bg-primary" : "bg-secondary")
            }
          />
        ))}
      </div>
      <p className="text-[15px] font-medium leading-relaxed">{line}</p>
      <button
        type="button"
        onClick={() => (isLast ? setDismissed(true) : setStep(step + 1))}
        className="mt-3 w-full rounded-xl bg-primary py-2.5 text-center text-sm font-bold text-primary-foreground active:scale-[0.99]"
      >
        {isLast ? t("recap.outcomeDone") : t("recap.outcomeNext")}
      </button>
    </div>
  );
}
```

- [ ] **Step 3: `RecapSheet`에 연결**

`src/components/route/recap-sheet.tsx`에서 import 목록에 추가:

```tsx
import { VisitOutcomeCards } from "@/components/route/visit-outcome-cards";
import type { OutcomeCard } from "@/lib/memory/retro-outcomes";
```

`VisitDigest` state 옆에 새 state 추가(기존 `const [visit, setVisit] = useState<VisitDigest | null>(null);` 바로 뒤):

```tsx
  const [outcomeCards, setOutcomeCards] = useState<OutcomeCard[]>([]);
```

`useEffect` 안의 `.then((r) => { ... })` 블록을 다음으로 교체(기존 `setVisit`/`setQuestion` 두 줄 다음에 한 줄 추가):

```tsx
      .then((r) => {
        if (cancelled) return;
        setVisit(r.data.visit);
        setQuestion(r.data.question);
        setOutcomeCards(r.data.outcomeCards);
      })
```

API 응답 타입 힌트도 갱신 — 기존:

```tsx
      .get<{ data: { visit: VisitDigest | null; question: ReflectQuestion | null } }>(
        "/api/me/recap",
      )
```

를 다음으로 교체:

```tsx
      .get<{
        data: {
          visit: VisitDigest | null;
          question: ReflectQuestion | null;
          outcomeCards: OutcomeCard[];
        };
      }>("/api/me/recap")
```

서사 박스(`<div className="mt-4 rounded-2xl border border-primary/25 bg-accent/40 p-4">`) 바로 위에 추가:

```tsx
        {!loading && outcomeCards.length > 0 && (
          <div className="mt-4">
            <VisitOutcomeCards cards={outcomeCards} />
          </div>
        )}
```

(`mt-4`는 기존 서사 박스가 이미 갖고 있던 값과 같게 맞춘다 — 카드 섹션이 있으면 그 아래 서사 박스는 자연히 이어붙는다. 카드 섹션 자체는 로딩 중엔 안 보여준다 — `!loading` 가드로 깜빡임을 막는다.)

- [ ] **Step 4: 검증**

이 컴포넌트들은 다른 회고 관련 컴포넌트(`RecapSheet`, `VisitedRetroPrompt`)와 마찬가지로 유닛테스트가 없다 — 새로 만들지 않는다.

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/route/visit-outcome-cards.tsx src/components/route/recap-sheet.tsx src/lib/i18n/dictionaries.ts
```

- [ ] **Step 5: 수동 확인(선택, 가능하면)**

`npx next dev`로 mock 모드 실행 후, 부스 몇 개에 interest+verdict를 모두 남긴 상태로 "오늘 관람 마치기" → 회고 시트에서 카드가 뜨고 탭으로 넘어가는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/components/route/visit-outcome-cards.tsx src/lib/i18n/dictionaries.ts src/components/route/recap-sheet.tsx
git commit -m "feat(recap): 예측-결과 카드를 회고 시트에 렌더

서사 바로 위에 탭-넘김 카드를 얹는다. 대상 부스가 없으면 섹션 자체가
안 뜬다 — 회고 화면의 나머지 흐름은 지금과 똑같이 진행된다."
```

---

## 자기 점검 결과

- **스펙 커버리지**: 스펙의 세 아키텍처 항목(분류 로직·API 확장·UI) 모두 Task 1~3에 1:1 대응. "대상 부스는 둘 다 있어야", "2단계만", "최대 3~4개+confident 우선", "탭으로만", "0개면 미표시", "서사 바로 위, 게이트 없음" 여섯 확정 사항 모두 Global Constraints에 반영되고 각 태스크 구현이 그대로 따른다.
- **플레이스홀더 스캔**: 없음 — 모든 코드가 실제 파일 경로·실제 함수 시그니처를 참조.
- **타입 일관성**: `OutcomeCard`(Task 1 정의) → Task 2(API 응답 타입)·Task 3(`VisitOutcomeCards` props, `RecapSheet` state) 동일 형태로 소비. `classifyOutcome`/`buildOutcomeCards` 시그니처가 세 태스크 전체에서 일치.
- **범위 점검**: 3태스크 모두 단일 관심사 + 독립 테스트 가능. Task 1(순수 함수)→Task 2(API, Task1 소비)→Task 3(UI, Task1+2 소비) 순서가 각 태스크를 앞 태스크 없이는 테스트 불가능하게 만들지 않는다(Task 1은 완전 독립, Task 2는 Task 1만 있으면 수동 확인 가능, Task 3는 Task 1+2 완료 후 전체 흐름 확인 가능).
