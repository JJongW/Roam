# 부스 저작 필드 admin 편집 + 데이터 이슈 딥링크 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `/admin/errors`가 결측으로 지목하는 부스 저작 필드 6종을 admin 부스 편집
시트에서 직접 채울 수 있게 하고, 데이터 이슈 목록에서 그 부스 편집으로 바로 이동하는
딥링크를 연결한다.

**Architecture:** Repository에 `upsertBoothEnrichment` 신설(Mock 얕은 병합, Supabase는
`booth_enrichment` UPSERT — 기존 `upsertWelcomeKit` 패턴 그대로 복제). PATCH
`/api/booths/[id]`가 booth 필드 갱신 뒤 enrichment도 이어서 쓴다. 편집 시트에 4번째
섹션을 추가하고, 데이터 이슈 목록 항목이 `?edit=<id>` 쿼리파람으로 그 시트를 연다.

**Tech Stack:** Next.js 16 App Router, React 19, TypeScript, Zod, Tailwind v4, shadcn/ui,
Vitest.

## Global Constraints

- 검증은 매 태스크: `npx tsc --noEmit` · `npx vitest run` · `npx eslint <changed paths>`.
- 새 순수 함수는 반드시 테스트 동반(TDD: 실패하는 테스트 먼저).
- Supabase 컬럼명: `value_tags`·`recommendation_reasons`·`things_to_do`·`timing`·
  `memory_hooks`·`summary`(전부 `booth_enrichment` 테이블, `booth_id` 컬럼이 FK).
  운영 DB 접근 없이 코드 리뷰로만 검증(기존 세션 관례).
- UI 텍스트는 한국어, 기존 톤 유지.
- 가치 태그 강도(strength)는 고정값 `0.8` — 슬라이더 없음.
- 배경 스펙: `docs/decisions/2026-08-17_booth-enrichment-authoring-design.md`.

---

### Task 1: 스키마 + Repository 인터페이스 + Mock 구현 (TDD)

**Files:**
- Modify: `src/lib/schemas/index.ts`
- Modify: `src/lib/repositories/types.ts:32-43` (import), `:77` (인터페이스)
- Modify: `src/lib/mock/repository.ts`
- Test: `src/lib/mock/repository.test.ts`

**Interfaces:**
- Produces: `boothEnrichmentAuthorInputSchema`(Zod), `BoothEnrichmentAuthorInput`(타입,
  `src/lib/schemas`에서 export), `Repository.upsertBoothEnrichment(boothId: string, input:
  BoothEnrichmentAuthorInput): Promise<void>`. Task 2(Supabase 구현)·Task 3(API)·
  Task 5(UI)가 이 시그니처를 그대로 가져다 쓴다.

- [ ] **Step 1: 스키마 추가**

`src/lib/schemas/index.ts`의 `boothInputSchema` 정의(`export const boothInputSchema = ...`)
바로 뒤에 추가:
```ts
export const boothEnrichmentAuthorInputSchema = z.object({
  summary: z.string().max(300).default(""),
  valueTags: z
    .array(z.object({ slug: z.string(), strength: z.number().min(0).max(1) }))
    .default([]),
  recommendationReasons: z.record(z.string(), z.string()).default({}),
  thingsToDo: z.array(z.string()).default([]),
  timing: z.array(z.string()).default([]),
  memoryHooks: z.array(z.string()).default([]),
});
export type BoothEnrichmentAuthorInput = z.infer<
  typeof boothEnrichmentAuthorInputSchema
>;

export const boothPatchInputSchema = boothInputSchema.partial().extend({
  enrichment: boothEnrichmentAuthorInputSchema.optional(),
});
```

- [ ] **Step 2: Repository 인터페이스에 메서드 추가**

`src/lib/repositories/types.ts:32` 부근, `from "@/lib/schemas"` import 목록에
`BoothEnrichmentAuthorInput` 추가(알파벳 순서 신경 안 써도 됨, 기존 목록 아무 자리에나).

`:77` `updateBooth(...)` 줄 바로 아래에 추가:
```ts
  /** 저작 필드(근거 카드용 summary/valueTags/recommendationReasons/thingsToDo/
   *  timing/memoryHooks) 전체 교체 UPSERT — 부분 필드만 보내지 않는다(폼이 항상
   *  6개 전부를 함께 제출). */
  upsertBoothEnrichment(
    boothId: string,
    input: BoothEnrichmentAuthorInput,
  ): Promise<void>;
```

- [ ] **Step 3: 실패하는 테스트 작성**

`src/lib/mock/repository.test.ts`의 `it("getBooth: 존재하면...` 테스트 근처(같은
`describe("MockRepository", ...)` 블록 안 아무 곳)에 추가:
```ts
  it("upsertBoothEnrichment: 저작 필드를 채우고 기존 goodsKeywords는 보존한다", async () => {
    const before = await repo.getBooth("b_a1902");
    const goodsBefore = before!.enrichment?.goodsKeywords ?? [];

    await repo.upsertBoothEnrichment("b_a1902", {
      summary: "요약 문장",
      valueTags: [{ slug: "discovery", strength: 0.8 }],
      recommendationReasons: { discovery: "낯선 걸 발견하기 좋아" },
      thingsToDo: ["신간 훑기"],
      timing: ["오후 2시 사인회"],
      memoryHooks: ["파란 부스"],
    });

    const after = await repo.getBooth("b_a1902");
    expect(after!.enrichment?.summary).toBe("요약 문장");
    expect(after!.enrichment?.valueTags).toEqual([
      { slug: "discovery", strength: 0.8 },
    ]);
    expect(after!.enrichment?.recommendationReasons).toEqual({
      discovery: "낯선 걸 발견하기 좋아",
    });
    expect(after!.enrichment?.thingsToDo).toEqual(["신간 훑기"]);
    expect(after!.enrichment?.timing).toEqual(["오후 2시 사인회"]);
    expect(after!.enrichment?.memoryHooks).toEqual(["파란 부스"]);
    // 저작 필드가 아닌 기존 필드는 안 건드림
    expect(after!.enrichment?.goodsKeywords ?? []).toEqual(goodsBefore);
  });

  it("upsertBoothEnrichment: 빈 배열/빈 객체는 undefined로 저장한다(폼을 비우면 결측으로 되돌아감)", async () => {
    await repo.upsertBoothEnrichment("b_a1902", {
      summary: "",
      valueTags: [],
      recommendationReasons: {},
      thingsToDo: [],
      timing: [],
      memoryHooks: [],
    });
    const after = await repo.getBooth("b_a1902");
    expect(after!.enrichment?.summary).toBeUndefined();
    expect(after!.enrichment?.valueTags).toBeUndefined();
    expect(after!.enrichment?.recommendationReasons).toBeUndefined();
    expect(after!.enrichment?.thingsToDo).toBeUndefined();
    expect(after!.enrichment?.timing).toBeUndefined();
    expect(after!.enrichment?.memoryHooks).toBeUndefined();
  });
```

- [ ] **Step 4: 테스트 실패 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: FAIL — `repo.upsertBoothEnrichment is not a function`.

- [ ] **Step 5: Mock 구현**

`src/lib/mock/repository.ts`의 `updateBooth` 메서드(`async updateBooth(id, input) {...}`)
바로 뒤에 추가:
```ts
  async upsertBoothEnrichment(
    boothId: string,
    input: BoothEnrichmentAuthorInput,
  ): Promise<void> {
    const b = store().booths.find((x) => x.id === boothId);
    if (!b) return;
    b.enrichment = {
      ...(b.enrichment ?? { goodsKeywords: [], themeTags: [] }),
      summary: input.summary || undefined,
      valueTags: input.valueTags.length ? input.valueTags : undefined,
      recommendationReasons: Object.keys(input.recommendationReasons).length
        ? input.recommendationReasons
        : undefined,
      thingsToDo: input.thingsToDo.length ? input.thingsToDo : undefined,
      timing: input.timing.length ? input.timing : undefined,
      memoryHooks: input.memoryHooks.length ? input.memoryHooks : undefined,
    };
  }
```
파일 상단 import에 `BoothEnrichmentAuthorInput` 타입을 `@/lib/schemas`에서 가져오는
줄이 이미 있는 `import type { ... } from "@/lib/schemas"` 블록이 있으면 거기 추가하고,
없으면 새로 추가.

- [ ] **Step 6: 테스트 통과 확인**

Run: `npx vitest run src/lib/mock/repository.test.ts`
Expected: PASS, 새 테스트 2개 포함 전부 통과.

- [ ] **Step 7: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/lib/schemas/index.ts src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/mock/repository.test.ts`
Expected: 에러 없음.

- [ ] **Step 8: 커밋**

```bash
git add src/lib/schemas/index.ts src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/mock/repository.test.ts
git commit -m "feat(admin): 부스 저작 필드 스키마 + Repository 인터페이스 + Mock 구현

booth_enrichment에 쓰는 경로가 지금까지 아예 없었다(읽기만 있었음).
summary/valueTags/recommendationReasons/thingsToDo/timing/memoryHooks
6개를 한 번에 전체 교체하는 upsertBoothEnrichment를 신설한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 2: Supabase 구현

**Files:**
- Modify: `src/lib/supabase/repository.ts`

**Interfaces:**
- Consumes: `BoothEnrichmentAuthorInput`(Task 1), `wrote()`(기존, 파일 내부 헬퍼, 시그니처
  `wrote<T>(res: WriteResult<T>, what: string): T`).
- Produces: 없음(Repository 인터페이스 구현체, 다음 태스크 없음).

- [ ] **Step 1: 구현**

`src/lib/supabase/repository.ts`의 `upsertWelcomeKit` 메서드(`:825` 부근, `async
upsertWelcomeKit(...)`) 바로 뒤에 추가:
```ts
  async upsertBoothEnrichment(
    boothId: string,
    input: BoothEnrichmentAuthorInput,
  ): Promise<void> {
    const db = await this.db();
    const row = {
      booth_id: boothId,
      summary: input.summary,
      value_tags: input.valueTags,
      recommendation_reasons: input.recommendationReasons,
      things_to_do: input.thingsToDo,
      timing: input.timing,
      memory_hooks: input.memoryHooks,
    };
    const res = await db
      .from("booth_enrichment")
      .upsert(row, { onConflict: "booth_id" })
      .select("booth_id")
      .single();
    wrote(res, "부스 저작 정보 저장");
  }
```
파일 상단 import에 `BoothEnrichmentAuthorInput`을 `@/lib/schemas`에서 가져오는 줄에
추가(이미 `BoothInput` 등을 그 경로에서 import하고 있다).

**컬럼명 재확인(코드 리뷰용, 실행 안 함)**: `mapEnrichment`(`:137`)가 읽을 때 매핑하는
컬럼과 완전히 대칭인지 눈으로 대조 — `value_tags`(jsonb 배열)·`recommendation_reasons`
(jsonb 객체)·`things_to_do`/`timing`/`memory_hooks`(배열)·`summary`(문자열). 대칭 안 맞으면
멈추고 보고.

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/lib/supabase/repository.ts`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add src/lib/supabase/repository.ts
git commit -m "feat(admin): 부스 저작 필드 Supabase 쓰기 경로 추가

upsertWelcomeKit과 동일한 UPSERT(onConflict: booth_id) + wrote() 패턴.
읽기 매퍼(mapEnrichment)의 컬럼명과 대칭 확인.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 3: API 라우트 — PATCH가 enrichment도 같이 쓰기

**Files:**
- Modify: `src/app/api/booths/[id]/route.ts`

**Interfaces:**
- Consumes: `boothPatchInputSchema`(Task 1), `Repository.upsertBoothEnrichment`(Task 1
  인터페이스, Task 2 Supabase 구현).
- Produces: 없음(HTTP 엔드포인트, Task 5가 클라이언트에서 이 라우트를 호출).

- [ ] **Step 1: PATCH 핸들러 수정**

`src/app/api/booths/[id]/route.ts` 현재:
```ts
import { boothInputSchema } from "@/lib/schemas";
// ...
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, boothInputSchema.partial());
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const updated = await repo.updateBooth(id, parsed.data);
  if (!updated) return notFound();
  return ok({ booth: updated });
}
```

교체:
```ts
import { boothPatchInputSchema } from "@/lib/schemas";
// ...
export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, boothPatchInputSchema);
  if (!parsed.ok) return parsed.res;
  const { enrichment, ...boothFields } = parsed.data;
  const repo = await getRepository();
  const updated = await repo.updateBooth(id, boothFields);
  if (!updated) return notFound();
  if (enrichment) await repo.upsertBoothEnrichment(id, enrichment);
  return ok({ booth: updated });
}
```
`GET`·`DELETE` 핸들러는 안 건드린다. 파일 다른 곳에서 `boothInputSchema`를 더 쓰고
있으면(이 파일엔 없음, `PATCH`에서만 썼음) import를 완전히 안 지우고 필요한 것만 바꾼다
— 이 파일은 `PATCH`에서만 쓰므로 `boothInputSchema` import를 `boothPatchInputSchema`로
통째로 교체하면 된다.

- [ ] **Step 2: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/app/api/booths/[id]/route.ts`
Expected: 에러 없음.

- [ ] **Step 3: 커밋**

```bash
git add "src/app/api/booths/[id]/route.ts"
git commit -m "feat(admin): 부스 PATCH가 저작 필드(enrichment)도 함께 저장

한 번의 저장 요청으로 booth 테이블과 booth_enrichment 테이블을 같이
갱신한다 — 편집 시트에 저장 버튼 하나만 유지하기 위함.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 4: `splitLines` 순수 함수 + 테스트 (TDD)

**Files:**
- Create: `src/lib/admin/booth-filter.ts`에 함수 추가(새 파일 안 만듦 — 이미 부스 폼
  관련 순수 함수가 모여 있는 자리라 여기가 맞다)
- Test: `src/lib/admin/booth-filter.test.ts`에 테스트 추가

**Interfaces:**
- Produces: `splitLines(text: string): string[]`. Task 5가 이 함수를 가져다 쓴다.

- [ ] **Step 1: 실패하는 테스트 작성**

`src/lib/admin/booth-filter.test.ts` 맨 아래에 추가:
```ts
import { splitLines } from "./booth-filter"; // 기존 import 줄에 이름만 추가

describe("splitLines", () => {
  it("줄바꿈으로 나누고 각 줄을 trim한다", () => {
    expect(splitLines("신간 훑기\n  제작 과정 물어보기  \n")).toEqual([
      "신간 훑기",
      "제작 과정 물어보기",
    ]);
  });

  it("빈 줄은 뺀다", () => {
    expect(splitLines("한 줄\n\n\n다른 줄")).toEqual(["한 줄", "다른 줄"]);
  });

  it("빈 문자열은 빈 배열", () => {
    expect(splitLines("")).toEqual([]);
    expect(splitLines("   \n  ")).toEqual([]);
  });
});
```
(맨 위 `import { compareBoothsByCode, matchesBoothQuery } from "./booth-filter";` 줄이
이미 있으면 그 줄에 `splitLines`만 추가하고 새 import 줄을 만들지 않는다.)

- [ ] **Step 2: 테스트 실패 확인**

Run: `npx vitest run src/lib/admin/booth-filter.test.ts`
Expected: FAIL — `splitLines is not exported` 또는 `is not a function`.

- [ ] **Step 3: 구현**

`src/lib/admin/booth-filter.ts` 맨 아래에 추가:
```ts
/** 줄바꿈 구분 텍스트어리아 입력 → trim된 비어있지 않은 줄 배열.
 *  thingsToDo/timing/memoryHooks 저작 필드 입력에 쓴다. */
export function splitLines(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `npx vitest run src/lib/admin/booth-filter.test.ts`
Expected: PASS, 기존 테스트 포함 전부(splitLines 3개 추가).

- [ ] **Step 5: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/lib/admin/booth-filter.ts src/lib/admin/booth-filter.test.ts`
Expected: 에러 없음.

- [ ] **Step 6: 커밋**

```bash
git add src/lib/admin/booth-filter.ts src/lib/admin/booth-filter.test.ts
git commit -m "feat(admin): 줄바꿈 텍스트 → 배열 파싱 순수 함수 추가

thingsToDo/timing/memoryHooks 저작 필드 입력을 줄바꿈 텍스트어리아로
받기 위한 준비. 다음 커밋(편집 시트 UI)에서 소비한다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 5: 편집 시트 UI — 근거 카드 저작 섹션

**Files:**
- Modify: `src/components/admin/booth-manager.tsx`

**Interfaces:**
- Consumes: `splitLines`(Task 4, `@/lib/admin/booth-filter`),
  `boothEnrichmentAuthorInputSchema`(Task 1, `@/lib/schemas`), `VALUE_TAGS`(기존,
  `@/lib/values`, `{slug,label,color,icon,hint}[]`), `Chip`(기존, `@/components/ui/chip`,
  props `{variant?: "tint"|"outline", color?: string, icon?: ReactNode, onClick?, children}`),
  `Icon`(기존, `@/components/common/icon`, `{name: string, className?}`).
- Produces: 없음(최상위 UI, Task 6이 이 파일의 `startEdit`을 외부에서 트리거하도록 이어
  건드림).

- [ ] **Step 1: import 추가**

`src/components/admin/booth-manager.tsx` 상단 import 블록에 추가:
```ts
import { splitLines } from "@/lib/admin/booth-filter"; // 기존 compareBoothsByCode·matchesBoothQuery import 줄에 이름만 추가
import { boothEnrichmentAuthorInputSchema } from "@/lib/schemas"; // 기존 boothInputSchema import 줄에 이름만 추가
import { VALUE_TAGS } from "@/lib/values";
import { Chip } from "@/components/ui/chip";
import { Icon } from "@/components/common/icon";
```

- [ ] **Step 2: enrichmentDraft state 추가**

`:90` `const [tagsText, setTagsText] = useState("");` 바로 아래에 추가:
```ts
  const [enrichmentDraft, setEnrichmentDraft] = useState({
    summary: "",
    valueTags: [] as string[], // 체크된 slug만
    reasons: {} as Record<string, string>,
    thingsToDoText: "",
    timingText: "",
    memoryHooksText: "",
  });
```

- [ ] **Step 3: startCreate/startEdit에서 채우고 리셋**

`:118-138` 현재:
```ts
  function startCreate() {
    setEditing(null);
    setDraft({
      hallId: halls[0]?.id,
      categoryId: categories[0]?.id,
      x: 500,
      y: 350,
      popularity: 50,
      images: [],
    });
    setTagsText("");
    setShowPlacement(true);
    setOpen(true);
  }
  function startEdit(b: Booth) {
    setEditing(b);
    setDraft({ ...b });
    setTagsText((b.tags ?? []).join(", "));
    setShowPlacement(false);
    setOpen(true);
  }
```

교체:
```ts
  function startCreate() {
    setEditing(null);
    setDraft({
      hallId: halls[0]?.id,
      categoryId: categories[0]?.id,
      x: 500,
      y: 350,
      popularity: 50,
      images: [],
    });
    setTagsText("");
    setEnrichmentDraft({
      summary: "",
      valueTags: [],
      reasons: {},
      thingsToDoText: "",
      timingText: "",
      memoryHooksText: "",
    });
    setShowPlacement(true);
    setOpen(true);
  }
  function startEdit(b: Booth) {
    setEditing(b);
    setDraft({ ...b });
    setTagsText((b.tags ?? []).join(", "));
    const e = b.enrichment;
    const valueTags = (e?.valueTags ?? []).map((v) => v.slug);
    setEnrichmentDraft({
      summary: e?.summary ?? "",
      valueTags,
      reasons: e?.recommendationReasons ?? {},
      thingsToDoText: (e?.thingsToDo ?? []).join("\n"),
      timingText: (e?.timing ?? []).join("\n"),
      memoryHooksText: (e?.memoryHooks ?? []).join("\n"),
    });
    setShowPlacement(false);
    setOpen(true);
  }
```

- [ ] **Step 4: submit()이 enrichment도 검증·전송**

`:140-185`의 `async function submit() {` 본문, `const parsed = boothInputSchema.safeParse(payload);`
줄과 `if (!parsed.success) {...}` 블록 바로 뒤(즉 booth 필드 검증 통과 후, `setBusy(true);`
전)에 추가:
```ts
    const enrichmentPayload = {
      summary: enrichmentDraft.summary,
      valueTags: enrichmentDraft.valueTags.map((slug) => ({
        slug,
        strength: 0.8,
      })),
      recommendationReasons: Object.fromEntries(
        enrichmentDraft.valueTags
          .map((slug) => [slug, enrichmentDraft.reasons[slug]?.trim() ?? ""])
          .filter(([, v]) => v),
      ),
      thingsToDo: splitLines(enrichmentDraft.thingsToDoText),
      timing: splitLines(enrichmentDraft.timingText),
      memoryHooks: splitLines(enrichmentDraft.memoryHooksText),
    };
    const enrichmentParsed =
      boothEnrichmentAuthorInputSchema.safeParse(enrichmentPayload);
    if (!enrichmentParsed.success) {
      toast.error(
        enrichmentParsed.error.issues[0]?.message ?? "저작 정보를 확인해 주세요",
      );
      return;
    }
```
그다음 `try { if (editing) await api.patch(...) else await api.post(...) }` 블록을:
```ts
    setBusy(true);
    try {
      if (editing) {
        await api.patch(`/api/booths/${editing.id}`, {
          ...parsed.data,
          enrichment: enrichmentParsed.data,
        });
      } else {
        await api.post("/api/booths", parsed.data);
      }
      toast.success(editing ? "부스를 수정했어요" : "부스를 추가했어요");
      setOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiClientError ? e.error.message : "저장 실패");
    } finally {
      setBusy(false);
    }
```
로 교체(POST 생성 경로는 enrichment를 안 보낸다 — 새 부스는 아직 데이터 이슈 목록에도
안 뜨므로 이 스펙 범위 밖).

- [ ] **Step 5: "근거 카드 저작" 섹션 JSX 추가**

`:488` "웹사이트 URL" `Field`가 끝나는 `</div>`(그리드 `grid-cols-1` 블록의 닫는 태그)와
`:489`의 `<div className="border-t border-border pt-3">`(지도 배치 시작) 사이에 삽입:
```tsx
            <div className="border-t border-border pt-3">
              <p className="text-xs font-bold text-muted-foreground">
                근거 카드 저작
              </p>
              <div className="mt-3 space-y-3">
                <MissingBadgeField
                  label="요약"
                  fieldKey="summary"
                  missingFields={
                    editing ? (gapByBoothId.get(editing.id)?.missingFields ?? []) : []
                  }
                >
                  <Textarea
                    value={enrichmentDraft.summary}
                    onChange={(e) =>
                      setEnrichmentDraft({
                        ...enrichmentDraft,
                        summary: e.target.value,
                      })
                    }
                  />
                </MissingBadgeField>

                <div className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <Label className="text-xs">가치 태그</Label>
                    {editing &&
                      gapByBoothId
                        .get(editing.id)
                        ?.missingFields.includes("valueTags") && (
                        <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
                          비어있음
                        </span>
                      )}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {VALUE_TAGS.map((v) => {
                      const selected = enrichmentDraft.valueTags.includes(
                        v.slug,
                      );
                      return (
                        <Chip
                          key={v.slug}
                          variant={selected ? "tint" : "outline"}
                          color={v.color}
                          icon={<Icon name={v.icon} className="size-3.5" />}
                          onClick={() =>
                            setEnrichmentDraft({
                              ...enrichmentDraft,
                              valueTags: selected
                                ? enrichmentDraft.valueTags.filter(
                                    (s) => s !== v.slug,
                                  )
                                : [...enrichmentDraft.valueTags, v.slug],
                            })
                          }
                          className="cursor-pointer"
                        >
                          {v.label}
                        </Chip>
                      );
                    })}
                  </div>
                  {enrichmentDraft.valueTags.map((slug) => {
                    const def = VALUE_TAGS.find((v) => v.slug === slug);
                    return (
                      <Field key={slug} label={`${def?.label ?? slug} 근거`}>
                        <Input
                          placeholder="예: 몰랐던 브랜드를 발견하기 좋아"
                          value={enrichmentDraft.reasons[slug] ?? ""}
                          onChange={(e) =>
                            setEnrichmentDraft({
                              ...enrichmentDraft,
                              reasons: {
                                ...enrichmentDraft.reasons,
                                [slug]: e.target.value,
                              },
                            })
                          }
                        />
                      </Field>
                    );
                  })}
                </div>

                <MissingBadgeField
                  label="뭘 하면 좋은지 (줄마다 하나)"
                  fieldKey="thingsToDo"
                  missingFields={
                    editing ? (gapByBoothId.get(editing.id)?.missingFields ?? []) : []
                  }
                >
                  <Textarea
                    placeholder={"신간 훑기\n제작 과정 물어보기"}
                    rows={3}
                    value={enrichmentDraft.thingsToDoText}
                    onChange={(e) =>
                      setEnrichmentDraft({
                        ...enrichmentDraft,
                        thingsToDoText: e.target.value,
                      })
                    }
                  />
                </MissingBadgeField>

                <MissingBadgeField
                  label="타이밍 (줄마다 하나)"
                  fieldKey="timing"
                  missingFields={
                    editing ? (gapByBoothId.get(editing.id)?.missingFields ?? []) : []
                  }
                >
                  <Textarea
                    placeholder={"오후 2시 사인회\n한정 굿즈 오전 소진"}
                    rows={3}
                    value={enrichmentDraft.timingText}
                    onChange={(e) =>
                      setEnrichmentDraft({
                        ...enrichmentDraft,
                        timingText: e.target.value,
                      })
                    }
                  />
                </MissingBadgeField>

                <MissingBadgeField
                  label="기억 단서 (줄마다 하나)"
                  fieldKey="memoryHooks"
                  missingFields={
                    editing ? (gapByBoothId.get(editing.id)?.missingFields ?? []) : []
                  }
                >
                  <Textarea
                    placeholder={"파란 부스\n입구 바로 왼쪽"}
                    rows={3}
                    value={enrichmentDraft.memoryHooksText}
                    onChange={(e) =>
                      setEnrichmentDraft({
                        ...enrichmentDraft,
                        memoryHooksText: e.target.value,
                      })
                    }
                  />
                </MissingBadgeField>
              </div>
            </div>
```

- [ ] **Step 6: `MissingBadgeField` 헬퍼 컴포넌트 추가**

파일 하단, 기존 `function Field({ label, children }: ...)` 컴포넌트 정의 바로 뒤에 추가:
```tsx
/** Field를 감싸되, 라벨 옆에 "비어있음" 배지를 붙인다 — fieldKey가 missingFields에
 *  있을 때만. gapByBoothId(이미 계산돼 있는 결측 정보)를 그대로 재사용해 새 계산
 *  없이 딥링크로 들어온 사람에게 뭘 채워야 하는지 보여준다. */
function MissingBadgeField({
  label,
  fieldKey,
  missingFields,
  children,
}: {
  label: string;
  fieldKey: string;
  missingFields: string[];
  children: React.ReactNode;
}) {
  const missing = missingFields.includes(fieldKey);
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5">
        <Label className="text-xs">{label}</Label>
        {missing && (
          <span className="rounded-full bg-destructive/10 px-1.5 py-0.5 text-[10px] font-semibold text-destructive">
            비어있음
          </span>
        )}
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 7: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/components/admin/booth-manager.tsx`
Expected: 에러 없음. (`Chip`의 `color` prop은 hex 문자열을 기대한다 — `VALUE_TAGS[].color`가
전부 hex라 타입 맞음, 확인만.)

- [ ] **Step 8: 전체 vitest 회귀 확인**

Run: `npx vitest run`
Expected: 기존 전부 PASS(이 컴포넌트 자체엔 테스트 없음 — 회귀만 확인).

- [ ] **Step 9: 수동 검증(브라우저)**

mock 모드로 `/admin/booths` 접속(`NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY= ADMIN_EMAILS= npx next dev`, 조직자 코드 `dodecagon`) →
아무 부스나 "수정" → "근거 카드 저작" 섹션에서 가치 태그 하나 체크 → 근거 텍스트칸
나타나는지 확인 → 요약·리스트 필드 채우고 저장 → 토스트 성공 확인 → 같은 부스 다시
열어서 방금 입력한 값이 그대로 남아있는지(=저장이 실제로 갔는지) 확인.

- [ ] **Step 10: 커밋**

```bash
git add src/components/admin/booth-manager.tsx
git commit -m "feat(admin): 부스 편집 시트에 근거 카드 저작 섹션 추가

summary/가치태그+근거/thingsToDo/timing/memoryHooks를 편집 시트
안에서 채울 수 있다. 가치 태그는 8개 칩 토글(강도 고정 0.8), 나머지는
줄바꿈 텍스트어리아. gapByBoothId(기존 계산)를 재사용해 실제 빠진
필드만 '비어있음' 배지로 표시.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

### Task 6: 데이터 이슈 딥링크

**Files:**
- Modify: `src/components/admin/data-issue-list.tsx`
- Modify: `src/components/admin/booth-manager.tsx`

**Interfaces:**
- Consumes: `startEdit`(Task 5까지 존재하는 이 파일의 내부 함수), `booths` prop(기존).
- Produces: 없음(최상위 UI, 마지막 태스크).

- [ ] **Step 1: 데이터 이슈 목록 항목을 링크로**

`src/components/admin/data-issue-list.tsx` 상단에 `import Link from "next/link";` 추가.

현재(`gaps.map((g) => (<li key={g.boothId} ...>...))`):
```tsx
            {gaps.map((g) => (
              <li
                key={g.boothId}
                className="rounded-xl border border-border bg-card p-3 text-sm"
              >
                <p className="font-medium">{g.boothName}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {g.missingFields.join(", ")}
                </p>
              </li>
            ))}
```

교체:
```tsx
            {gaps.map((g) => (
              <li key={g.boothId}>
                <Link
                  href={`/admin/booths?edit=${g.boothId}`}
                  className="block rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:bg-secondary/50"
                >
                  <p className="font-medium">{g.boothName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.missingFields.join(", ")}
                  </p>
                </Link>
              </li>
            ))}
```

- [ ] **Step 2: booth-manager.tsx가 `?edit=` 쿼리파람을 읽어 자동으로 편집 시트를 연다**

상단 import에 추가:
```ts
import { useSearchParams, usePathname } from "next/navigation"; // 기존 "next/navigation"의 useRouter import 줄에 이름 추가
```
`useEffect`를 React import 줄에 추가(`:3-10` 블록에 `useEffect` 이름 추가).

`export function BoothManager(...)` 본문, `const gaps = useMemo(...)` 아래(`filtered`
정의 이후 아무 곳, 예: `startCreate`/`startEdit` 함수 정의 바로 위)에 추가:
```ts
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const enrichmentSectionRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const editId = searchParams.get("edit");
    if (!editId) return;
    const booth = booths.find((b) => b.id === editId);
    if (!booth) return; // 다른 전시로 필터된 상태 등 — 조용히 무시
    startEdit(booth);
    router.replace(pathname, { scroll: false });
    const t = setTimeout(() => {
      enrichmentSectionRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }, 350); // Sheet 오픈 애니메이션이 끝난 뒤 스크롤
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
```
(`startEdit`은 이 컴포넌트 안에서 매 렌더 재생성되는 함수라 `exhaustive-deps`가 걸릴 수
있다 — 의도적으로 `searchParams` 변화 시에만 실행하려는 것이므로 위처럼 억제 주석을
쓴다. 기존 코드베이스에 이 패턴이 없으면 대신 `startEdit`을 `useCallback`으로 감싸지
말고 이 주석 방식을 그대로 따른다 — 최소 변경.)

Task 5 Step 5에서 추가한 "근거 카드 저작" `<div className="border-t border-border
pt-3">` 블록의 `ref`에 `enrichmentSectionRef`를 연결:
```tsx
            <div className="border-t border-border pt-3" ref={enrichmentSectionRef}>
```

- [ ] **Step 3: 타입 체크 + 린트**

Run: `npx tsc --noEmit && npx eslint src/components/admin/data-issue-list.tsx src/components/admin/booth-manager.tsx`
Expected: 에러 없음.

- [ ] **Step 4: 수동 검증(브라우저)**

mock 모드로 부스 하나에 일부러 저작 필드를 비워둔 채(seed 데이터 대부분이 이미 비어
있음) `/admin/errors` → "데이터 이슈" 탭 → 아무 항목 클릭 → `/admin/booths`로 이동하며
그 부스 편집 시트가 자동으로 열리고 "근거 카드 저작" 섹션까지 스크롤되는지, missingFields에
해당하는 필드에 "비어있음" 배지가 붙어 있는지 확인. URL이 `?edit=`를 뗀 `/admin/booths`로
바뀌었는지(새로고침 시 재오픈 안 되는지)도 확인.

- [ ] **Step 5: 커밋**

```bash
git add src/components/admin/data-issue-list.tsx src/components/admin/booth-manager.tsx
git commit -m "feat(admin): 데이터 이슈 목록 → 부스 편집 딥링크

/admin/errors 데이터 이슈 항목을 클릭하면 /admin/booths?edit=<id>로
이동, 해당 부스 편집 시트가 자동으로 열리고 근거 카드 저작 섹션까지
스크롤된다. 문제 발견→조치 루프를 닫는다.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## 전체 완료 후 최종 검증

```
npx tsc --noEmit
npx vitest run
npx eslint src/lib/schemas/index.ts src/lib/repositories/types.ts src/lib/mock/repository.ts src/lib/mock/repository.test.ts src/lib/supabase/repository.ts "src/app/api/booths/[id]/route.ts" src/lib/admin/booth-filter.ts src/lib/admin/booth-filter.test.ts src/components/admin/booth-manager.tsx src/components/admin/data-issue-list.tsx
```
전부 통과하면 `/admin/errors` → 이슈 클릭 → 편집 → 저장 → 목록에서 사라지는지(재조회
시 결측 건수 감소)까지 한 번 더 브라우저로 전체 루프 확인.
