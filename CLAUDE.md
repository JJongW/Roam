# Roam — 부스 탐색 서비스

박람회와 페어에서 관심 있는 부스를 찾고 찾아가도록 돕는 부스 탐색 서비스(모바일 웹) + 주최자 관리 콘솔(`/admin`).
특정 박람회 하나에 묶이지 않는다. 들어 있는 행사 데이터(SIBF 등)는 전부 교체 가능한 데이터다.
코드 식별자(`exhibition`, `/exhibitions`)는 사용자에게 보이지 않으므로 그대로 둔다.

> 이 파일은 **규칙과 함정**만 담는다. 이력·현황 수치·운영 절차는 `docs/reference/project-notes.md`.
> 구조·플로우·규약이 바뀌면 이 파일을 갱신한다.

## 브랜드 규칙 (최상위, 2026-11-02 Ted 결정)
@../Roam-design/docs/brand/00_brand-rules.md

이 규칙이 아래 "제품 방향"과 이 레포 문서보다 우선한다. 사용자용 문구는 존댓말, 박람회를 고르면 지도부터,
동선 추천은 원할 때만, 사용자 문구에 "전시" 금지(브랜드가 직접 쓴 원문은 예외). 어긋나는 코드와 문구 목록:
`../Roam-design/docs/decisions/2026-11-02_브랜드-규칙-재정의.md`. 작업 조율은 Roam-design 세션(헤더)이 한다.

## 작업 규칙
- 화면 작업은 Figma를 따른다. **Figma에 없는 화면이나 흐름은 만들지 말고 보고하라.**
- 비밀값(`.env` 등)은 열거나 출력하지 않는다.
- 디자인 값은 Roam-design 토큰(v2)에서만 받는다(아래 "디자인 시스템 v2").
- 문구와 브랜드 판단은 `../Roam-design/docs/brand/00_brand-rules.md`를 따른다. 여기에 옮겨 적지 않는다.

## 제품 방향 (2026-07 기준. 브랜드 규칙과 어긋나면 브랜드 규칙)
**박람회를 같이 다니는 동행자**: 앱은 판단 근거를 주고 사용자가 판단한다. 동선은 제품이 아니라 부산물.
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
- 게이트 `src/proxy.ts`: `roam_user` 없으면 `/login?next=`로 307. 앱 안에서 로그인을 부르는 자리는 페이지를 옮기지 않고
  `useAuthStore.getState().openLogin(source)`로 지금 화면 위 시트(UI 5-04, `LoginSheet`)를 띄운다. 내용은 `/login`과 같은 `LoginPanel`(11-20 Ted).
  공개 = `/`·`/privacy`·`/terms`·`/survey`(공개 설문, `docs/decisions/2026-10-16_공개-설문-페이지.md`) + 정확 패턴 `/exhibitions/[slug]`·`/exhibitions/[slug]/map`·`/booths/[id]`.
  ⚠️ `/privacy`·`/terms`는 구글 OAuth 심사가 직접 연다 — 막으면 심사 탈락.
  하위 경로는 패턴에 안 걸려 자동으로 로그인 필수. 예외 프리픽스 = `/login`·`/auth`·`/admin`(자체 게이트)·`/api`·정적.
  로미 개인화는 라우트가 아니라 **컴포넌트 레벨**에서 막는다.
- 소유자 키: 노트·브레인·신호·북마크·리뷰·커뮤니티 포스트 전부 `app_user.id`.
- ⚠️ 닉네임 로그인 제거는 **보류 중**(기존 계정 마이그레이션 미정) — 임의로 끄거나 지우지 말 것.

## 주요 도메인
- **방문객 플로우**: 홈 → 지도(`/exhibitions/[slug]`는 `/map`으로 넘겨 준다, 지도 먼저 §4, 2026-11-20) →
  부스 상세(하트는 아래 바 하나, 브랜드 칸은 이름 밑에 소개와 작은 알림 문구 UI 24 Q1 A, 상단 이름은 스크롤하면 부스명). 옛 전시 홈(가치 온보딩, 관심 피드, 근거 카드,
  `FinishVisit` 회고 입구)은 화면에서 닿지 않는다. 피드 큐레이션은 iOS가 쓰는 `/api/exhibitions/[slug]/feed` 때문에 남아 있다.
- **부스/이벤트**: `Booth`(code 자연키, kind exhibitor|facility, tags=카테고리 slug, aliases 공동입점), `BoothEvent`.
- **참가사(행사를 넘는 브랜드)**: `exhibitor` ← `exhibition_participant`(회차별 표기 이름) ← `booth_participant`.
  인스타나 웹 도메인이 겹치면 자동 연결, **이름만 같으면 사람이 확인**(`/admin/brands/links`).
  확인은 **참가 단위**다(`exhibitor_link_candidate.participant_id`, 0073). 부스는 붙는 정보일 뿐이라 부스 없는 참가(brands.v1)도
  후보가 된다. 새 기능이 브랜드 판단에 부스를 필수로 두면 먼저 의심한다(`docs/decisions/2026-11-20_브랜드-대조는-참가-단위.md`).
  예외 하나: 같은 행사에 부스 없는 참가 사실(브랜드 먼저 인입)과 표기 이름이 같으면 그 참가 사실에 배정한다.
  판정은 `lib/exhibitor/identity.ts` 하나뿐(품질 게이트의 신원 앵커와 공유).
  소개·사진은 참가사에 복사하지 않는다 — 가장 최근 승인 부스가 원천.
  로미 근거 우선순위: 내 지난 반응(긍정만) > 이번 행사의 내 반응 > 브랜드의 지난 출전(피드당 2번) > 저작 근거.
  설계 `docs/superpowers/specs/2026-10-02-cross-exhibition-brand-design.md`.
- **커뮤니티는 웹에서 뺐다.** API(`/api/exhibitions/[slug]/community`·`/api/community/*`)와 `community_post`
  테이블은 iOS가 써서 남겨 둔다 — iOS에서도 빼면 그때 정리.
- 웹 푸시(FCM)는 키 미설정이라 비활성. iOS APNs 토큰은 `push_device`(0067).
- **브랜드 알림(iOS APNs)**: Vercel Cron `/api/cron/brand-appear`(매일 한국 10시대)가 새 참가 × 브랜드 하트를 골라
  `notification_log`(0071)에 넣고, 한국 10~20시에만 사용자마다 하루 한 번 묶어 보낸다. 한 줄 = (사용자, 브랜드, 박람회),
  `dedupe_key` unique라 다시 알리지 않는다. 기기가 없거나 브랜드 알림을 꺼도(muted, 11-19 Ted) 줄은 남아 알림함(`/api/me/notifications`)에 보인다.
  푸시 userInfo의 kind는 **"brand"**(iOS `PushLanding`)라 설정 이름 "brand_appear"와 다르다. APNs 키가 없으면 보내지 않고 queued로 둔다.
  드라이런 `npm run brand-appear:dry-run -- --days 30`(운영 읽기만). `docs/decisions/2026-11-19_브랜드-알림-서버.md`.
  브랜드 알림 대상은 `user_id`가 있는 토큰뿐(2026-11-17).
- **부스 노트 규칙은 `lib/notes/apply.ts` 한 곳**: 다녀왔어요(`visited_at`)는 평가와 따로, 하트는
  `hearted_at` + 옛 interest(must·curious=하트)를 함께 맞춘다. 브랜드 하트는 `brand_heart`(0068).
  부스 하트가 바뀌면 노트 PUT이 대표 브랜드의 브랜드 하트도 맞춘다(`lib/brands/follow.ts`, UI 23): 남기면 `source=booth`로 생기고,
  빼면 그 브랜드의 다른 부스 하트가 없을 때 booth 줄만 지운다. 직접 남긴 `source=direct`는 지우지 않는다(0074).
- **앱 이벤트**: `POST /api/analytics/events`가 iOS 묶음(`events[]`, `type='app'` + `name`)도 받는다(0066).
  위치, 메모, 회고 글은 속성에서 지운다(`lib/analytics/app-events.ts`). 설계 `docs/decisions/2026-11-17_ios-기반-api.md`.
- **인스타 댓글 자동 DM**: `/api/instagram/webhook`(서명 검증 → 키워드 매칭 → Private Reply). 규칙은
  `src/lib/instagram/rules.ts`(문구 해요체). 웹훅 재전송 중복 방지는 `ig_comment_dm`(0058)에 댓글 ID로 선점 —
  실패는 재시도 안 함. 설정·Meta 제약 `docs/decisions/2026-10-14_instagram-comment-auto-dm.md`.
  토큰(60일)은 cron `/api/cron/ig-token-refresh`가 7일마다 갱신해 `ig_token`(0059)에 두고,
  웹훅·게시 CLI는 `ig_token` > env 순으로 읽는다(`lib/instagram/token.ts`).
- **인스타 카드뉴스 자동 게시**: `npm run ig:publish -- --dir <JPG 폴더> --caption <캡션.txt> (--brands <브랜드.json> | --no-brands) [--check | --publish]`
  — **허락 문**: 게시물에 나온 브랜드를 `publish-brands.v1` 파일(출전 id와 용도)로 밝히거나, 없으면 `--no-brands`.
  허락 기록(participant_permission granted/partial + 맞는 allowed_use), 연락 금지, 내려 달라는 요청을 읽어 걸리면
  드라이런부터 멈춘다(`src/lib/instagram/permission-gate.ts`, 읽기만). 기본 드라이런, `--check`는 게시 직전(캐러셀 FINISHED)까지만 실제 API 확인, `--publish`면 공개 버킷 `ig-publish`에
  올리고 캐러셀 게시(`src/lib/instagram/publish.ts`). `instagram_business_content_publish` 권한 필요.
  `docs/decisions/2026-10-14_instagram-auto-publish.md`.

## LLM 사용 + 속도 규칙
- **탭(대화 턴)엔 LLM 금지** → 즉답(로컬 템플릿).
- **피드 큐레이션엔 LLM 없음**: `curateFeed`(feed/curate.ts)는 순수 결정론.
- **피드는 6칸짜리 결정 큐다**(`rhythm.ts`): 반응한 부스는 **전부** 큐에서 빠진다(되돌아보는 곳은 지도 색과 메모장).
  새로 고르기는 **목록 맨 아래 버튼으로만** — 읽는 중에 화면이 다시 그려지면 안 된다.
  새 카드는 '여기부터 새로 골랐어요' 아래에만 붙는다.
- Gemini 호출처는 3곳뿐: `/api/ai/booth-summary` · `/api/ai/community-summary` · `/api/exhibitions/[slug]/keywords`.
- **부스 요약은 런타임 호출이 0이다.** 요약은 보는 사람과 무관하게 소개글만으로 정해지므로 미리 만들어
  `booth/summaries.json`에 담았다. 시드가 합성한 소개는 애초에 부르지 않고(`booth/blurb.ts`), 나머지는
  파일에서 찾는다(`booth/summary-cache.ts`, 열쇠 = 소개글 해시 → 소개가 바뀌면 낡은 요약이 안 남는다).
  **새 전시를 붙이면 그 부스만 Gemini로 내려간다** — `scripts/booth-summary-dump.ts`로 입력을 뽑아
  `summaries.json`을 채우면 다시 0이 된다.
- **thinking off 필수**: 모든 호출에 `thinkingConfig.thinkingBudget=0`(gemini.ts). 빼면 8~15초+로 느려져
  타임아웃 → 전부 결정론 폴백된다.
- 래퍼 `src/lib/ai/gemini.ts`: `generateJSON`/`generateText`/`generateGrounded`(JSON 강제 불가 → `extractJSON`) ·
  server-only · 재시도+모델 폴백 · `hasGemini` 게이트.
- **지연 구간엔 무조건 로딩 UX**: `src/lib/loading-messages.ts` + `useRotatingMessage`.

## 옛 화면 (지금 닿지 않음)
> 근거 카드와 가치 온보딩은 옛 홈 화면에 있었고 지금 방문객 흐름에서 닿지 않는다(위 "주요 도메인"의 방문객 플로우).
> 코드를 되살리거나 고칠 때만 참고한다. 새 화면의 규칙으로 쓰지 않는다.

### 로미 문장 규칙 (근거 카드)
- `src/lib/feed/grounding.ts`(순수) → `curateFeed`가 FeedItem에 attach → `components/feed/interest-feed.tsx`가 렌더.
- ⚠️ **로미 발화에 가치 이름을 쓰지 않는다.** 한 줄 = **부스가 무엇인지(사실)** + **왜 지금 너한테(내가 실제로 누른 부스)**.
- 사실 절은 항상 채워진다: `roamInterpretation` > `recommendationReasons` > `summary` > `booth.name`
  (`booth.company`는 시드에서 카테고리 요약이라 쓰지 않는다).
- 근거 절은 피드당 최대 2번(`createLinkPicker`의 `maxUses`). 없을 수는 있어도 **지어내지 않는다**.

### 온보딩 = 가치 선택
- 별도 페이지 없음. 전시 홈의 `components/onboarding/value-onboarding.tsx` → `POST /api/me/values` →
  `recordSignal`(explicit) → 브레인 재증류 → 피드 즉시 반영.
- 가치 slug 단일 소스 `src/lib/values/index.ts`. 8개 밖의 값은 `/api/me/values`가 400.
- 취향 정확도는 `getTasteAccuracy`(booth_note 집계). 예전 `tasteProgress`는 삭제됐다.

## 디자인 시스템 v2 (2026-11-18 Ted 결정)
- **웹은 디자인 값을 Roam-design에서만 받는다.** 웹 안에 색, 간격, 글자, 둥글기, 그림자 값을 새로 정의하지 않는다.
  없는 토큰은 Roam-design `tokens/v2/*.json`에 PR로 먼저 더하고, `npm run tokens:sync -- --commit <sha>`로 받는다.
- 사본: `src/styles/v2/{tokens,theme}.css`(손으로 고치지 않는다), 고정 커밋 `src/styles/v2/source.json`. `npm run tokens:check`.
- v2 화면 파일은 `src/styles/v2/v2-guard.test.ts`의 `V2_FILES`에 넣는다. hex, 색 함수, Tailwind 임의값(`[13px]`, `[#fff]`),
  v1 변수(`var(--primary)`)와 v1 색 이름(`bg-card`), Tailwind 기본 눈금(`p-4`, `text-sm`, `rounded-lg`, `size-5`)이 들어오면 테스트가 깨진다.
  허용: `-v2-` 유틸리티, `var(--roam-v2-*)` 하나만 담은 임의값, 비율(`w-2/5`), 0. 검사에 예외를 늘려 지나가지 않는다.
- 화면 문구는 `src/lib/copy/v1.ts` 한 곳(iOS `V1Copy.swift`와 같은 문장). 이벤트는 `src/lib/analytics/app-track.ts`(iOS 이름 그대로).
- 계획, 화면 목록, 순서: `docs/decisions/2026-11-18_웹-디자인-v2-이전-계획.md`. 운영 콘솔(`/admin`)은 v1 그대로 둔다.

## 지도
- 방문객 지도는 v2(`components/map-v2/fair-map-screen.tsx`)다. 엔진은 `components/map/exhibition-map.tsx` 하나이고 v2는
  `renderLayer`로 그림만 바꾼다. 처음 열면 전체(`entry="whole"`, 11-16).
- 지도 화면은 `fixed inset-0`으로 방문객 레이아웃의 `max-w-md`를 벗어나 화면을 다 쓴다. 검색과 칩(위), 로미 줄이나
  카드(아래)의 실제 높이를 재서 엔진 `safeInsets`로 넘긴다. 맞추기, 이동 한계, 부스 초점이 그 사이 띠 안에서 계산된다.
  위아래 겹침을 고치려고 엔진에 고정 여백을 넣지 않는다.
- 출입구, 화장실 표식은 `components/map-v2/map-markers.ts`가 자리와 크기를 정한다(벽 바깥, 맞춘 배율에서 12px 이상).
  표식을 고치면 `map-markers.test.ts`의 겹침 0 검사가 모든 도면에서 지켜져야 한다.
- 웹 이벤트 알림은 이 탭 안 브라우저 알림뿐이다(서버 푸시 아님). 문구가 서버 발송을 약속하지 않게 한다.
- 뼈대 확인: 개발 서버에서 `?skeletonDelay=3000`(최대 10초, 프로덕션은 무시, `lib/dev/skeleton-delay.ts`).
- "다녀왔어요" 목록은 `/visited`(UI 6-10, 로그인 없이). 옛 `/exhibitions/[slug]/notes`는 여기로 넘긴다.
- 뒤로가기(`components/v2/back-button.tsx`): 앱 안에서 왔으면 `router.back()`, 아니면 전시 홈으로 push.
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
  - **부스 번호 전엔 `brands.v1`**(같은 `/admin/intake`, 파일 `version`으로 가름): 브랜드와 참가 사실, 빈 프로필 칸(intro, links, photos)만 넣고, 부스가 들어오면 인스타·도메인 또는 같은 행사 표기 이름으로 그 브랜드에 잇는다. `src/lib/intake/brands-{schema,plan,apply}.ts`, `docs/decisions/2026-11-10_브랜드-먼저-인입.md`.
  - **행사 행도 같은 `/admin/intake`**: `data/exhibitions/<slug>.json`(exhibition.v1, version 없이 `slug`로 가름)을 올리면 미리보기("새로 만들어요"/"이미 있어요(<id>)") 뒤 적용으로 만든다. 같은 slug는 덮어쓰지 않고 막는다. 콘솔 `fetch` 금지. 검사는 화면과 드라이런이 같은 `checkIntakeFile`(`src/lib/intake/{schema,exhibition-file}.ts`, `docs/decisions/2026-11-22_행사-행-인입.md`).
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
호출부 0: `components/map/map-view.tsx`(v1 지도 화면, 11-18 v2로 바뀜. 테스트만 읽는다) · `ai/booth-recommender.ts` · `onboarding/onboarding-{flow,inference,types}.ts` · `stores/onboarding.ts` ·
repo의 `logAiQuery`/`topQueryKeywords`(+ `ai_query_log` 테이블).

**한 번도 안 쓴 UI 모듈**(참조 0): `ui/{slider,separator,progress}.tsx` · `common/rating.tsx`.
(쓰는 건 `progress-circle.tsx`뿐. `menu.tsx`의 `MenuSeparator`는 Radix를 직접 그린 별개다.)
**안 쓰는 하위 export**(모듈은 살아 있음): `states.tsx`의 `Spinner` · `card.tsx`의
`Card{Header,Title,Description,Content,Footer}`(호출부는 `<Card className=…>`) ·
`MenuGroup`/`MenuGroupLabel` · `SelectGroup` · `SheetTrigger`/`SheetClose`.
⚠️ **이것들은 디자인 시스템에도 넣지 않는다.** 코드에 없는 걸 Figma에 만들면 디자이너가
그걸 쓰고, 그때 가서 컴포넌트를 거꾸로 만들게 된다. Figma에 넣을 땐 **호출부가 1곳이라도
있는지 먼저 센다.**

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
- 모든 커밋/PR은 이유를 `docs/decisions/`에 기록한다. `/why` 스킬은 이 레포에 없고 Roam-ios에만 있다
  (`../Roam-ios/.claude/skills/why/SKILL.md`). 양식이 필요하면 그 파일을 읽는다.
