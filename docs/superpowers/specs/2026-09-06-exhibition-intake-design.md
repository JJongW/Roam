# 전시 인입 틀 (intake.v1) — 설계

2026-09-06. 관련: `docs/admin-automation-architecture.md` §5·§11 Phase 4,
`docs/booth-enrichment.md`, `docs/exhibition-intake-template.md`.

## 문제

전시를 하나 붙일 때마다 전용 자산을 새로 만들어 왔다.

```
floorplan-<slug>.json + buildX()    도면 추출 — 전시마다 다름 (남는다)
enrichment-<slug>.json              mock enrichment 소스   ┐
seed.ts / seed-<slug>.ts            mock 부스              ├ 이 셋을 틀이 먹는다
00NN_<slug>.sql (손으로 쓴 UPSERT)  운영 반영              │
scripts/gen-<slug>-enrichment.mjs   전용 생성기            ┘
```

부스 한 건씩 채우는 경로는 이미 있다 — `booth-manager.tsx` → `PATCH
/api/booths/[id]` → `upsertBoothEnrichment`. 없는 건 **전시 하나치를 통째로
받아내는 입구**다.

## 계약 — `intake.v1`

```jsonc
{
  "version": 1,
  "exhibitionSlug": "house-archive-2026",
  "booths": [{
    "code": "H01",                  // 자연키. 유일한 필수 필드
    "name": "누키트",
    "hall": "하우스 아카이브",        // 이름으로 적는다. 없으면 만든다
    "category": "수집의 집",          // 〃
    "kind": "exhibitor",
    "description": "…", "websiteUrl": "…", "instagramUrl": "…",
    "images": ["…"], "tags": ["collect"],
    "enrichment": {
      "summary": "…",
      "valueTags": [{ "slug": "goods", "strength": 0.8 }],
      "recommendationReasons": { "goods": "…" },
      "thingsToDo": ["…"], "timing": ["…"], "memoryHooks": ["…"]
    }
  }]
}
```

**좌표는 담지 않는다.** `FLOORPLANS[slug]`에서 `code`로 조회한다. 도면에 없는
code는 `0,0` + 경고. 좌표를 두 곳에 두면 갈라지고, 도면은 어차피 따로 추출해야
한다(손 트레이싱 금지 — 번들·이미지에서 뽑는다).

## 모듈 경계

| 파일 | 역할 |
|---|---|
| `src/lib/intake/schema.ts` | Zod 정규형. 계약의 단일 소스 |
| `src/lib/intake/plan.ts` | **순수**. (기존 부스·홀·카테고리, 파일, 도면) → `IntakePlan` |
| `src/app/api/admin/intake/route.ts` | POST `{dryRun}` → 계획만 / `{apply}` → 실행 |
| `src/app/admin/intake/page.tsx` | 파일 선택 → 미리보기 표 → 적용 |
| repo | `createHall` · `createCategory` 신규 (mock + supabase) |

계획 계산이 순수 함수라 900부스짜리 파일도 DB 없이 테스트된다. 테스트 대상은
사실상 `plan.ts` 하나다.

```ts
interface IntakePlan {
  creates: PlannedBooth[];      // 없는 code — 새로 만든다
  fills: PlannedFill[];         // 있는 code — 빈 필드만 채운다
  conflicts: PlannedConflict[]; // 양쪽에 값이 있고 다르다 — 기본은 안 쓴다
  newHalls: string[];
  newCategories: string[];
  warnings: string[];           // 도면에 없는 code 등
}
```

## 쓰기 규칙

- `code`로 매칭한다 (전시 내 유일).
- 없으면 **생성**, 있으면 **빈 필드만 채움**.
- 양쪽에 값이 있고 다르면 `conflicts`에 담고 **쓰지 않는다**. 미리보기에 목록으로
  뜨고, "충돌도 덮어쓰기"를 켜야 덮는다. 손으로 쓴 값은 조용히 사라지지 않는다.
- 멱등 — 같은 파일을 두 번 올려도 결과가 같다.
- 모든 쓰기는 `wrote()`/`loggedWrite()` 게이트를 통과한다(CLAUDE.md 규약).
  PostgREST는 실패해도 예외를 안 던지므로 게이트가 유일한 방어선이다.

## 실패 처리

- Zod 실패 → **아무것도 쓰지 않고** 어느 행·어느 필드인지 목록으로 반환.
- 쓰기 중 개별 부스 실패 → 나머지는 계속하고 실패 목록을 반환. 900부스 중 3개
  때문에 전부 막히면 도구로서 쓸모가 없다.

## 재생 가능성

지금 운영 DB는 마이그레이션으로 재생 가능한데, 인입이 API로 쓰면 그 성질이
끊긴다. 그래서 **인입 파일을 `data/intake/<slug>.json`으로 레포에 커밋한다** —
"파일 → 인입 재실행"이 새 재생 경로가 된다. 손으로 쓴 SQL보다 낫다.

## 스코프 밖 (이번 작업)

CSV 어댑터 · 승인 큐(`enrichment_candidate`) · LLM 초안(`enrichment-drafter`) ·
전시 생성 · mock `seed.ts` 리팩터.

CSV는 실제 주최 측 파일이 올 때 붙인다 — 파서 둘과 컬럼 매핑 UI는 어댑터
문제이고, 지금 없는 파일을 상상해서 만들 이유가 없다. 승인 큐는 검수할 초안을
만드는 워커가 생긴 뒤에야 검수할 대상이 있다.
