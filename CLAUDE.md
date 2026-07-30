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
- **추천 엔진** `src/lib/engine`: 순수·결정론. `scoring.ts`(부스 점수) + `service.ts`(`rankForExhibition` — 저장소에서 부스·이벤트·히트맵을 **병렬로** 읽어 랭킹).
  ⚠️ 과거의 `route.ts`(시간예산 그리디)·`navigation.ts`(턴바이턴)는 **없다** — 동선 제품이 피드로 대체되며 제거됨.
- **API** `src/app/api/*` Route Handlers: 모든 입력 Zod 검증(`src/lib/schemas`),
  envelope `{ data } | { error }`(`src/lib/api/http.ts`). 무계정 세션 `ensureSession`.
- **쓰기 규약(중요)**: PostgREST는 실패해도 예외를 안 던진다. `supabase/repository.ts`의
  모든 쓰기는 `wrote()`/`maybeWrote()`(도메인, 실패=throw) 또는 `loggedWrite()`(텔레메트리,
  실패=에러 로그)를 **반드시** 통과시킨다. 이걸 빠뜨리면 FK 위반·스키마 드리프트가
  201 성공으로 위장되고 로그에도 안 남는다(2026-07-27 감사에서 북마크·커뮤니티 전량 유실로 확인).
- **상태**: 서버가 진실(RSC + Route Handlers). zustand는 휘발성 클라 상태만
  (지도 뷰포트·컴패니언·UI). localStorage 영속: `roam-visit/auth` 등.
- **요청 단위 캐시**: 같은 렌더에서 전시를 여러 번 읽지 않도록 `repositories/cached.ts`의
  `getExhibitionCached`(React `cache`)를 쓴다. 페이지·`generateMetadata`·`rankForExhibition`이 공유.
- **DB**: `supabase/migrations/000N_*.sql`. `supabase/`는 gitignore라 **레포에 안 올라간다**(로컬/운영 각자 관리).

## 주요 도메인
- **방문객 플로우**: 로그인 → 전시 홈(가치 온보딩 + 관심 피드 + 근거 카드) → 인터랙티브 지도 →
  부스 상세(리뷰·이벤트·웰컴키트) → 노트·커뮤니티 → "오늘 관람 마치기"(회고). 로그인 필수.
- **부스/이벤트**: `Booth`(code 자연키, kind exhibitor|facility, tags=카테고리 slug, aliases 공동입점), `BoothEvent`.
- **주최자 콘솔** `/admin`: 전시·부스·이벤트·대기 관리 + 분석 대시보드(히트맵·인기부스·동선흐름·퍼널).
- **부가**: 커뮤니티 포스트(미디어), 개인 메모장(visited/skip/메모/사진), 북마크, 푸시(FCM — **현재 키 미설정이라 비활성**), 닉네임 인증.
- **소유자 키**: 노트·브레인·신호·북마크는 `app_user.id`. ⚠️ 리뷰·커뮤니티 포스트는 아직
  `visitor_session.id` 기준이라 계정에 안 묶인다(미해결, 감사 P1-2).
- **로그인(필수 게이트)**: `app_user`(닉네임=공개키) 단일 계정 테이블. 닉네임 무비번 + **Google OAuth**(Supabase Auth). 신원은 앱 자체 쿠키 `roam_user`로 통일 — OAuth 콜백(`/auth/callback`)은 Supabase 세션으로 identity만 읽고 `signOut`, `app_user` upsert 후 `roam_user` 발급. mock 모드(Supabase 키 없음)엔 Google 버튼 숨김(닉네임만). **게이트** `src/proxy.ts`(Next 16 proxy 컨벤션): `roam_user` 없으면 `/login?next=`로 307. 예외=`/login`·`/auth`·`/admin`(자체 코드 게이트)·`/api`·정적. 로그인 화면 `src/app/login/`. 외부 설정·설계: `docs/decisions/2026-07-07_google-oauth-login.md`.
- 도메인 타입 단일 소스: `src/lib/types/index.ts`. 설계 문서: `.claude/plans/`(architecture·erd·api-spec).

## LLM 사용 + 속도 규칙
- **탭(대화 턴)엔 LLM 금지** → 즉답(로컬 템플릿). companion 속도.
- **피드 큐레이션엔 LLM 없음**: `curateFeed`(feed/curate.ts)는 브레인 + `rankForExhibition`
  결과로 안정·낯선·모험 믹스를 만드는 **순수 결정론**이다.
- **피드는 6칸짜리 결정 큐다**(`rhythm.ts`): 반응(끌림·나중에·별로·이미봄)한 부스는 **전부**
  큐에서 빠지고, 되돌아보는 곳은 지도 색과 내 메모장이다. 새로 고르기는 **자동이 아니라
  목록 맨 아래 버튼**으로만 — 읽는 중에 화면이 다시 그려지면 안 된다. 새로 온 카드는
  '여기부터 새로 골랐어' 아래에만 붙는다(위에 끼워 넣지 않는다).
- 실제 Gemini 호출처는 4곳뿐: `/api/ai/booth-summary`(~1.8초) · `/api/ai/community-summary`(~2.5초) ·
  `/api/ai/screenshot`(비전) · `/api/exhibitions/[slug]/keywords`.
- **thinking off 필수**: gemini-2.5-flash는 thinking 기본 ON이라 응답이 8~15초+로 느려짐 → 모든 호출에 `thinkingConfig.thinkingBudget=0`(gemini.ts). 이거 빼면 LLM이 타임아웃돼 전부 결정론 폴백된다.
- 래퍼 `src/lib/ai/gemini.ts`: `generateJSON`/`generateText`/**`generateGrounded`**(tools=googleSearch+urlContext, JSON 강제 불가 → `extractJSON`로 살림) · server-only · 재시도+모델 폴백 · `hasGemini` 게이트.
- **지연 구간엔 무조건 로딩 UX + 라이팅**: `src/lib/loading-messages.ts` + `useRotatingMessage`(2.2s 회전).

### ⚠️ 데드코드 (지우거나 되살리기 전엔 믿지 말 것)
동선 제품이 피드로 대체되며 호출부만 사라지고 남은 것들 — 참조 0:
`ai/booth-recommender.ts`(`recommendBoothIds`) · `onboarding/onboarding-flow.ts` ·
`onboarding/onboarding-inference.ts` · `onboarding/onboarding-types.ts` ·
repo의 `logAiQuery`/`topQueryKeywords`(+ `ai_query_log` 테이블).

## 온보딩 = 가치 선택 (전시 홈 안에서)
- 별도 온보딩 페이지는 **없다**. 전시 홈이 `components/onboarding/value-onboarding.tsx`를 띄우고,
  고른 가치를 `POST /api/me/values` → `recordSignal`(explicit) → 브레인 재증류 → 피드 즉시 반영.
- 가치 slug 단일 소스 `src/lib/values/index.ts`(`discovery·experience·goods·social·learning·trend·inspiration·rest`).
  ⚠️ 이 8개 밖의 값은 `/api/me/values`가 400으로 거른다.
- 파악도(0~100)는 `memory/progress.ts`의 `tasteProgress(brain)` — 브레인 파생 순수 함수.

## 지도 동작
- 뒤로가기(`map-view.tsx` `handleBack`): history 있으면 `router.back()`(라우터 캐시로 즉시 복원),
  공유 링크로 바로 진입해 history가 없을 때만 전시 홈으로 push. 종료 확인 다이얼로그는 없다.
- 관람 종료는 지도가 아니라 전시 홈 하단 `FinishVisit`("오늘 관람 마치기") → `POST /api/me/reflect`.

## 부스 enrichment (수동 주입)
- 인스타 자동 스크래핑 불가/금지 → **운영자 수동 입력**(`docs/booth-enrichment.md` 양식).
- 소스 `src/lib/booth/enrichment-sibf-2026.json`(code 키, **97개 항목**). 타입 `BoothEnrichment`.
  채움 현황: `summary` 97 · `themeTags` 66 · `thingsToDo` 45 · `timing` 31 ·
  `valueTags`/`roamInterpretation`/`recommendationReasons`/`memoryHooks` 각 **16**.
- `seed.ts`가 부스에 attach. `themeTags`(=slug)는 `booth.tags`에 병합 → 추천 스코어링에 **LLM 없이 즉시** 반영. 굿즈/요약/팁은 부스 상세 노출 + 온보딩 추론 프롬프트 어휘로 주입.
- **하우스 아카이브**: `enrichment-house-archive-2026.json`(68/104 — `summary`·`sourceUrl`·`roamInterpretation`·`image`). 원본은 주최 측 브랜드 디렉터리 CSV + 인스타 이미지(`public/house_archive_br/`, gitignore) → `node scripts/gen-house-archive-enrichment.mjs`가 JSON과 `public/booths/house-archive/{CODE}.webp`(트림·크롭·480px, 장당 ~20KB)를 함께 생성하고 **저작 필드는 재생성 때 보존**한다. 운영 반영은 `0030` 마이그레이션 — `booth`(설명·이미지·인스타)와 `booth_enrichment`(요약·로미 한 줄) **둘 다** 채워야 한다. 피드는 `listBoothsByExhibitionId`가 조인하는 `booth_enrichment`를 읽으므로 booth만 채우면 로미 한 줄이 운영에서만 빈다.
- **근거 카드(Phase F)**: 피드 각 부스에 "무엇/왜맞음/근거/뭘하면/신뢰" = `src/lib/feed/grounding.ts`(순수) → `curateFeed`가 FeedItem에 attach, **`components/feed/interest-feed.tsx`가 인라인 렌더**.
  ⚠️ **로미 발화에 가치 이름을 쓰지 않는다.** 한 줄은 두 절 = **부스가 무엇인지(사실)** + **왜 지금 너한테(내가 실제로 누른 부스)**. 사실은 저작 `roamInterpretation` > 가치별 `recommendationReasons` > 공식 `summary` 순. 근거 절은 `curateFeed`가 최근 긍정 반응(끌림·가봄) 중 가치가 겹치는 부스를 찾아 넘기고, **피드당 한 번만** 붙인다. 둘 다 없으면 **한 줄을 비운다**(빈말 금지). 예전엔 "발견 쪽 부스야"·"네 관심 가치랑 겹쳐"로 분류를 되읽어줬는데, 현장에서 그건 정보가 아니었다.
- **최소 필수 6종**(운영 입력 시 반드시): `summary`(공식+한줄해석)·`valueTags`·`recommendationReasons`·`thingsToDo`·`timing`·`memoryHooks`. 가장 중요 4=공식정보+해석+가치태그+근거. 양식 `docs/booth-enrichment.md`, 저작 예시 `A1001`·`A1101`. 저작 필드가 없는 부스는 런타임 겹침으로 파생된다.
- Supabase `booth_enrichment` 테이블(`0013` 기본 + `0021` 근거카드 컬럼: value_tags·roam_interpretation·recommendation_reasons·things_to_do·timing·memory_hooks 등), repo `getBoothDetail`가 전 필드 매핑. 데이터 동기화: `0023_booth_enrichment_sync.sql`이 mock JSON 전체(97행)를 멱등 UPSERT(재생성 시 이 마이그레이션 갱신). ⚠️ seed.sql의 enrichment 블록은 구 6컬럼·구 데이터라 stale — prod 진실은 마이그레이션.

## 데이터 주입 (전시 시드)
- 소스: `src/lib/floorplan-sibf.json`(부스 좌표·코드·kind·분야) + `official-sibf-2026.json`(공동입점) → `seed.ts`. 런북 `.claude/skills/booth-data-entry`.
- 운영 DB에는 **SIBF 외에 `sif-2026`(서울일러스트레이션페어)도 들어 있다** — 전시 추가는 데이터로 가능(코드 변경 불필요).
- ⚠️ `node scripts/gen-seed.mjs`는 **실행 불가** — `supabase/seed.sql`을 열려는데 `supabase/`가 gitignore라 레포에 없다. 재생성이 필요하면 경로부터 손봐야 한다.

## 검증 (변경 후 필수)
```
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```
- mock 강제 미리보기: `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev`
- 모든 커밋/PR은 `/why`로 이유 기록(메모리 규칙).
