# Roam — Exhibition Navigator

전시·박람회 **범용** 모바일 가이드 플랫폼. **로그인 필수**(닉네임 무비번 또는 Google
OAuth) — 방문객 앱 전체가 인증 게이트 뒤에 있다(`src/proxy.ts`). 방문객이 부스를
발견하고, 혼잡을 피하고, 개인화된 동선을 따라가게 돕는다. + 주최자용 관리 콘솔
(운영·분석). 특정 전시 전용이 아니다 — 현재 들어 있는 **2026 서울국제도서전(SIBF)
데이터는 시드/데모일 뿐**, 다른 전시로 교체 가능.
> ⚠️ 원래 무계정(anonymous) 설계였으나 로그인 필수로 전환됨. 익명 세션(`roam_session`)
> 인프라는 여전히 공존하지만, 페이지 접근은 `roam_user` 없으면 `/login`으로 리다이렉트.

> 구조·플로우·규약이 바뀌면 이 파일을 갱신한다. CLAUDE.md는 프로젝트 전반을 담는다.

## 제품 방향 (재정의 진행 중 — 2026-07-07, 아직 미구현)
> ⚠️ 아래는 **지향 방향·설계**다. 현재 코드는 아직 이 구조가 아님. 신규 작업은 이 방향에 정렬.
- **정보 전달기 → 관람 동행자.** LLM을 기능적으로만 쓰는 챗봇이 아니라, 사용자를 기억하고 계속 나아지는 에이전트로. 앱은 *판단 근거*를 주고 사용자가 스스로 판단. 동선은 제품이 아니라 부산물. `docs/decisions/2026-07-07_companion-reframe.md`.
- **관람 아크(전·중·후)로 "충분히 즐겼다" 설계.** 3막: 약속(개인 목표) → 비트(진행 축적) → 회고(peak-end 해소). 회고 = 기억 쓰기. 같은 문서 §5-B.
- **지식 4계층 = 살아있는 장기메모리.** L1 정적 도메인(부스 근거·RAG) / L2 휘발 상황(실시간) / L3 에피소드(관람 1회) / L4 종단 사용자 모델(영속·성장). **저장(축적) 아니라 증류**(정제→압축→승격→아카이브→재증류). 로그인 필수 전환이 L4(크로스-전시 기억)를 비로소 가능케 함. `docs/decisions/2026-07-07_knowledge-architecture.md`.
- **에이전트 구조 = 서비스가 판단, LLM은 말만.** Onboarding·Memory·Planner·Reasoner·Recommendation·Companion·Reflection. **대부분 결정론 모듈**(confidence·피로도·재계획은 수학), LLM은 Companion 한 겹(언어 표면). 7개 LLM 에이전트는 안티패턴. Memory Engine(L1~L4) 블랙보드 공유. `docs/decisions/2026-07-07_agent-architecture.md`.
- **선행 과제(블로커 아님)**: L1 근거 데이터 = 부스 enrichment. 현재 **79/256(31%) 기본 필드 채워짐**. 근거 카드(Phase F)는 **코드-온리 v1로 shipped**(런타임 겹침으로 왜맞음 생성) — 저작 필드(roamInterpretation·recommendationReasons·valueTags)는 아직 2개 부스만, 나머지는 채워질수록 카드 품질 상승. 갭 = 저작 커버리지.

## 스택
Next.js 16(App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui(Radix) ·
framer-motion · zustand · Zod · Supabase(Postgres) · Google Gemini(@google/genai).
디자인 톤: Apple HIG + Toss(미니멀·반응형·라이트/다크).

## 핵심 아키텍처
- **데이터 레이어** `src/lib/repositories`: `Repository` 인터페이스 + 두 구현
  (`MockRepository`, `SupabaseRepository`), 런타임 `getRepository()`가 선택.
  Supabase 키 있으면 Postgres, 없으면 in-memory mock(`src/lib/mock/seed.ts`). `src/lib/env.ts`의 `dataMode`.
- **추천 엔진** `src/lib/engine`: 순수·결정론. `scoring.ts`(부스 점수)→`route.ts`(시간예산
  그리디 + 최근접 정렬)→`navigation.ts`(턴바이턴)→`service.ts`(고수준). I/O 없음, 단위테스트 완비.
- **API** `src/app/api/*` Route Handlers: 모든 입력 Zod 검증(`src/lib/schemas`),
  envelope `{ data } | { error }`(`src/lib/api/http.ts`). 무계정 세션 `ensureSession`.
- **상태**: 서버가 진실(RSC + Route Handlers). zustand는 휘발성 클라 상태만
  (온보딩 draft·동선 진행·지도 뷰포트). localStorage 영속: `roam-onboarding/route/cart/visit/auth`.
- **DB**: `supabase/migrations/000N_*.sql` + `supabase/seed.sql`(= mock seed 패리티, `scripts/gen-seed.mjs` 생성).

## 주요 도메인
- **방문객 플로우**: 전시 열기 → 온보딩 → 개인화 동선 → 인터랙티브 지도 → 턴바이턴 →
  부스 상세(리뷰·이벤트·실시간 대기·웰컴키트) → 관람 종료. 전부 익명.
- **부스/이벤트**: `Booth`(code 자연키, kind exhibitor|facility, tags=카테고리 slug, aliases 공동입점), `BoothEvent`.
- **주최자 콘솔** `/admin`: 전시·부스·이벤트·대기 관리 + 분석 대시보드(히트맵·인기부스·동선흐름·퍼널).
- **부가**: 커뮤니티 포스트(미디어), 개인 메모장(visited/skip/메모/사진), 동선 저장·공유(닉네임), 푸시(FCM), 닉네임 인증.
- **로그인(필수 게이트)**: `app_user`(닉네임=공개키) 단일 계정 테이블. 닉네임 무비번 + **Google OAuth**(Supabase Auth). 신원은 앱 자체 쿠키 `roam_user`로 통일 — OAuth 콜백(`/auth/callback`)은 Supabase 세션으로 identity만 읽고 `signOut`, `app_user` upsert 후 `roam_user` 발급. mock 모드(Supabase 키 없음)엔 Google 버튼 숨김(닉네임만). **게이트** `src/proxy.ts`(Next 16 proxy 컨벤션): `roam_user` 없으면 `/login?next=`로 307. 예외=`/login`·`/auth`·`/admin`(자체 코드 게이트)·`/api`·정적. 로그인 화면 `src/app/login/`. 외부 설정·설계: `docs/decisions/2026-07-07_google-oauth-login.md`.
- 도메인 타입 단일 소스: `src/lib/types/index.ts`. 설계 문서: `.claude/plans/`(architecture·erd·api-spec).

## LLM 추천 + 속도 규칙
- **탭(대화 턴)엔 LLM 금지** → 즉답(로컬 템플릿). companion 속도.
- **동선 생성(명시적 액션, 로딩 UX 있음)엔 LLM이 실제로 일함**: retrieve → rerank+ground → order 하이브리드.
  1. RETRIEVE(결정론): `rankBooths`로 후보 top-N(~30) 추림.
  2. RERANK(Gemini, `src/lib/ai/booth-recommender.ts`): 후보 코퍼스 + 사용자 맥락 읽고
     **Google Search grounding(웹검색) + URLContext(부스 인스타/웹 읽기) + 부스 RAG**로
     선택·재정렬·키워드 확장. 출력 boothId는 실제 후보 ID로 검증(환각 차단).
  3. ORDER(결정론): 엔진이 기하·시간으로 순서 확정(LLM은 좌표·시간 계산 못 함).
  4. FALLBACK: 무키/실패/타임아웃 → 순수 결정론.
- 적용: 온보딩 `POST /api/onboarding/route`(**grounded=false**, 내부 RAG만 → ~3~5초), 지도 "AI 추천" `POST /api/ai/quick-route`(**grounded=true**, 웹검색·URL → ~15~22초).
- **순서 정렬**: `buildHallSweepRoute`(engine/route.ts) — 부스를 홀별로 묶어 입구 근접 홀부터 홀 내부 NN. A↔B 왕복(지그재그) 차단. 후보 20개로 제한(지연).
- **thinking off 필수**: gemini-2.5-flash는 thinking 기본 ON이라 응답이 8~15초+로 느려짐 → 모든 호출에 `thinkingConfig.thinkingBudget=0`(gemini.ts). 이거 빼면 LLM이 타임아웃돼 전부 결정론 폴백된다.
- **AI 추천 쿼리 로그(RAG)**: quick-route가 입력 텍스트+추출 키워드를 `ai_query_log`(`0014`)에 적재. `topQueryKeywords`로 트렌딩 키워드 집계 → 다음 추천 프롬프트에 주입(`logAiQuery`/`topQueryKeywords` repo 메서드).
- **AI 추천 기본=교체**: 텍스트 입력 의도를 그대로 반영. "기존 동선에 더하기" 토글 ON일 때만 keepBoothIds 병합.
- 그 외 Gemini: 온보딩 요약 추론 `/api/onboarding/infer`(prefetch, 논블로킹) · enrichment 추출(오프라인) · 스크린샷 매칭(비전).
- 래퍼 `src/lib/ai/gemini.ts`: `generateJSON`/`generateText`/**`generateGrounded`**(tools=googleSearch+urlContext, JSON 강제 불가 → `extractJSON`로 살림) · server-only · 재시도+모델 폴백 · `hasGemini` 게이트.
- **지연 구간엔 무조건 로딩 UX + 라이팅**: `LOADING_MESSAGES.route`(단계별, `useRotatingMessage` 2.2s 회전).

## 온보딩 = AI Companion 대화 (폼 아님)
- 진입 `/exhibitions/[slug]/onboarding` → `components/onboarding/ai-companion-onboarding.tsx`.
- 스텝 그래프·문구 `src/lib/onboarding/onboarding-flow.ts`. **Step 1은 부스 단위로 분기**(`start`: "이미 가보고 싶은 부스 있어?" → `boothPlan` has_booths/open). 사용자는 이미 특정 전시 안에 있으니 "전시 선택"은 안 묻는다. 답마다 **즉시 로컬 템플릿 반응**.
  - **has_booths**: `booth_pick`(검색+다중선택 부스 picker, 컴포넌트가 커스텀 렌더) → `booth_related`("관련 부스도?") → preference → visit_date → time → route_style → 요약.
  - **open**: visit_date → `intent`(**복수 선택**, `intents[]`) → `followup`(선택한 **의도마다 순차 반복**, `currentFollowupIntent`/`followupAnsweredCount`로 진행) → preference → time → route_style → 요약.
- 타입 `onboarding-types.ts`(`OnboardingContext`: `boothPlan`·`selectedBoothIds`·`wantRelatedBooths`·`intents[]`+대표 `intent`). ctx→`UserPreferenceInput` 변환 `route-profile-builder.ts`(순수, 클라 안전, 복수 의도 합집합). Gemini 추론 `onboarding-inference.ts`(server-only). 부스 목록은 page가 `listBoothsByExhibitionId`로 fetch해 picker에 전달.
- 완료 "좋아, 같이 가자" → `POST /api/onboarding/route`(context 전송, LLM 주도 추천) → `useRouteStore.setRoute` → 지도 replace. (`buildProfileFromContext`는 클라 폴백·legacy 필드용.)
  - **부스 keep/related**: `selectedBoothIds`는 항상 동선에 고정. `wantRelatedBooths=false`+선택 있으면 **고른 부스만**(LLM skip), true면 선택 고정 + 추천 병합. open 분기는 기존대로 전체 추천.
- `useOnboardingStore.applyProfile`가 레거시 필드도 채워 route-view·ai-recommend-sheet 하위호환.

## 지도 동작
- 뒤로가기(`map-view.tsx` `handleBack`): 동선 있으면 "관람이 끝나셨나요?" → 네=`PATCH /api/route/[id]{status:"completed"}`(데이터 유지)+홈 / 아니오=지도 유지.
- 상단 "AI 추천"(`ai-recommend-sheet.tsx`): `keepBoothIds=cart`로 quick-route 호출 → 기존 동선에 **병합**(교체 아님).

## 부스 enrichment (수동 주입)
- 인스타 자동 스크래핑 불가/금지 → **운영자 수동 입력**(`docs/booth-enrichment.md` 양식).
- 소스 `src/lib/booth/enrichment-sibf-2026.json`(code 키, **현재 79/256 부스 채워짐**). 타입 `BoothEnrichment`.
- `seed.ts`가 부스에 attach. `themeTags`(=slug)는 `booth.tags`에 병합 → 추천 스코어링에 **LLM 없이 즉시** 반영. 굿즈/요약/팁은 부스 상세 노출 + 온보딩 추론 프롬프트 어휘로 주입.
- **근거 카드(Phase F)**: 피드 각 부스에 "무엇/왜맞음/근거/뭘하면/신뢰" = `src/lib/feed/grounding.ts`(순수) → `curateFeed`가 FeedItem에 attach, `components/feed/grounding-card.tsx` 렌더. 왜맞음은 저작 `recommendationReasons`(가치별) > `roamInterpretation` > **런타임 겹침**(사용자 브레인 상위 가치 ∩ 부스 valueSlugs) 순. 저작 없으면 자연 degrade(블로커 아님).
- **최소 필수 6종**(운영 입력 시 반드시): `summary`(공식+한줄해석)·`valueTags`·`recommendationReasons`·`thingsToDo`·`timing`·`memoryHooks`. 가장 중요 4=공식정보+해석+가치태그+근거. 양식 `docs/booth-enrichment.md`, 저작 예시 `A1001`·`A1101`. ⚠️ 현재 저작 필드(roamInterpretation·valueTags·recommendationReasons 등)는 2개 부스만 채워짐 — 나머지는 런타임 파생 중.
- Supabase `booth_enrichment` 테이블(`0013` 기본 + `0021` 근거카드 컬럼: value_tags·roam_interpretation·recommendation_reasons·things_to_do·timing·memory_hooks 등), repo `getBoothDetail`가 전 필드 매핑. 데이터 동기화: `0023_booth_enrichment_sync.sql`이 mock JSON 전체(97행)를 멱등 UPSERT(재생성 시 이 마이그레이션 갱신). ⚠️ seed.sql의 enrichment 블록은 구 6컬럼·구 데이터라 stale — prod 진실은 마이그레이션.

## 데이터 주입 (SIBF 시드)
- 소스: `src/lib/floorplan-sibf.json`(부스 좌표·코드·kind·분야) + `official-sibf-2026.json`(공동입점) → `seed.ts`. 런북 `.claude/skills/booth-data-entry`.
- Supabase 동기화: 소스 편집 → `node scripts/gen-seed.mjs`로 seed.sql 재생성 → reset.sql/마이그레이션 반영.
- ⚠️ `gen-seed.mjs`는 현재 `seed.waitings`(seed.ts에서 export 제거됨) 참조로 **깨져 있음** — 재생성 필요 시 waiting 블록부터 수정.

## 검증 (변경 후 필수)
```
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```
- mock 강제 미리보기: `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev`
- 모든 커밋/PR은 `/why`로 이유 기록(메모리 규칙).
