# 부스 저작 필드(근거 카드) admin 편집 + 데이터 이슈 딥링크

**날짜**: 2026-08-17
**성격**: 결정 문서 + 구현 스펙. 배경: 외부 UX 감사(`docs/decisions/2026-08-15_admin-booth-management-ux-design.md`의
최종 리뷰에서 parked된 "완성도 신호가 변별력 없다" 항목 + 2026-08-16 외부 크리틱 문서 Critical 1).

## What — 무엇이 달라지나

`/admin/errors` "데이터 이슈" 탭이 결측으로 지목하는 6개 필드(`summary`·`valueTags`·
`recommendationReasons`·`thingsToDo`·`timing`·`memoryHooks`)를 **admin 안에서 채울 방법이
지금 아예 없다** — 부스 편집 폼에 필드 자체가 없고, 그 이전에 `booth_enrichment` 테이블에
쓰는 경로가 Mock·Supabase 어느 쪽에도 없다(읽기만 있음). 이번 작업으로:
1. 부스 편집 시트에 이 6개를 입력하는 섹션을 추가.
2. Repository에 저장 경로 신설(Mock + Supabase 둘 다).
3. 데이터 이슈 목록 항목을 클릭하면 해당 부스 편집 시트가 자동으로 열리고 저작 섹션으로
   스크롤 + 실제 빠진 필드만 시각 표시.

## Why — 왜 필요했나

"104건 결측"이라고 알려주기만 하고 고칠 방법을 안 주면 이슈 페이지가 영구 미해결
카운터로 남는다. 문제 발견(이슈 목록) → 조치(편집) → 사라짐(재조회 시 0건)까지 루프가
닫혀야 admin이 "보는 화면"이 아니라 "쓰는 도구"가 된다.

## 판단 근거

- **강도(strength) 슬라이더 대신 고정값(0.8) + 칩 토글.** 운영자가 관람 가치 강도를
  숫자로 정밀 조정할 이유가 없다 — "이 부스가 이 가치랑 맞는지 아닌지"만 알면 되고,
  그 판단은 이미 체크 여부로 충분히 표현된다. 정밀도를 늘리면 입력 복잡도만 는다.
- **thingsToDo/timing/memoryHooks는 줄바꿈 텍스트어리아.** 기존 `tags` 필드가 이미
  "쉼표 구분 텍스트로 입력받고 저장 시점에 배열로 분해"하는 패턴을 쓰고 있어(`tagsText`
  로컬 state), 그 패턴을 그대로 재사용— 새 UI 컴포넌트 안 만들어도 됨.
- **딥링크는 부스 단위, 필드 단위 아님.** 6개 필드가 전부 같은 섹션에 모여 있으니
  섹션으로 스크롤하는 것만으로 사용자가 뭘 채워야 할지 한눈에 보인다. 필드별 포커스는
  구현 복잡도 대비 이득이 작다(YAGNI).
- **저장은 한 번의 PATCH로.** 지금 편집 시트가 이미 "저장" 버튼 하나로 부스 필드 전체를
  보내는 구조라, 저작 필드도 같은 요청에 얹는 게 UX·구현 둘 다 가장 단순하다. 별도
  엔드포인트·별도 저장 버튼은 안 만든다.
- **Supabase 쓰기는 `upsertWelcomeKit`(`repository.ts:825`)과 완전히 같은 패턴.** 이미
  검증된 UPSERT(`onConflict: "booth_id"`) + `wrote()` 래핑 관례를 그대로 복제 — 새 패턴
  발명 안 함. 부분(partial) merge 대신 폼이 매번 6개 필드 전체를 보내는 것으로 설계해서
  Supabase 쪽 UPSERT도 mock 쪽 병합도 둘 다 "전체 교체"로 단순화(partial 병합의 엣지케이스
  없앰).

---

## 스펙

### 1. 스키마 (`src/lib/schemas/index.ts`)

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
```

PATCH 바디는 기존 `boothInputSchema.partial()`에 `enrichment` 선택 필드를 얹은 새
스키마로 검증:
```ts
export const boothPatchInputSchema = boothInputSchema.partial().extend({
  enrichment: boothEnrichmentAuthorInputSchema.optional(),
});
```

### 2. Repository (`src/lib/repositories/types.ts` + Mock + Supabase)

인터페이스에 추가:
```ts
upsertBoothEnrichment(
  boothId: string,
  input: BoothEnrichmentAuthorInput,
): Promise<void>;
```

**Mock**(`src/lib/mock/repository.ts`):
```ts
async upsertBoothEnrichment(boothId: string, input: BoothEnrichmentAuthorInput) {
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
(`goodsKeywords`/`themeTags`/`tips`/`sourceUrl` 같은 기존 필드는 스프레드로 보존 —
저작 6개만 교체.)

**Supabase**(`src/lib/supabase/repository.ts`), `upsertWelcomeKit`(:825) 바로 옆에 추가:
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
컬럼명은 기존 읽기 매퍼 `mapEnrichment`(:137)와 대칭 확인됨(`value_tags`·
`recommendation_reasons`·`things_to_do`·`timing`·`memory_hooks`).

### 3. API (`src/app/api/booths/[id]/route.ts`)

`PATCH` 핸들러가 `boothInputSchema.partial()` 대신 `boothPatchInputSchema`로 파싱하고,
`enrichment`가 있으면 `updateBooth` 뒤에 `upsertBoothEnrichment`도 호출:
```ts
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

### 4. UI — 편집 시트 (`src/components/admin/booth-manager.tsx`)

**새 로컬 state**(기존 `tagsText` 패턴 재사용):
```ts
const [enrichmentDraft, setEnrichmentDraft] = useState<{
  summary: string;
  valueTags: string[]; // 체크된 slug만
  reasons: Record<string, string>;
  thingsToDoText: string; // 줄바꿈 구분
  timingText: string;
  memoryHooksText: string;
}>({ summary: "", valueTags: [], reasons: {}, thingsToDoText: "", timingText: "", memoryHooksText: "" });
```
`startEdit(b)`에서 `b.enrichment`로부터 채움, `startCreate()`에서 빈 값으로 리셋.

**새 섹션**("콘텐츠" 다음, "지도 배치" 접이식 블록 앞, 항상 펼쳐짐) — 소제목 "근거 카드
저작":
- `Field label="요약"` — `Textarea` (summary)
- 가치 태그 — `VALUE_TAGS.map(...)`로 8개 토글 버튼(칩), 체크된 것만 아래에
  `Field label="{라벨} 근거"` textarea 노출(reasons[slug])
- `Field label="뭘 하면 좋은지 (줄마다 하나)"` — Textarea (thingsToDoText)
- `Field label="타이밍 (줄마다 하나)"` — Textarea (timingText)
- `Field label="기억 단서 (줄마다 하나)"` — Textarea (memoryHooksText)

각 필드 라벨 옆에, `gapByBoothId.get(editing?.id ?? "")?.missingFields`에 그 필드 키가
있으면 작은 배지("비어있음", destructive 색) 표시 — Fix1에서 이미 계산해 둔
`gapByBoothId`를 그대로 재사용(새 계산 없음).

**submit()**에서 기존 `payload` 구성 뒤에 `enrichment` 블록 추가:
```ts
const enrichment = {
  summary: enrichmentDraft.summary,
  valueTags: enrichmentDraft.valueTags.map((slug) => ({ slug, strength: 0.8 })),
  recommendationReasons: Object.fromEntries(
    enrichmentDraft.valueTags
      .map((slug) => [slug, enrichmentDraft.reasons[slug]?.trim()])
      .filter(([, v]) => v),
  ),
  thingsToDo: splitLines(enrichmentDraft.thingsToDoText),
  timing: splitLines(enrichmentDraft.timingText),
  memoryHooks: splitLines(enrichmentDraft.memoryHooksText),
};
```
(`splitLines` = 줄바꿈 split + trim + 빈 줄 제거, 순수 헬퍼 하나로 파일 안에 추가.)
`api.patch`로 보내는 바디에 `enrichment` 키 추가.

### 5. 딥링크

**`src/components/admin/data-issue-list.tsx`**: `부스 정보 결측` 목록의 각 `<li>`를
`<Link href={`/admin/booths?edit=${g.boothId}`}>`로 감싼다(`"use client"` 아니어도
`next/link`는 서버 컴포넌트에서 그대로 씀).

**`booth-manager.tsx`**: `useSearchParams`(클라 컴포넌트라 가능) + `useEffect`로:
1. `edit` 쿼리파람이 있으면 `booths`에서 해당 id 찾아 `startEdit(booth)` 호출.
2. Sheet가 열린 뒤(`setTimeout` 또는 `open` state 변화를 보는 두 번째 effect)
   "근거 카드 저작" 섹션에 `ref`를 달아 `scrollIntoView({ behavior: "smooth", block: "start" })`.
3. `router.replace("/admin/booths", { scroll: false })`로 쿼리파람 제거(새로고침 시
   재오픈 방지).
부스를 못 찾으면(다른 전시로 필터된 상태 등) 조용히 무시 — 에러 토스트 안 띄움(엣지
케이스, 사용자가 알아서 재시도).

---

## 검증 & 관례

```
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```
- 새 순수 함수(`splitLines`)는 테스트 동반.
- Mock/Supabase 양쪽 다 확인 필요하지만, mock 모드로 브라우저 검증(딥링크 포함) +
  Supabase 쪽은 코드 리뷰로 컬럼명 대칭만 확인(운영 DB 접근 없음, 기존 세션 관례).
- `/why`로 이유 기록.
