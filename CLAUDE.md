# Roam — Exhibition Navigator

전시·박람회 **범용** 모바일 가이드 플랫폼 + 주최자 관리 콘솔(`/admin`). 특정 전시 전용이 아니다 —
들어 있는 전시 데이터(SIBF 등)는 전부 교체 가능한 데이터다.

> 이 파일은 **규칙과 함정**만 담는다. 이력·현황 수치·운영 절차는 `docs/reference/project-notes.md`.
> 구조·플로우·규약이 바뀌면 이 파일을 갱신한다.

## 제품 방향
**관람 동행자**: 앱은 판단 근거를 주고 사용자가 판단한다. 동선은 제품이 아니라 부산물.
**서비스가 판단, LLM은 말만** — 결정은 결정론 모듈, LLM은 언어 표면 한 겹. 새 작업은 이 방향에 정렬.
설계: `docs/decisions/2026-07-07_{companion-reframe,knowledge-architecture,agent-architecture}.md`.

## 스택
Next.js 16(App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui(Radix) ·
framer-motion · zustand · Zod · Supabase(Postgres) · Google Gemini(@google/genai).
디자인 톤: Apple HIG + Toss(미니멀·반응형·라이트/다크).

## 핵심 아키텍처
- **데이터 레이어** `src/lib/repositories`: `Repository` 인터페이스 + `MockRepository`·`SupabaseRepository`.
  Supabase 키가 있으면 Postgres, 없으면 in-memory mock(`src/lib/mock/seed.ts`). `src/lib/env.ts`의 `dataMode`.
- **추천 엔진** `src/lib/engine`: 순수·결정론. `scoring.ts` + `service.ts`(`rankForExhibition`).
  동선 엔진(`route.ts`·`navigation.ts`)은 **없다** — 피드로 대체되며 제거됨.
- **API** `src/app/api/*`: 모든 입력 Zod 검증(`src/lib/schemas`), envelope `{ data } | { error }`(`src/lib/api/http.ts`). 무계정 세션 `ensureSession`(`roam_session`)도 공존.
- **쓰기 규약(중요)**: PostgREST는 실패해도 예외를 안 던진다. `supabase/repository.ts`의 모든 쓰기는
  `wrote()`/`maybeWrote()`(도메인, 실패=throw) 또는 `loggedWrite()`(텔레메트리, 실패=에러 로그)를
  **반드시** 통과시킨다. 빠뜨리면 FK 위반·스키마 드리프트가 201 성공으로 위장된다.
- **상태**: 서버가 진실(RSC + Route Handlers). zustand는 휘발성 클라 상태만. localStorage 영속: `roam-visit/auth` 등.
- **요청 단위 캐시**: 전시는 `repositories/cached.ts`의 `getExhibitionCached`(React `cache`)로 읽는다.
- **DB**: `supabase/migrations/000N_*.sql`은 git에 올린다(나머지 `supabase/*`는 무시). 번호는 main 기준으로
  매긴다. 적용은 손(Supabase SQL Editor).
- 도메인 타입 단일 소스: `src/lib/types/index.ts`.

## 로그인 게이트
- **열람은 공개, 로미의 개인화는 로그인.** `app_user` 단일 계정(닉네임 무비번 + Google OAuth).
  신원은 앱 쿠키 `roam_user` — OAuth 콜백(`/auth/callback`)은 Supabase 세션으로 identity만 읽고 `signOut`한다.
  mock 모드엔 Google 버튼 숨김. 설계: `docs/decisions/2026-07-07_google-oauth-login.md`.
- 게이트 `src/proxy.ts`: `roam_user` 없으면 `/login?next=`로 307.
  공개 = `/`·`/privacy`·`/terms` + 정확 패턴 `/exhibitions/[slug]`·`/exhibitions/[slug]/map`·`/booths/[id]`.
  ⚠️ `/privacy`·`/terms`는 구글 OAuth 심사가 직접 연다 — 막으면 심사 탈락.
  하위 경로는 패턴에 안 걸려 자동으로 로그인 필수. 예외 프리픽스 = `/login`·`/auth`·`/admin`(자체 게이트)·`/api`·정적.
  로미 개인화는 라우트가 아니라 **컴포넌트 레벨**에서 막는다.
- 소유자 키: 노트·브레인·신호·북마크·리뷰·커뮤니티 포스트 전부 `app_user.id`.
- ⚠️ 닉네임 로그인 제거는 **보류 중**(기존 계정 마이그레이션 미정) — 임의로 끄거나 지우지 말 것.

## 주요 도메인
- **방문객 플로우**: 전시 홈(가치 온보딩 + 관심 피드 + 근거 카드) → 지도 → 부스 상세 → 노트 →
  "오늘 관람 마치기"(회고, 전시 홈 하단 `FinishVisit` → `POST /api/me/reflect`). 앞 셋은 공개.
- **부스/이벤트**: `Booth`(code 자연키, kind exhibitor|facility, tags=카테고리 slug, aliases 공동입점), `BoothEvent`.
- **참가사(행사를 넘는 브랜드)**: `exhibitor` ← `exhibition_participant`(회차별 표기 이름) ← `booth_participant`.
  인스타·웹 도메인이 겹치면 자동 연결, **이름만 같으면 사람이 확인**(`/admin/verify/brands`).
  판정은 `lib/exhibitor/identity.ts` 하나뿐(품질 게이트의 신원 앵커와 공유).
  소개·사진은 참가사에 복사하지 않는다 — 가장 최근 승인 부스가 원천.
  로미 근거 우선순위: 내 지난 반응(긍정만) > 이번 행사의 내 반응 > 브랜드의 지난 출전(피드당 2번) > 저작 근거.
  설계 `docs/superpowers/specs/2026-10-02-cross-exhibition-brand-design.md`.
- **커뮤니티는 웹에서 뺐다.** API(`/api/exhibitions/[slug]/community`·`/api/community/*`)와 `community_post`
  테이블은 iOS가 써서 남겨 둔다 — iOS에서도 빼면 그때 정리.
- 푸시(FCM)는 키 미설정이라 비활성.

## LLM 사용 + 속도 규칙
- **탭(대화 턴)엔 LLM 금지** → 즉답(로컬 템플릿).
- **피드 큐레이션엔 LLM 없음**: `curateFeed`(feed/curate.ts)는 순수 결정론.
- **피드는 6칸짜리 결정 큐다**(`rhythm.ts`): 반응한 부스는 **전부** 큐에서 빠진다(되돌아보는 곳은 지도 색과 메모장).
  새로 고르기는 **목록 맨 아래 버튼으로만** — 읽는 중에 화면이 다시 그려지면 안 된다.
  새 카드는 '여기부터 새로 골랐어' 아래에만 붙는다.
- Gemini 호출처는 3곳뿐: `/api/ai/booth-summary` · `/api/ai/community-summary` · `/api/exhibitions/[slug]/keywords`.
- **thinking off 필수**: 모든 호출에 `thinkingConfig.thinkingBudget=0`(gemini.ts). 빼면 8~15초+로 느려져
  타임아웃 → 전부 결정론 폴백된다.
- 래퍼 `src/lib/ai/gemini.ts`: `generateJSON`/`generateText`/`generateGrounded`(JSON 강제 불가 → `extractJSON`) ·
  server-only · 재시도+모델 폴백 · `hasGemini` 게이트.
- **지연 구간엔 무조건 로딩 UX**: `src/lib/loading-messages.ts` + `useRotatingMessage`.

## 로미 문장 규칙 (근거 카드)
- `src/lib/feed/grounding.ts`(순수) → `curateFeed`가 FeedItem에 attach → `components/feed/interest-feed.tsx`가 렌더.
- ⚠️ **로미 발화에 가치 이름을 쓰지 않는다.** 한 줄 = **부스가 무엇인지(사실)** + **왜 지금 너한테(내가 실제로 누른 부스)**.
- 사실 절은 항상 채워진다: `roamInterpretation` > `recommendationReasons` > `summary` > `booth.name`
  (`booth.company`는 시드에서 카테고리 요약이라 쓰지 않는다).
- 근거 절은 피드당 최대 2번(`createLinkPicker`의 `maxUses`). 없을 수는 있어도 **지어내지 않는다**.

## 온보딩 = 가치 선택
- 별도 페이지 없음. 전시 홈의 `components/onboarding/value-onboarding.tsx` → `POST /api/me/values` →
  `recordSignal`(explicit) → 브레인 재증류 → 피드 즉시 반영.
- 가치 slug 단일 소스 `src/lib/values/index.ts`. 8개 밖의 값은 `/api/me/values`가 400.
- 취향 정확도는 `getTasteAccuracy`(booth_note 집계). 예전 `tasteProgress`는 삭제됐다.

## 지도
- 뒤로가기(`map-view.tsx` `handleBack`): history 있으면 `router.back()`, 없을 때만 전시 홈으로 push.
- **장소(venue)와 배치(layout)는 다르다.** 벽·입출구·화장실은 건물 속성이라 `src/lib/venues/<venue>.json`에
  한 번 저작하고 모든 전시가 재사용한다. 전시는 부스 배치만 말한다. 합성은 `src/lib/floorplan/compose.ts`.
  새 도면은 "표준부스가 3×3m(플라츠 3×2m)로 떨어지나"로 스케일을 검증한다.
  - 입출구를 모르는 장소는 **비워둔다** — 지어 넣으면 그 홀의 다음 전시까지 거짓말을 물려받는다.
  - ⚠️ SIBF만 예외: 개략도라 미터 환산이 안 돼 `buildSibf()`가 따로 남아 있다.

## 데이터 주입
- **새 전시 붙이기**: ① 도면 → `floorplan-<slug>.json`(부스 배치 + `"venue"`) + `FLOORPLANS` 등록 한 줄
  ② `data/intake/<slug>.json`을 `/admin/intake`에 업로드. 코드 변경 없이 데이터로 된다.
- **인입 틀 `intake.v1`이 유일한 경로다.** 전시별 JSON·전용 스크립트·손 UPSERT 마이그레이션은 더 만들지 않는다.
  계약 `src/lib/intake/schema.ts`, 계획 `src/lib/intake/plan.ts`(순수), 설계 `docs/superpowers/specs/2026-09-06-exhibition-intake-design.md`.
  - 좌표는 계약에 없다 — `FLOORPLANS[slug]`가 `code`로 댄다.
  - **빈 칸만 채운다.** 양쪽 값이 다르면 `conflicts`로 빠진다(사람이 "충돌도 덮어쓰기"를 켜야 덮인다). 배열은 합집합 안 만든다.
  - `categorySlug`는 명시로만 받는다 — `booth.tags`로 들어가 스코어링이 읽으므로 한글 이름에서 파생 금지.
  - 운영 쓰기 전 `data/intake/_backup/`에 현재 값을 떠 둔다(되돌리기 버튼 없음).
- 부스 한 건 편집은 `/admin/booths`(`PATCH /api/booths/[id]`).
- 인스타 자동 스크래핑 불가/금지 → 운영자 수동 입력(`docs/booth-enrichment.md` 양식).
- enrichment 최소 필수 6종: `summary`·`valueTags`·`recommendationReasons`·`thingsToDo`·`timing`·`memoryHooks`.
  `themeTags`(=slug)는 `booth.tags`에 병합돼 LLM 없이 스코어링에 반영된다.
- `booth_enrichment`와 `booth`는 따로 채운다 — 피드는 `booth_enrichment`를 조인해 읽는다.
- mock(`seed*.ts`)은 아직 전시별 JSON을 import한다(미정리). `scripts/gen-seed.mjs`는 **실행 불가**(gitignore된 `supabase/seed.sql`을 연다).

## ⚠️ 데드코드 (지우거나 되살리기 전엔 믿지 말 것)
호출부 0: `ai/booth-recommender.ts` · `onboarding/onboarding-{flow,inference,types}.ts` · `stores/onboarding.ts` ·
repo의 `logAiQuery`/`topQueryKeywords`(+ `ai_query_log` 테이블).

## ⚠️ "없음"과 "비어 있음"을 구별하지 않는 경로들
이 뿌리로 운영 데이터를 실제로 지운 적이 있다.

| 경로 | 거짓말 | 막는 법 |
|---|---|---|
| 좁힌 컬럼 조회 | 안 가져온 컬럼이 **빈 값**으로 채워져 옴 | 목록 조회는 `BoothListItem`(images·longDescription 없음). 전 필드는 `listBoothsFull`·`getBoothDetail` |
| Zod `.partial()` | **`default()`를 안 막는다** — 안 보낸 키가 빈 값으로 생김 | 부분 수정엔 `boothEnrichmentPatchSchema`. `authorInputSchema.partial()` 금지 |
| PostgREST 실패 | 예외가 아니라 `data: null` → `?? []`가 "0건"으로 위장 | 읽기는 `inChunks`(에러 시 throw), 쓰기는 `wrote()`/`loggedWrite()` |
| `head:true` 카운트 | **없는 테이블에도 에러를 안 낸다** | 존재 확인은 `select().limit(1)` |

**규칙**: 저장소가 준 값을 "비었다"로 해석하기 전에, 그 읽기가 그 필드를 정말 가져오는지 구현에서 확인한다.
이름과 타입은 근거가 아니다. `undefined` 필드를 페이로드에서 빼는 건 저장소가 한다(호출부가 아니라).

## ⚠️ mock 통과 ≠ 검증
`MockRepository`는 인터페이스를 흉내내지 **행동**을 흉내내지 않는다.

| | mock | supabase |
|---|---|---|
| 컬럼 좁힘 | supabase처럼 뺀다 | `BOOTH_LIST_COLS`가 `images`·`long_description` 제외 |
| 실패 | throw | `data: null` — `?? []`가 "0건"으로 위장 |
| `.in()` 길이 상한 | 없음 | 있음(914부스 ≈ 7.3KB, 상한 근처) |
| jsonb vs text[] | 구분 없음 | 구분함 |

- **저장소 변경은 운영 dry-run까지 해야 "됐다"**: `.env`(운영 자격증명)로 `npx next dev`를 띄우고 읽기 전용 경로를 태운다.
  mock 강제: `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev`
- mock의 역할은 테스트 픽스처(라우트 통합 테스트)까지다.

## 검증 (변경 후 필수)
```
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```
- 모든 커밋/PR은 `/why`로 이유를 `docs/decisions/`에 기록한다.
