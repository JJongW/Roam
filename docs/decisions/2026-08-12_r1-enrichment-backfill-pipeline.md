# R1 — enrichment 저작 백필 파이프라인 (RAG)

**날짜**: 2026-08-12
**성격**: 설계 문서 — 미착수. 구현 전 결정을 남긴다(로미 개선 브리프 §3 R1, `docs/decisions/2026-08-12_romi-grounding-and-arc-fixes.md`).
**관련 파일**: `src/lib/booth/enrichment-{sibf,sif,house-archive}-2026.json`, `src/lib/ai/gemini.ts`(`generateGrounded`), `scripts/gen-house-archive-enrichment.mjs`(참고 규약), `supabase/migrations/0023_booth_enrichment_sync.sql`(참고 패턴)

## 배경 — 실측

- SIBF: 97개 항목 중 `roamInterpretation`(저작) 채워진 게 **16개(16%)**.
- SIF: 부스 914개 중 enrichment 항목 자체는 463개 있지만 `roamInterpretation` 채워진 건 **0개(0%)**.
- House archive: 104부스 중 99곳에 항목 있고 그 99곳은 이미 `roamInterpretation`까지 전부 채워짐(다른 경로 — 브랜드 CSV 원본이 있어서 RAG가 아니라 CSV 파싱으로 됐다).
- **브리프 원문의 전제 하나는 틀렸다**: "house-archive 스크립트가 이미 이 방향(RAG)"이라고 썼지만, 실제로 `scripts/gen-house-archive-enrichment.mjs`는 CSV를 그대로 옮기는 결정론 파서다(`generateGrounded` 호출도, `@google/genai` import도 없음). RAG 초안 생성은 이번에 처음 만드는 것이다 — 참고할 기존 배치 스크립트가 없다는 뜻이고, house-archive 스크립트에서 가져올 건 "CSV 진실 소스 + JSON 저작 필드는 재생성 시 보존" 규약뿐이다.

## 목적

브랜드 사전 승인 없이도(공식 정보 + 공개 웹 검색만으로) `roamInterpretation`·`recommendationReasons`·`thingsToDo`·`memoryHooks` 초안을 생성해, 사람이 검토 후 1클릭으로 승인하게 한다. SIF(914부스, 0%)가 가장 시급.

## 기술 제약 — 조사 결과

`generateGrounded`(`src/lib/ai/gemini.ts:178`)는 `import "server-only"`가 걸린 모듈 안에 있다. 이 가드는 번들러(webpack/turbopack)가 클라이언트 번들에서 빼낼 때만 동작하고, 순수 `node script.mjs` 실행에선 무해하다 — 그 자체는 문제 없다.

진짜 문제는 두 가지다:
1. **경로 별칭**: `gemini.ts`가 쓰는 `@/lib/...` 별칭은 tsconfig가 설정한 것이고, 순수 Node는 이걸 모른다. `.mjs` 스크립트에서 `import { generateGrounded } from "@/lib/ai/gemini"`는 그대로는 실패한다.
2. **TypeScript**: `gemini.ts`는 `.ts` 파일이다. Node 23은 타입 스트리핑을 지원하지만(`--experimental-strip-types`), 이 프로젝트에 그 실행 경로를 검증한 전례가 없다.

**옵션 비교**:
- **A. 배치 스크립트가 `src/lib/ai/gemini.ts`를 직접 import** — 별칭 리졸버(`tsconfig-paths` 또는 esbuild 등록) 하나만 추가하면 됨. 로직 재사용(모델 폴백·재시도)이 그대로 딸려온다. 별칭 리졸버라는 새 의존성이 하나 생긴다.
- **B. 배치 스크립트가 `@google/genai`를 독립적으로 다시 호출** — 새 의존성 없음(이미 있는 패키지). 대신 `generateGrounded`의 모델 폴백·재시도·`thinkingBudget=0` 로직을 스크립트 쪽에 다시 써야 한다(중복, 두 곳이 갈릴 위험).
- **권장: A.** 이미 프로덕션에서 검증된 RAG 호출 로직(재시도·폴백·`groundingChunks` 파싱)을 다시 만들면 그 자체가 새 버그 표면이다. 별칭 리졸버 설정 한 번이 훨씬 싼 비용이다.

## 설계 — 파이프라인 모양

```
운영자 실행: node scripts/gen-enrichment-draft.mjs --exhibition=sif-2026
  1. 입력: 공식 디렉터리(floorplan JSON의 부스명·분야) + booth.instagramUrl/websiteUrl(있으면)
  2. 부스마다 generateGrounded 호출 — 프롬프트: "이 부스가 뭘 하는 곳인지, 왜 가볼 만한지,
     뭘 해볼 수 있는지, 기억에 남을 만한 한 장면을 웹 검색 근거로 답해줘"
  3. 출력 파싱 → { roamInterpretation, recommendationReasons, thingsToDo, memoryHooks } 초안
  4. draft JSON 파일로 저장(커밋 안 함) — enrichment-{slug}-draft.json
운영자 검토: 초안 JSON을 열어 부스별로 승인/수정/스킵(수동, 사람이 읽는다 — 자동 승인 없음)
운영자 반영: node scripts/apply-enrichment-draft.mjs
  → enrichment-{slug}-2026.json에 병합(기존 저작 필드는 덮어쓰지 않는다 — house-archive 규약과 동일)
  → booth_enrichment UPSERT 마이그레이션 SQL 생성(0023 패턴 재사용)
```

**"1클릭 승인"은 이번 범위에서 CLI/파일 워크플로다.** 어드민 UI에서 초안을 보고 누르는 화면은 별도 후속 과제 — 이번 설계는 배치 생성까지만 다룬다(브리프도 "speed rule 준수: 전부 오프라인 배치"라고만 요구, UI를 요구하지 않는다).

## 수용 기준

- SIF 부스 914개 중 최소 200개(상위 노출 우선순위)에 초안이 생성된다.
- 초안 JSON은 기존 `EnrichmentDraft` 타입(신설)으로 스키마 검증된다 — 필드 누락이나 빈 문자열은 초안에서 제외(빈말 금지 원칙은 초안 단계에도 적용).
- 재실행해도 이미 승인된(정식 JSON에 반영된) 부스는 덮어쓰지 않는다.
- `npx tsc --noEmit` / `npx vitest run` — 파싱 함수(초안 텍스트 → 구조화 필드)는 순수 함수로 분리해 유닛 테스트.

## 리스크 / 미해결

- generateGrounded 비용 — 914부스 전량이면 호출 914회. 배치라 속도 규칙 위반은 아니지만 비용은 실제 과금 대상. 전량이 아니라 우선순위 상위 N부터 배치 크기를 정하는 게 안전(브리프도 "SIF 가장 시급"이라고만 하지 전량을 요구하지 않음).
- 검색 결과 품질 — 부스가 소규모/신생이면 웹에 정보가 거의 없을 수 있다. 그 경우 초안이 비거나 부실할 수 있으니, 초안 생성 스크립트는 "근거 없으면 필드를 비워둔다"(지어내지 않는다)를 프롬프트에 명시해야 한다 — 이건 grounding.ts의 "빈말 금지" 원칙과 같은 선상.
