# Roam — 부스 탐색 서비스

박람회와 페어에서 관심 있는 부스를 찾고 찾아가도록 돕는 부스 탐색 서비스(모바일 웹) + 주최자 관리 콘솔(`/admin`).
특정 박람회 하나에 묶이지 않는다. 들어 있는 행사 데이터(SIBF 등)는 전부 교체 가능한 데이터다.
코드 식별자(`exhibition`, `/exhibitions`)는 사용자에게 보이지 않으므로 그대로 둔다.

> 이 파일은 **규칙과 함정**만 짧게 담는다. 설명과 세부는 `docs/reference/domain-notes.md`, 이력·수치는 `docs/reference/project-notes.md`.
> 구조·플로우·규약이 바뀌면 이 파일을 갱신한다.

## 브랜드 규칙 (최상위)
@../Roam-design/docs/brand/00_brand-rules.md

이 규칙이 이 레포 문서보다 우선한다. 여기에 옮겨 적지 않는다. 어긋나는 코드와 문구 목록:
`../Roam-design/docs/decisions/2026-11-02_브랜드-규칙-재정의.md`. 작업 조율은 Roam-design 세션(헤더)이 한다.

## 작업 규칙
- 화면 작업은 Figma를 따른다. **Figma에 없는 화면이나 흐름은 만들지 말고 보고하라.**
- 비밀값(`.env` 등)은 열거나 출력하지 않는다.
- **디자인 값은 Roam-design 토큰(v2)에서만 받는다. 예외 없다**(아래 "디자인 시스템 v2").
- 문구와 브랜드 판단은 `../Roam-design/docs/brand/00_brand-rules.md`를 따른다.
- 제품 방향: 앱은 판단 근거를 주고 사용자가 판단한다. **서비스가 판단, LLM은 말만**(결정은 결정론 모듈). 세부 `docs/reference/domain-notes.md`.

## 스택
Next.js 16(App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui(Radix) ·
framer-motion · zustand · Zod · Supabase(Postgres) · Google Gemini(@google/genai).

## 핵심 아키텍처
- **데이터 레이어** `src/lib/repositories`: `Repository` 인터페이스 + `MockRepository`·`SupabaseRepository`.
  Supabase 키가 있으면 Postgres, 없으면 in-memory mock(`src/lib/mock/seed.ts`). `src/lib/env.ts`의 `dataMode`.
- **추천 엔진** `src/lib/engine`: 순수·결정론(`scoring.ts`, `service.ts`의 `rankForExhibition`). 동선 엔진은 **없다**(제거됨).
- **API** `src/app/api/*`: 모든 입력 Zod 검증(`src/lib/schemas`), envelope `{ data } | { error }`(`src/lib/api/http.ts`). 무계정 세션 `ensureSession`(`roam_session`)도 공존.
- **쓰기 규약(중요)**: PostgREST는 실패해도 예외를 안 던진다. `supabase/repository.ts`의 모든 쓰기는
  `wrote()`/`maybeWrote()`(도메인, 실패=throw) 또는 `loggedWrite()`(텔레메트리, 실패=에러 로그)를 **반드시** 통과시킨다.
- **상태**: 서버가 진실(RSC + Route Handlers). zustand는 휘발성 클라 상태만. localStorage 영속: `roam-visit/auth` 등.
- **요청 단위 캐시**: 행사는 `repositories/cached.ts`의 `getExhibitionCached`(React `cache`)로 읽는다.
- **DB**: `supabase/migrations/000N_*.sql`은 git에 올린다(나머지 `supabase/*`는 무시). 번호는 main 기준, 적용은 손(Supabase SQL Editor).
- 도메인 타입 단일 소스: `src/lib/types/index.ts`.

## 로그인 게이트 (세부 `docs/reference/domain-notes.md`)
- **열람은 공개, 로미의 개인화는 로그인**(컴포넌트 레벨에서 막는다). 신원은 쿠키 `roam_user`, 게이트는 `src/proxy.ts`.
- 앱 안 로그인은 페이지를 옮기지 않고 `useAuthStore.getState().openLogin(source)`로 시트(`LoginSheet`)를 띄운다.
- 공개 경로를 바꿀 땐 domain-notes의 목록을 따른다. ⚠️ `/privacy`·`/terms`는 구글 OAuth 심사가 직접 연다 — 막으면 심사 탈락.
- 소유자 키: 노트·브레인·신호·북마크·리뷰·커뮤니티 포스트 전부 `app_user.id`.
- ⚠️ 닉네임 로그인 제거는 **보류 중**(기존 계정 마이그레이션 미정) — 임의로 끄거나 지우지 말 것.

## 주요 도메인 (세부 `docs/reference/domain-notes.md`)
- **방문객 플로우**: 홈 → 지도(`/exhibitions/[slug]`는 `/map`으로 넘긴다) → 부스 상세(브랜드 줄 하트 UI 19, `stores/brand-hearts.ts`).
  옛 홈 화면은 닿지 않는다(`docs/legacy-screens.md`). 피드 API는 iOS가 써서 남아 있다.
- **부스/이벤트**: `Booth`(code 자연키, kind exhibitor|facility, tags=카테고리 slug, aliases 공동입점), `BoothEvent`.
- **참가사**: `exhibitor` ← `exhibition_participant` ← `booth_participant`. 이름만 같으면 사람이 확인한다.
  확인은 **참가 단위**다. 새 기능이 브랜드 판단에 부스를 필수로 두면 먼저 의심한다. 판정은 `lib/exhibitor/identity.ts` 하나뿐.
- **커뮤니티는 웹에서 뺐다.** API와 `community_post` 테이블은 iOS가 써서 남겨 둔다.
- 웹 푸시(FCM)는 키 미설정이라 비활성. iOS APNs 토큰은 `push_device`(0067).
- **브랜드 알림**: Vercel Cron `/api/cron/brand-appear` → `notification_log`(0071). 푸시 kind는 **"brand"**(설정 이름 "brand_appear"와 다름).
- **부스 노트 규칙은 `lib/notes/apply.ts` 한 곳**: 다녀왔어요(`visited_at`)는 평가와 따로, 하트는
  `hearted_at` + 옛 interest(must·curious=하트)를 함께 맞춘다. 브랜드 하트는 `brand_heart`(0068)로 따로.
- **앱 이벤트**: `POST /api/analytics/events`가 iOS 묶음도 받는다(0066). 위치, 메모, 회고 글은 속성에서 지운다(`lib/analytics/app-events.ts`).
- **인스타 댓글 자동 DM** `/api/instagram/webhook`: 규칙 `src/lib/instagram/rules.ts`(문구 해요체). 토큰은 `ig_token` > env(`lib/instagram/token.ts`).
- **인스타 카드뉴스 게시** `npm run ig:publish`: 브랜드 허락 문(`--brands` 또는 `--no-brands`)을 통과해야 한다. 기본은 드라이런.

## LLM 사용 + 속도 규칙
- **탭(대화 턴)엔 LLM 금지** → 즉답(로컬 템플릿). **피드 큐레이션엔 LLM 없음.**
- Gemini 호출처는 3곳뿐: `/api/ai/booth-summary` · `/api/ai/community-summary` · `/api/exhibitions/[slug]/keywords`.
- **부스 요약은 런타임 호출이 0이다**(`booth/summaries.json` 캐시). 새 행사를 붙이면 `scripts/booth-summary-dump.ts`로 채운다.
- **thinking off 필수**: 모든 호출에 `thinkingConfig.thinkingBudget=0`(`src/lib/ai/gemini.ts`).
- **지연 구간엔 무조건 로딩 UX**: `src/lib/loading-messages.ts` + `useRotatingMessage`.

## 디자인 시스템 v2 (2026-11-18 Ted 결정)
- **웹은 디자인 값을 Roam-design에서만 받는다.** 웹 안에 색, 간격, 글자, 둥글기, 그림자 값을 새로 정의하지 않는다.
  없는 토큰은 Roam-design `tokens/v2/*.json`에 PR로 먼저 더하고, `npm run tokens:sync -- --commit <sha>`로 받는다.
- 사본: `src/styles/v2/{tokens,theme}.css`(손으로 고치지 않는다), 고정 커밋 `src/styles/v2/source.json`. `npm run tokens:check`.
- v2 화면 파일은 `src/styles/v2/v2-guard.test.ts`의 `V2_FILES`에 넣는다. hex, 색 함수, Tailwind 임의값(`[13px]`, `[#fff]`),
  v1 변수(`var(--primary)`)와 v1 색 이름(`bg-card`), Tailwind 기본 눈금(`p-4`, `text-sm`, `rounded-lg`, `size-5`)이 들어오면 테스트가 깨진다.
  허용: `-v2-` 유틸리티, `var(--roam-v2-*)` 하나만 담은 임의값, 비율(`w-2/5`), 0. 검사에 예외를 늘려 지나가지 않는다.
- 화면 문구는 `src/lib/copy/v1.ts` 한 곳(iOS `V1Copy.swift`와 같은 문장). 이벤트는 `src/lib/analytics/app-track.ts`(iOS 이름 그대로).
- 계획: `docs/decisions/2026-11-18_웹-디자인-v2-이전-계획.md`. 운영 콘솔(`/admin`)은 v1 그대로 둔다.

## 지도 (세부 `docs/reference/domain-notes.md`)
- 방문객 지도는 v2(`components/map-v2/fair-map-screen.tsx`), 엔진은 `components/map/exhibition-map.tsx` 하나. 처음 열면 전체(`entry="whole"`).
- 위아래 겹침은 실제 높이를 재서 `safeInsets`로 넘긴다. 엔진에 고정 여백을 넣지 않는다.
- 표식(`map-markers.ts`)을 고치면 `map-markers.test.ts`의 겹침 0 검사가 모든 도면에서 지켜져야 한다.
- 웹 이벤트 알림은 이 탭 안 브라우저 알림뿐이다(서버 푸시 아님). 문구가 서버 발송을 약속하지 않게 한다.
- "다녀왔어요" 목록은 `/visited`(UI 6-10, 로그인 없이). 옛 `/exhibitions/[slug]/notes`는 여기로 넘긴다.
- **장소(venue)와 배치(layout)는 다르다.** 건물은 `src/lib/venues/<venue>.json`, 행사는 부스 배치만. 입출구를 모르는 장소는 **비워둔다**.

## 데이터 주입 (세부 `docs/reference/domain-notes.md`)
- **인입 틀 `intake.v1`(`/admin/intake`)이 유일한 경로다.** 행사별 JSON·전용 스크립트·손 UPSERT 마이그레이션은 더 만들지 않는다.
  부스 번호 전엔 `brands.v1`.
- **빈 칸만 채운다.** 다른 값은 `conflicts`로 빠진다.
- `categorySlug`는 명시로만 받는다 — `booth.tags`로 들어가 스코어링이 읽으므로 한글 이름에서 파생 금지.
- 운영 쓰기 전 `data/intake/_backup/`에 현재 값을 떠 둔다(되돌리기 버튼 없음).
- 인스타 자동 스크래핑 불가/금지 → 운영자 수동 입력(`docs/booth-enrichment.md` 양식).

## ⚠️ 데이터 함정 (표와 사례 `docs/reference/data-pitfalls.md`)
- 저장소가 준 값을 "비었다"로 해석하기 전에, 그 읽기가 그 필드를 정말 가져오는지 구현에서 확인한다. 이 뿌리로 운영 데이터를 지운 적이 있다.
- 부분 수정에 `authorInputSchema.partial()` 금지(`default()`가 빈 값을 만든다) → `boothEnrichmentPatchSchema`.
- 존재 확인은 `head:true` 카운트가 아니라 `select().limit(1)`.
- **mock 통과 ≠ 검증.** 저장소 변경은 운영 dry-run(읽기 전용 경로)까지 해야 "됐다".
- 데드코드 목록은 `docs/reference/dead-code.md`. 거기 있는 건 믿지 말고 디자인 시스템에도 넣지 않는다.

## 검증 (변경 후 필수)
```
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```
- 모든 커밋/PR은 이유를 `docs/decisions/`에 기록한다. 양식은 `../Roam-ios/.claude/skills/why/SKILL.md`(이 레포엔 `/why` 스킬 없음).
