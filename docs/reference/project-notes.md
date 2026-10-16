# 프로젝트 노트 — CLAUDE.md에서 옮겨온 이력·현황·운영 세부

> CLAUDE.md는 **규칙과 함정**만 담는다. 시간이 지나면 낡는 수치·이력·운영 절차는 여기 둔다.
> 여기 적힌 수치는 **기록 시점(2026-10-09) 값**이다 — 쓰기 전에 실제 데이터로 다시 세라.

## 계정 정책의 변천
원래 무계정(anonymous) 설계 → 로그인 필수 → **정보 열람은 다시 공개**로 정착.
계정 벽을 첫 화면에 세우는 대신 "기억·연속성"으로 로그인을 설명하는 방향이다.
익명 세션(`roam_session`) 인프라는 여전히 공존한다.

## 제품 방향 (2026-07-07 재정의) 세부
- **정보 전달기 → 관람 동행자.** LLM을 기능적으로만 쓰는 챗봇이 아니라, 사용자를 기억하고 계속 나아지는 에이전트로. 앱은 *판단 근거*를 주고 사용자가 스스로 판단. 동선은 제품이 아니라 부산물. `docs/decisions/2026-07-07_companion-reframe.md`.
- **관람 아크(전·중·후)로 "충분히 즐겼다" 설계.** 3막: 약속(개인 목표) → 비트(진행 축적) → 회고(peak-end 해소). 회고 = 기억 쓰기. 같은 문서 §5-B.
- **지식 4계층 = 살아있는 장기메모리.** L1 정적 도메인(부스 근거·RAG) / L2 휘발 상황(실시간) / L3 에피소드(관람 1회) / L4 종단 사용자 모델(영속·성장). **저장(축적) 아니라 증류**(정제→압축→승격→아카이브→재증류). 로그인 필수 전환이 L4(크로스-전시 기억)를 비로소 가능케 함. `docs/decisions/2026-07-07_knowledge-architecture.md`.
- **에이전트 구조 = 서비스가 판단, LLM은 말만.** Onboarding·Memory·Planner·Reasoner·Recommendation·Companion·Reflection. **대부분 결정론 모듈**(confidence·피로도·재계획은 수학), LLM은 Companion 한 겹(언어 표면). 7개 LLM 에이전트는 안티패턴. Memory Engine(L1~L4) 블랙보드 공유. `docs/decisions/2026-07-07_agent-architecture.md`.

## 부스 enrichment 현황 (2026-10-09 기준)
- SIBF L1 근거 데이터: 79/256(31%) 부스의 기본 필드 채워짐.
- `src/lib/booth/enrichment-sibf-2026.json`(code 키, 97개 항목): `summary` 97 · `themeTags` 66 · `thingsToDo` 45 · `timing` 31 · `valueTags`/`roamInterpretation`/`recommendationReasons`/`memoryHooks` 각 16.
- 근거 카드(Phase F)는 코드-온리 v1로 shipped. 저작 필드가 채워질수록 카드 품질이 오른다 — 갭은 저작 커버리지.
- 저작 예시 부스: `A1001`·`A1101`.
- 동기화: `0023_booth_enrichment_sync.sql`이 mock JSON 전체(97행)를 멱등 UPSERT(재생성 시 갱신). seed.sql의 enrichment 블록은 구 6컬럼·구 데이터라 stale.

## 하우스 아카이브 enrichment 파이프라인
`enrichment-house-archive-2026.json`(총 104부스 중 99곳에 항목, 그 99곳은 `summary`·`sourceUrl`·`roamInterpretation`·`image` 전부 채워짐).
원본은 주최 측 브랜드 디렉터리 CSV + 인스타 이미지(`public/house_archive_br/`, gitignore) →
`node scripts/gen-house-archive-enrichment.mjs`가 JSON과 `public/booths/house-archive/{CODE}.webp`
(트림·크롭·480px, 장당 ~20KB)를 함께 생성하고 **저작 필드는 재생성 때 보존**한다.
운영 반영은 `0030` 마이그레이션 — `booth`(설명·이미지·인스타)와 `booth_enrichment`(요약·로미 한 줄)
**둘 다** 채워야 한다(피드는 `booth_enrichment`를 조인해 읽으므로 booth만 채우면 로미 한 줄이 운영에서만 빈다).
스크립트는 원본 이미지를 Supabase Storage private bucket `booth-originals/house-archive-2026/`에 백업한다
(handle 기반 경로, first-write-wins). 로컬 폴더가 손상되면 bucket 파일을
`public/house_archive_br/house_archive_images/`로 내려받아 스크립트를 다시 돌린다.

## SIBF 시드 데이터
- 소스: `src/lib/floorplan-sibf.json`(부스 좌표·코드·kind·분야) + `official-sibf-2026.json`(공동입점) → `seed.ts`.
- 운영 DB에는 SIBF 외에 `sif-2026`(서울일러스트레이션페어) 등 여러 전시가 들어 있다.
- SIBF 도면은 손 트레이싱 개략도라 비례가 실제와 안 맞는다(A홀 종횡비 2.124 : 실측 2.000, B1은 아예 안 맞음).

## 근거 카드 문장 규칙의 이력
예전엔 "발견 쪽 부스야"·"네 관심 가치랑 겹쳐"로 분류를 되읽어줬는데, 현장에서 그건 정보가 아니었다.
그래서 "사실 절 + 근거 절" 두 절 구조로 바꿨다(CLAUDE.md 규칙 참고).

## 사고 기록
- **2026-07-27 감사**: PostgREST 쓰기 실패가 201로 위장돼 북마크·커뮤니티가 전량 유실됐다 → `wrote()`/`loggedWrite()` 규약.
- **2026-09-06**: 기기마다 마이그레이션 번호를 따로 매기다 0035~0037이 겹침 → migrations를 git에 올림.
- **2026-09-06**: 인입 틀이 부스를 `listBoothsByExhibitionId`로 읽어 `images`를 늘 빈 칸으로 보고 덮어쓰려 했다. 계획 테스트 12개가 전부 통과한 채로 살아 있었고, 운영 dry-run만 잡아냈다. 같은 날 같은 뿌리("없음 vs 비어 있음")의 사고가 한 번 더 나 운영 데이터를 실제로 지웠다.
- **2026-10-01**: 스크린샷→부스 매칭 `/api/ai/screenshot`은 부르는 화면이 끝내 없어 삭제.
