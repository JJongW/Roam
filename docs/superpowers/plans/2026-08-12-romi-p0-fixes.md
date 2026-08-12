# 로미 P0 개선(회고 게이트·근거 침묵·가짜 크라우드) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사용자 브리프의 P0 세 항목을 처리한다 — (1) 피드를 다 비워도 회고로 못 가는 버그, (2) enrichment 없는 부스에서 로미가 완전 침묵하는 문제, (3) 크라우드 데이터가 없는데 있다고 말하는 컴패니언 답변.

**Architecture:** (1)은 회고 버튼 노출 조건을 "피드에 남은 게 있나"에서 "이번 전시에서 판단을 남겼나"로 바꾼다. (2)는 `grounding.ts`의 사실 사다리 맨 끝에 회사명 폴백을 추가해 `why`가 절대 빈 문자열이 되지 않게 하고, `curate.ts`의 근거 링크를 1회 제한에서 최대 2회(서로 다른 부스 인용)로 완화한다 — 근거 링크 선택 로직을 순수 함수로 뽑아 테스트 가능하게 만든다. (3)은 사실과 다른 컴패니언 답변 문구를 정직하게 고친다.

**Tech Stack:** Next.js 16(App Router) · React 19 · TypeScript · vitest

## 절대 규칙 (모든 태스크에 적용)

- speed rule 유지 — 이번 변경 셋 다 LLM을 새로 핫패스에 넣지 않는다(순수 함수·정적 카피만).
- 가치 이름("발견 쪽 부스야")을 로미 발화에 쓰지 않는다 — 이미 지켜지고 있고, 이번 변경도 그 원칙을 안 깬다.
- 빈말 금지는 유지하되, "침묵"이 아니라 "가진 사실로 최소한을 말한다"가 목표다 — 근거 없는 관계형 링크(내가 안 누른 부스와 엮기)는 여전히 금지, 사실(fact)만 항상 뭐라도 말하게 한다.
- i18n은 ko·en 양쪽 다 채운다.
- 주석은 한국어, 무엇을 하는지가 아니라 왜 그런지를 쓴다.
- 새 npm 의존성을 추가하지 않는다.
- 검증 3종은 매 태스크 끝에: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <바뀐 경로>`.

---

### Task 1: 회고(마치기) 버튼 게이트 수정

**Files:**
- Modify: `src/app/(visitor)/exhibitions/[slug]/page.tsx:243`

**Interfaces:**
- Consumes: 이미 이 파일에 있는 `taste`(81-84번째 줄, `{judgedCount: number; pct: number|null}`).
- Produces: 없음(렌더 조건만 바뀐다).

- [ ] **Step 1: 구현**

`src/app/(visitor)/exhibitions/[slug]/page.tsx`의 243번째 줄 근처, 기존:

```tsx
          {feedItems.length > 0 && <FinishVisit slug={slug} />}
```

를 다음으로 교체:

```tsx
          {/* 피드를 다 비워도(성실히 판단 다 함) 회고로 못 가면 안 된다 — "판단이
              하나라도 있었나"로 게이트를 바꾼다. feedItems가 남았는지는 회고와
              무관하다(로미 P0 브리프 §1). */}
          {user && taste.judgedCount > 0 && <FinishVisit slug={slug} />}
```

- [ ] **Step 2: 검증 + 커밋**

이 페이지 컴포넌트엔 기존에도 테스트가 없다(방문객 페이지 전반이 이 프로젝트에서 유닛테스트 대상이 아니다) — 새로 만들지 않는다.

```bash
npx tsc --noEmit 2>&1 | grep "exhibitions/\[slug\]/page"
npx vitest run
npx eslint "src/app/(visitor)/exhibitions/[slug]/page.tsx"
git add "src/app/(visitor)/exhibitions/[slug]/page.tsx"
git commit -m "fix(feed): 피드를 다 비워도 회고로 갈 수 있게

'추천이 남았나'가 아니라 '이번 전시에서 판단을 남겼나'로 마치기 버튼
노출 조건을 바꾼다. 가장 몰입한 사용자(피드를 성실히 다 소진한 사람)가
회고에 못 가던 문제였다."
```

---

### Task 2: 컴패니언 크라우드 답변 정정

**Files:**
- Modify: `src/lib/i18n/dictionaries.ts`(`companion` 네임스페이스, ko 645번째 줄 + en 1312번째 줄)

**Interfaces:**
- Consumes: 없음.
- Produces: 없음(카피 텍스트만 변경).

- [ ] **Step 1: 구현**

`src/lib/i18n/dictionaries.ts`의 ko `companion` 블록(645번째 줄), 기존:

```ts
    a2: "부스마다 붐빔 정도를 큐로 붙여놨어. '한산'·'적당히' 위주로 돌면 여유로워. 붐비는 곳은 이른/늦은 시간대에.",
```

를 다음으로 교체:

```ts
    // 동선 제품 제거로 크라우드 소스(saved route)가 사라져 부스별 붐빔 데이터가
    // 없다(src/lib/engine/service.ts — heat.booths 항상 빈 스텁). 없는 걸 있다고
    // 말하면 안 된다 — 정직하게 고쳐 말할 수 있는 것(개장 직후·마감 직전이 대체로
    // 한산하다는 일반 팁)만 남긴다.
    a2: "지금은 부스별 실시간 혼잡도까진 못 봐. 대신 개장 직후나 마감 전 시간대가 대체로 한산해.",
```

en `companion` 블록(1312번째 줄), 기존:

```ts
    a2: "I tagged each booth's crowd level. Stick to 'quiet' or 'moderate' for ease; hit busy ones early or late.",
```

를 다음으로 교체:

```ts
    a2: "I can't see real-time crowd levels per booth yet. As a rule of thumb, right after opening or just before closing tends to be quieter.",
```

- [ ] **Step 2: 검증 + 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/i18n/dictionaries.ts
git add src/lib/i18n/dictionaries.ts
git commit -m "fix(companion): 없는 크라우드 데이터를 있다고 말하던 답변 정정

동선 제품이 빠지면서 부스별 혼잡도 소스(heat.booths)가 영구 빈 스텁이
됐는데, 컴패니언 캔 답변은 여전히 '붐빔 정도를 큐로 붙여놨어'라고
말하고 있었다. 사실과 다른 말을 하고 있었다."
```

---

### Task 3: 근거 카드 침묵 제거 — 사실 사다리 확장 + 근거 링크 다회 인용

**Files:**
- Modify: `src/lib/feed/grounding.ts`
- Modify: `src/lib/i18n/dictionaries.ts`(`grounding` 네임스페이스, ko 424번째 줄 근처 + en 1112번째 줄 근처)
- Test: `src/lib/feed/grounding.test.ts`
- Modify: `src/lib/feed/curate.ts`
- Test: `src/lib/feed/curate.test.ts`

**Interfaces:**
- Consumes: `Booth`(`@/lib/types`, `company: string`은 필수 필드라 항상 존재). `boothValueSlugs(booth): string[]`(`@/lib/values`, 이미 구현됨).
- Produces: `createLinkPicker(positives: {booth: Booth; kind: "must"|"curious"|"good"}[], maxUses?: number): (booth: Booth) => {name: string; kind: "must"|"curious"|"good"} | undefined` — `curate.ts`에서 export.

- [ ] **Step 1: i18n 카피 추가**

`src/lib/i18n/dictionaries.ts`의 ko `grounding` 블록(424번째 줄 근처, `whatGoods: "..."` 다음 줄)에 추가:

```ts
    // 저작·공식 정보가 전혀 없어도 이거 하나는 항상 말할 수 있다(company는 필수
    // 필드) — 침묵 카드를 만들지 않기 위한 마지막 폴백.
    whatCompanyFallback: "‘{name}’ 부스야",
```

en `grounding` 블록(1112번째 줄 근처, `whatGoods: "..."` 다음 줄)에 추가:

```ts
    whatCompanyFallback: "It's the ‘{name}’ booth",
```

- [ ] **Step 2: `grounding.ts` 실패하는 테스트 수정**

`src/lib/feed/grounding.test.ts`의 78-84번째 줄(기존 "빈말을 만들지 않는다" 테스트)을 찾아 전체를 다음으로 교체:

```ts
  it("저작·공식 정보가 전혀 없어도 회사명으로 최소한을 말한다 — 침묵 카드를 만들지 않는다", () => {
    const b = booth(undefined, "무명출판");
    const g = buildGrounding(b, ["learning"]);
    expect(g.confidence).toBe("low");
    expect(g.what).toBe("무명출판");
    expect(g.why).toContain("무명출판");
  });
```

- [ ] **Step 3: 테스트 실패 확인**

Run: `npx vitest run src/lib/feed/grounding.test.ts`
Expected: FAIL — `g.why`가 여전히 `""`(빈 문자열)이라 `toContain("무명출판")` 실패.

- [ ] **Step 4: `grounding.ts` 구현**

`src/lib/feed/grounding.ts`의 `fact` 계산 블록, 기존:

```ts
  const fact =
    e?.roamInterpretation ??
    (matchedReasons.length > 0
      ? matchedReasons.slice(0, 2).join(" ")
      : e?.summary
        ? summaryClause(e.summary, 70)
        : e?.goodsKeywords?.[0]
          ? t("grounding.whatGoods", { goods: e.goodsKeywords[0] })
          : null);
```

를 다음으로 교체:

```ts
  const fact =
    e?.roamInterpretation ??
    (matchedReasons.length > 0
      ? matchedReasons.slice(0, 2).join(" ")
      : e?.summary
        ? summaryClause(e.summary, 70)
        : e?.goodsKeywords?.[0]
          ? t("grounding.whatGoods", { goods: e.goodsKeywords[0] })
          : t("grounding.whatCompanyFallback", { name: booth.company }));
```

파일 상단(1-7번째 줄)의 주석 중 "둘 다 없으면 한 줄을 비운다(빈말 금지)."를 다음으로 교체(그 앞 문장들은 그대로 둔다):

```
// 1절(사실)은 저작·공식 정보가 없어도 회사명으로 최소한을 말한다 — 부스가 뭔지
// 말 못 하는 침묵 카드를 만들지 않는다. 2절(근거)은 여전히 내가 실제로 반응한
// 부스와 가치가 겹칠 때만 붙는다 — 없는 근거를 지어내진 않는다.
```

- [ ] **Step 5: `grounding.ts` 테스트 통과 확인**

Run: `npx vitest run src/lib/feed/grounding.test.ts`
Expected: PASS(전체)

- [ ] **Step 6: `curate.ts` 실패하는 테스트 작성**

`src/lib/feed/curate.test.ts` 파일 끝에 추가:

```ts
describe("createLinkPicker — 근거 링크는 최대 N회, 서로 다른 부스를 인용", () => {
  function taggedBooth(id: string, slug: string): Booth {
    return {
      id,
      exhibitionId: "e1",
      hallId: "h1",
      categoryId: "c1",
      name: `부스-${id}`,
      company: `회사-${id}`,
      description: "",
      longDescription: "",
      images: [],
      tags: [slug],
      x: 0,
      y: 0,
      popularity: 0,
    } as unknown as Booth;
  }

  it("겹치는 가치의 과거 긍정 반응이 있으면 링크를 만든다", () => {
    const past = taggedBooth("past1", "discovery");
    const candidate = taggedBooth("cand1", "discovery");
    const pick = createLinkPicker([{ booth: past, kind: "must" }]);
    expect(pick(candidate)).toEqual({ name: "부스-past1", kind: "must" });
  });

  it("겹치는 가치가 없으면 링크를 안 만든다 — 억지 근거 금지", () => {
    const past = taggedBooth("past1", "discovery");
    const candidate = taggedBooth("cand1", "social");
    const pick = createLinkPicker([{ booth: past, kind: "must" }]);
    expect(pick(candidate)).toBeUndefined();
  });

  it("기본 최대 2회까지만 링크를 만들고, 그 다음부턴 undefined", () => {
    const past1 = taggedBooth("past1", "discovery");
    const past2 = taggedBooth("past2", "discovery");
    const past3 = taggedBooth("past3", "discovery");
    const pick = createLinkPicker([
      { booth: past1, kind: "must" },
      { booth: past2, kind: "curious" },
      { booth: past3, kind: "good" },
    ]);
    const c1 = taggedBooth("cand1", "discovery");
    const c2 = taggedBooth("cand2", "discovery");
    const c3 = taggedBooth("cand3", "discovery");
    expect(pick(c1)).toBeDefined();
    expect(pick(c2)).toBeDefined();
    expect(pick(c3)).toBeUndefined();
  });

  it("이미 인용한 과거 부스는 다시 인용하지 않는다 — 서로 다른 부스로", () => {
    const past1 = taggedBooth("past1", "discovery");
    const past2 = taggedBooth("past2", "discovery");
    const pick = createLinkPicker([
      { booth: past1, kind: "must" },
      { booth: past2, kind: "curious" },
    ]);
    const c1 = taggedBooth("cand1", "discovery");
    const c2 = taggedBooth("cand2", "discovery");
    const first = pick(c1);
    const second = pick(c2);
    expect(first?.name).not.toBe(second?.name);
  });

  it("maxUses를 명시하면 그 값을 따른다", () => {
    const past1 = taggedBooth("past1", "discovery");
    const pick = createLinkPicker([{ booth: past1, kind: "must" }], 0);
    expect(pick(taggedBooth("cand1", "discovery"))).toBeUndefined();
  });
});
```

- [ ] **Step 7: 테스트 실패 확인**

Run: `npx vitest run src/lib/feed/curate.test.ts`
Expected: FAIL — `createLinkPicker`가 아직 export 안 됨.

- [ ] **Step 8: `curate.ts` 구현**

`src/lib/feed/curate.ts`의 `hasFact`/`becauseOf` 정의 블록(159-181번째 줄 근처), 기존:

```ts
  // 근거는 피드에서 **한 번만** 말한다. 여섯 장에 다 붙이면 "아까 X에 끌림 눌러서"가
  // 여섯 번 반복돼, 라벨만 다르고 본문은 같던 예전 문제로 되돌아간다. 그리고 부스가
  // 무엇인지 말할 수 없는 카드엔 붙이지 않는다 — 근거만 덩그러니 남으면 이 부스가
  // 뭔지도 모른 채 이유만 듣는 꼴이다.
  let linkUsed = false;
  const hasFact = (b: Booth) =>
    Boolean(
      b.enrichment?.roamInterpretation ||
      b.enrichment?.summary ||
      b.enrichment?.goodsKeywords?.length,
    );
  const becauseOf = (booth: Booth) => {
    if (linkUsed || !hasFact(booth)) return undefined;
    const vals = new Set(boothValueSlugs(booth));
    const hit = positives.find(
      (p) =>
        p.booth.id !== booth.id &&
        boothValueSlugs(p.booth).some((v) => vals.has(v)),
    );
    if (!hit) return undefined;
    linkUsed = true;
    return { name: hit.booth.name, kind: hit.kind };
  };
```

를 다음으로 교체:

```ts
  // 근거는 피드 하나당 최대 MAX_LINK_USES번만 말하고, 매번 서로 다른 과거 반응
  // 부스를 인용한다 — 여섯 장에 다 같은 근거를 붙이면 라벨만 다르고 본문은 같던
  // 예전 문제로 되돌아간다. "부스가 무엇인지 말할 수 없는 카드엔 안 붙인다"는
  // 예전 제약은 뺐다 — grounding.ts가 이제 회사명 폴백으로 항상 사실을 말하므로
  // (fact 없는 카드가 더는 없다), 근거 링크를 그 여부에 묶을 이유가 없어졌다.
  const becauseOf = createLinkPicker(positives);
```

`createLinkPicker`를 파일에 새로 추가한다 — `positiveNotes` 함수 정의 바로 뒤(46번째 줄 근처)에 삽입:

```ts
/**
 * 근거 링크 선택기 — 후보 부스와 가치가 겹치는 과거 긍정 반응 중 하나를 고른다.
 * 같은 과거 부스를 두 번 인용하지 않고(서로 다른 근거로 서로 다른 카드), 피드
 * 하나당 최대 maxUses번까지만 링크를 만든다. 순수 클로저, 테스트 가능.
 */
export function createLinkPicker(
  positives: { booth: Booth; kind: "must" | "curious" | "good" }[],
  maxUses = 2,
): (booth: Booth) => { name: string; kind: "must" | "curious" | "good" } | undefined {
  const usedBoothIds = new Set<string>();
  let uses = 0;
  return (booth: Booth) => {
    if (uses >= maxUses) return undefined;
    const vals = new Set(boothValueSlugs(booth));
    const hit = positives.find(
      (p) =>
        p.booth.id !== booth.id &&
        !usedBoothIds.has(p.booth.id) &&
        boothValueSlugs(p.booth).some((v) => vals.has(v)),
    );
    if (!hit) return undefined;
    usedBoothIds.add(hit.booth.id);
    uses++;
    return { name: hit.booth.name, kind: hit.kind };
  };
}
```

- [ ] **Step 9: 테스트 통과 확인**

Run: `npx vitest run src/lib/feed/curate.test.ts src/lib/feed/grounding.test.ts`
Expected: PASS(전체)

- [ ] **Step 10: 검증 + 커밋**

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/lib/feed/grounding.ts src/lib/feed/grounding.test.ts src/lib/feed/curate.ts src/lib/feed/curate.test.ts src/lib/i18n/dictionaries.ts
git add src/lib/feed/grounding.ts src/lib/feed/grounding.test.ts src/lib/feed/curate.ts src/lib/feed/curate.test.ts src/lib/i18n/dictionaries.ts
git commit -m "fix(feed): 근거 카드 침묵 제거 — 회사명 폴백 + 근거 링크 다회 인용

enrichment가 하나도 없는 부스는 로미가 완전히 침묵했다(SIF 914부스 저작
0%). 사실 사다리 맨 끝에 회사명 폴백을 추가해 침묵 카드를 없앤다. 근거
링크(내가 실제로 반응한 부스와 엮기)도 fact 유무 게이트가 필요 없어져
빼고, 1회 제한을 최대 2회(서로 다른 부스 인용)로 늘렸다. 선택 로직은
createLinkPicker로 뽑아 순수 함수로 테스트한다."
```

---

## 자기 점검 결과

- **스펙 커버리지**: 브리프의 P0 세 항목(회고 게이트·근거 침묵·가짜 크라우드) 모두 Task 1~3에 1:1 대응. "분야 라벨(tier 5)은 생략하고 회사명 폴백(tier 6)만" 확정 사항이 Task 3에 반영됨. hasFact 게이트 제거·linkUsed 다회화·서로 다른 부스 인용·가치 안 겹치면 링크 없음(빈말 금지 유지) 네 가지 브리프 요구사항 모두 Task 3의 테스트로 커버.
- **플레이스홀더 스캔**: 없음 — 모든 코드가 실제 파일 경로·실제 함수 시그니처를 참조.
- **타입 일관성**: `createLinkPicker`의 반환 타입(`{name, kind} | undefined`)이 `buildGrounding`의 `because` 매개변수 타입과 정확히 일치(둘 다 `{name: string; kind: "must"|"curious"|"good"}`).
- **범위 점검**: 3태스크 모두 독립적으로 커밋 가능. Task 1·2는 서로 무관(순서 안 중요). Task 3은 grounding.ts(fact 사다리)와 curate.ts(link 다회화)가 "why가 이제 항상 채워진다"는 전제를 공유해 한 태스크로 묶었다 — grounding.ts만 먼저 배포하면 hasFact 게이트가 무의미해진 채로 남아 혼란스럽다.
- **브리프의 R1~R4(로드맵)는 이 계획에 포함하지 않는다** — 브리프 자체가 "설계 먼저, 각 항목 docs/decisions/에 결정 문서부터"라고 명시했다. P0 세 개가 끝난 뒤 별도로 다룬다.
