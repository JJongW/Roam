# Roam — Exhibition Navigator

전시·박람회 **범용** 모바일 가이드 플랫폼. 계정은 닉네임 무비번 또는 Google OAuth.
**열람은 공개, 로미는 로그인**(`src/proxy.ts`) — 홈·전시 상세·지도·부스 상세는 계정 없이
열리고, 그보다 깊은 경로(메모장·커뮤니티·회고)와 로미의 개인화는 로그인이 필요하다. 방문객이 부스를
발견하고, 혼잡을 피하고, 개인화된 동선을 따라가게 돕는다. + 주최자용 관리 콘솔
(운영·분석). 특정 전시 전용이 아니다 — 현재 들어 있는 **2026 서울국제도서전(SIBF)
데이터는 시드/데모일 뿐**, 다른 전시로 교체 가능.
> ⚠️ 원래 무계정(anonymous) 설계 → 로그인 필수 → **정보 열람은 다시 공개**로 정착.
> 계정 벽을 첫 화면에 세우는 대신 "기억·연속성"으로 로그인을 설명하는 방향이다.
> 익명 세션(`roam_session`) 인프라는 여전히 공존한다.

> 구조·플로우·규약이 바뀌면 이 파일을 갱신한다. CLAUDE.md는 프로젝트 전반을 담는다.

## 제품 방향 (재정의 진행 중 — 2026-07-07, 아직 미구현)
> ⚠️ 아래는 **지향 방향·설계**다. 현재 코드는 아직 이 구조가 아님. 신규 작업은 이 방향에 정렬.
- **정보 전달기 → 관람 동행자.** LLM을 기능적으로만 쓰는 챗봇이 아니라, 사용자를 기억하고 계속 나아지는 에이전트로. 앱은 *판단 근거*를 주고 사용자가 스스로 판단. 동선은 제품이 아니라 부산물. `docs/decisions/2026-07-07_companion-reframe.md`.
- **관람 아크(전·중·후)로 "충분히 즐겼다" 설계.** 3막: 약속(개인 목표) → 비트(진행 축적) → 회고(peak-end 해소). 회고 = 기억 쓰기. 같은 문서 §5-B.
- **지식 4계층 = 살아있는 장기메모리.** L1 정적 도메인(부스 근거·RAG) / L2 휘발 상황(실시간) / L3 에피소드(관람 1회) / L4 종단 사용자 모델(영속·성장). **저장(축적) 아니라 증류**(정제→압축→승격→아카이브→재증류). 로그인 필수 전환이 L4(크로스-전시 기억)를 비로소 가능케 함. `docs/decisions/2026-07-07_knowledge-architecture.md`.
- **에이전트 구조 = 서비스가 판단, LLM은 말만.** Onboarding·Memory·Planner·Reasoner·Recommendation·Companion·Reflection. **대부분 결정론 모듈**(confidence·피로도·재계획은 수학), LLM은 Companion 한 겹(언어 표면). 7개 LLM 에이전트는 안티패턴. Memory Engine(L1~L4) 블랙보드 공유. `docs/decisions/2026-07-07_agent-architecture.md`.
- **선행 과제(블로커 아님)**: L1 근거 데이터 = 부스 enrichment. 현재 **79/256(31%) 기본 필드 채워짐**. 근거 카드(Phase F)는 **코드-온리 v1로 shipped**(런타임 겹침으로 왜맞음 생성) — 저작 필드(roamInterpretation·recommendationReasons·valueTags)는 아직 16개 부스만, 나머지는 채워질수록 카드 품질 상승. 갭 = 저작 커버리지.

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
- **DB**: `supabase/migrations/000N_*.sql` — **2026-09-06부터 git에 올라간다**(`/supabase/*` 무시, `migrations`만 예외). 기기마다 따로 번호를 매기다 0035~0037이 겹쳤던 사고 때문이다. `seed.sql`·`reset.sql`·`.temp`는 여전히 제외. 적용은 여전히 손(Supabase SQL Editor).

## 주요 도메인
- **방문객 플로우**: 전시 홈(가치 온보딩 + 관심 피드 + 근거 카드) → 인터랙티브 지도 →
  부스 상세(리뷰·이벤트·웰컴키트) → 노트·커뮤니티 → "오늘 관람 마치기"(회고).
  앞 셋은 공개, 노트·커뮤니티·회고부터 로그인.
- **부스/이벤트**: `Booth`(code 자연키, kind exhibitor|facility, tags=카테고리 slug, aliases 공동입점), `BoothEvent`.
- **주최자 콘솔** `/admin`: 전시·부스·이벤트·대기 관리 + 분석 대시보드(히트맵·인기부스·동선흐름·퍼널).
- **부가**: 커뮤니티 포스트(미디어), 개인 메모장(visited/skip/메모/사진), 북마크, 푸시(FCM — **현재 키 미설정이라 비활성**), 닉네임 인증.
- **소유자 키**: 노트·브레인·신호·북마크는 `app_user.id`. ⚠️ 리뷰·커뮤니티 포스트는 아직
  `visitor_session.id` 기준이라 계정에 안 묶인다(미해결, 감사 P1-2).
- **로그인(부분 게이트)**: `app_user`(닉네임=공개키) 단일 계정 테이블. 닉네임 무비번 + **Google OAuth**(Supabase Auth). 신원은 앱 자체 쿠키 `roam_user`로 통일 — OAuth 콜백(`/auth/callback`)은 Supabase 세션으로 identity만 읽고 `signOut`, `app_user` upsert 후 `roam_user` 발급. mock 모드(Supabase 키 없음)엔 Google 버튼 숨김(닉네임만). **게이트** `src/proxy.ts`(Next 16 proxy 컨벤션): `roam_user` 없으면 `/login?next=`로 307. 공개=`/`·`/privacy`·`/terms`(구글 OAuth 심사가 직접 연다 — 막으면 심사 탈락)와 정확 패턴 `/exhibitions/[slug]`·`/exhibitions/[slug]/map`·`/booths/[id]`. 하위 경로는 패턴에 안 걸려 자동으로 로그인 필수. 예외 프리픽스=`/login`·`/auth`·`/admin`(자체 코드 게이트)·`/api`·정적. 로미의 개인화는 라우트가 아니라 **컴포넌트 레벨**에서 막는다. 로그인 화면 `src/app/login/`. 외부 설정·설계: `docs/decisions/2026-07-07_google-oauth-login.md`.
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

`/api/ai/screenshot`은 다른 부류 — API 라우트 자체는 살아있고 완성돼 있으나(vision 인식 +
결정론 매칭 분리 설계), **부르는 프론트 화면이 코드 어디에도 없다**. 저관여 진입 재설계
(`feat/low-involvement-entry`, 머지 안 됨) 잔재 — 그 방향이 피드 기반 온보딩으로 대체되며
백엔드만 남음. 되살리려면 진입점(예: 피드 상단 "스크린샷으로 찾기")부터 새로 만들어야 한다.

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

## 부스 enrichment
- **인입 틀 `intake.v1`이 표준 경로다**(2026-09-06). 전시 무관 정규형 파일
  `data/intake/<slug>.json` 하나를 `/admin/intake`에 올리면 부스·홀·분야·저작 6종이 들어간다.
  전시별 JSON·전용 스크립트·손으로 쓴 UPSERT 마이그레이션은 **더 만들지 않는다**.
  계약·규칙: `src/lib/intake/schema.ts`, 계획 계산은 순수 함수 `src/lib/intake/plan.ts`,
  설계 `docs/superpowers/specs/2026-09-06-exhibition-intake-design.md`.
  - 좌표는 계약에 없다 — `FLOORPLANS[slug]`가 `code`로 대준다. 두 곳에 두면 갈라진다.
  - **빈 칸만 채운다.** 양쪽에 값이 있고 다르면 `conflicts`로 빠지고 쓰지 않는다(사람이
    미리보기에서 "충돌도 덮어쓰기"를 켜야 덮인다). 배열은 합집합을 만들지 않는다.
  - `categorySlug`는 명시로만 받는다 — 전역 unique이고 `booth.tags`에 그대로 들어가
    스코어링이 읽는 값이라 한글 이름에서 파생하면 쓰레기가 된다.
  - 인입 파일을 레포에 남기는 게 재생 경로다: "파일 → 인입 재실행". 운영 쓰기 전
    `data/intake/_backup/`에 현재 값을 떠 둔다(되돌리기 버튼은 없다).
- 부스 한 건 편집은 `/admin/booths`(`booth-manager.tsx` → `PATCH /api/booths/[id]`).
- 인스타 자동 스크래핑 불가/금지 → **운영자 수동 입력**(`docs/booth-enrichment.md` 양식).
- 소스 `src/lib/booth/enrichment-sibf-2026.json`(code 키, **97개 항목**). 타입 `BoothEnrichment`.
  채움 현황: `summary` 97 · `themeTags` 66 · `thingsToDo` 45 · `timing` 31 ·
  `valueTags`/`roamInterpretation`/`recommendationReasons`/`memoryHooks` 각 **16**.
- `seed.ts`가 부스에 attach. `themeTags`(=slug)는 `booth.tags`에 병합 → 추천 스코어링에 **LLM 없이 즉시** 반영. 굿즈/요약/팁은 부스 상세 노출 + 온보딩 추론 프롬프트 어휘로 주입.
- **하우스 아카이브**: `enrichment-house-archive-2026.json`(총 104부스 중 99곳에 항목 존재, 그 99곳은 `summary`·`sourceUrl`·`roamInterpretation`·`image` 전부 채워짐). 원본은 주최 측 브랜드 디렉터리 CSV + 인스타 이미지(`public/house_archive_br/`, gitignore) → `node scripts/gen-house-archive-enrichment.mjs`가 JSON과 `public/booths/house-archive/{CODE}.webp`(트림·크롭·480px, 장당 ~20KB)를 함께 생성하고 **저작 필드는 재생성 때 보존**한다. 운영 반영은 `0030` 마이그레이션 — `booth`(설명·이미지·인스타)와 `booth_enrichment`(요약·로미 한 줄) **둘 다** 채워야 한다. 피드는 `listBoothsByExhibitionId`가 조인하는 `booth_enrichment`를 읽으므로 booth만 채우면 로미 한 줄이 운영에서만 빈다. 스크립트는 또한 원본 이미지를 Supabase Storage private bucket `booth-originals/house-archive-2026/`에 백업한다(handle 기반 collision-proof path, first-write-wins immutability) — local 폴더 손상 시 bucket 파일들을 `public/house_archive_br/house_archive_images/`로 다운로드 후 스크립트를 다시 실행해 복구한다.
- **근거 카드(Phase F)**: 피드 각 부스에 "무엇/왜맞음/근거/뭘하면/신뢰" = `src/lib/feed/grounding.ts`(순수) → `curateFeed`가 FeedItem에 attach, **`components/feed/interest-feed.tsx`가 인라인 렌더**.
  ⚠️ **로미 발화에 가치 이름을 쓰지 않는다.** 한 줄은 두 절 = **부스가 무엇인지(사실)** + **왜 지금 너한테(내가 실제로 누른 부스)**. 사실은 저작 `roamInterpretation` > 가치별 `recommendationReasons` > 공식 `summary` > 부스명 순으로 **항상 채워진다**(부스명 폴백이 마지막 안전망 — `booth.name` 사용, `booth.company`는 시드 데이터에서 카테고리 요약이라 쓰지 않는다). 근거 절은 `curateFeed`가 최근 긍정 반응(끌림·가봄) 중 가치가 겹치는 부스를 찾아 넘기고, **피드당 최대 2번**(`createLinkPicker`의 `maxUses` 기본값)까지 붙인다. 근거 절만 없을 수 있고(사실 절은 비지 않는다), 없는 근거를 지어내진 않는다(빈말 금지). 예전엔 "발견 쪽 부스야"·"네 관심 가치랑 겹쳐"로 분류를 되읽어줬는데, 현장에서 그건 정보가 아니었다.
- **최소 필수 6종**(운영 입력 시 반드시): `summary`(공식+한줄해석)·`valueTags`·`recommendationReasons`·`thingsToDo`·`timing`·`memoryHooks`. 가장 중요 4=공식정보+해석+가치태그+근거. 양식 `docs/booth-enrichment.md`, 저작 예시 `A1001`·`A1101`. 저작 필드가 없는 부스는 런타임 겹침으로 파생된다.
- Supabase `booth_enrichment` 테이블(`0013` 기본 + `0021` 근거카드 컬럼: value_tags·roam_interpretation·recommendation_reasons·things_to_do·timing·memory_hooks 등), repo `getBoothDetail`가 전 필드 매핑. 데이터 동기화: `0023_booth_enrichment_sync.sql`이 mock JSON 전체(97행)를 멱등 UPSERT(재생성 시 이 마이그레이션 갱신). ⚠️ seed.sql의 enrichment 블록은 구 6컬럼·구 데이터라 stale — prod 진실은 마이그레이션.

## 데이터 주입 (전시 시드)
- **새 전시 붙이기**: ① 도면 추출 → `floorplan-<slug>.json`(부스 배치 + `"venue"` 한 줄)
  + `FLOORPLANS`에 등록 한 줄 ② `data/intake/<slug>.json`을 `/admin/intake`로 업로드.
  ②가 예전의 시드 SQL·전용 스크립트를 전부 대체한다.
- **장소(venue)와 배치(layout)는 다른 것이다**(2026-09-06). 벽·입출구·화장실·장식은
  **전시가 아니라 건물의 속성**이라 `src/lib/venues/<venue>.json`에 한 번 저작하고 그 홀에서
  열리는 모든 전시가 재사용한다. 전시가 말하는 건 부스 배치뿐. 합성은 순수 함수
  `src/lib/floorplan/compose.ts`. venue 파일은 미터 제원과 표준부스 크기를 들고 있어서,
  새 도면을 받으면 "표준부스가 3×3m(플라츠는 3×2m)로 깨끗하게 떨어지나"로 스케일이 검증된다.
  - 입출구를 아직 모르는 장소는 **비워둔다**(합성기가 하단 중앙을 임시로 쓴다). 지어 넣으면
    그 홀의 다음 전시까지 그 거짓말을 물려받는다. `coex-hall-c`가 지금 그 상태.
  - ⚠️ **SIBF만 예외** — 손 트레이싱한 개략도라 비례가 실제와 안 맞고(A홀 종횡비 2.124 :
    실측 2.000, B1은 아예 안 맞음) 미터 환산이 성립하지 않아 venue 위에 못 얹는다.
    `buildSibf()`가 남아 있고, 도면을 다시 뽑아야 합성으로 옮길 수 있다.
- mock(`seed.ts`·`seed-sif.ts`·`seed-house-archive.ts`)은 아직 전시별 JSON을 import한다 —
  운영은 인입으로 도는데 mock만 옛 방식이다(미정리).
- 소스: `src/lib/floorplan-sibf.json`(부스 좌표·코드·kind·분야) + `official-sibf-2026.json`(공동입점) → `seed.ts`. 런북 `.claude/skills/booth-data-entry`.
- 운영 DB에는 **SIBF 외에 `sif-2026`(서울일러스트레이션페어)도 들어 있다** — 전시 추가는 데이터로 가능(코드 변경 불필요).
- ⚠️ `node scripts/gen-seed.mjs`는 **실행 불가** — `supabase/seed.sql`을 열려는데 `supabase/`가 gitignore라 레포에 없다. 재생성이 필요하면 경로부터 손봐야 한다.

## 검증 (변경 후 필수)
```
npx tsc --noEmit
npx vitest run
npx eslint <changed paths>
```
- 모든 커밋/PR은 `/why`로 이유 기록(메모리 규칙).

### ⚠️ "없음"과 "비어 있음"을 구별하지 않는 경로들
2026-09-06에 같은 뿌리의 사고가 두 번 났다 — 하나는 운영 데이터를 실제로 지웠다.

| 경로 | 거짓말 | 막는 법 |
|---|---|---|
| 좁힌 컬럼 조회 | 안 가져온 컬럼이 **빈 값**으로 채워져 옴 | 목록 조회는 `BoothListItem`(images·longDescription 없음)을 반환한다. 전 필드는 `listBoothsFull`·`getBoothDetail` |
| Zod `.partial()` | **`default()`를 안 막는다** — 안 보낸 키가 빈 값으로 생김 | 부분 수정엔 `boothEnrichmentPatchSchema`(default 없음). `authorInputSchema.partial()` 금지 |
| PostgREST 실패 | 예외가 아니라 `data: null` → `?? []`가 "0건"으로 위장 | 읽기는 `inChunks`(에러 시 throw), 쓰기는 `wrote()`/`loggedWrite()` |
| `head:true` 카운트 | **없는 테이블에도 에러를 안 낸다** | 존재 확인은 `select().limit(1)` |

**규칙**: 저장소가 준 값을 "비었다"로 해석하기 전에, 그 읽기가 그 필드를 정말
가져오는지 구현에서 확인한다. 이름과 타입은 믿을 근거가 아니다 —
`listBoothsByExhibitionId`는 이름이 "부스를 준다"고 말했고 타입은 `Booth`라고
말했지만 둘 다 사실이 아니었다.

**쓰기 경로가 막는다**: `undefined`인 필드는 페이로드에서 빼는 걸 저장소가 한다.
호출부마다 조심하는 구조는 새 호출부가 생길 때마다 같은 사고가 난다.

### ⚠️ mock 통과 ≠ 검증
`MockRepository`는 `SupabaseRepository`의 **인터페이스**를 흉내내지 **행동**을 흉내내지
않는다. 저장소를 건드리는 변경은 mock 테스트가 전부 통과해도 운영에서 다르게 돈다.

| | mock | supabase |
|---|---|---|
| 컬럼 좁힘 | **supabase처럼 뺀다**(2026-09-06 이후) | `BOOTH_LIST_COLS`가 `images`·`long_description` 제외 |
| 실패 | throw | `data: null` — `?? []`가 "0건"으로 위장 |
| `.in()` 길이 상한 | 없음 | 있음(SIF 914부스 = 7.3KB, 상한 근처) |
| jsonb vs text[] | 구분 없음 | 구분함 |

2026-09-06에 인입 틀이 부스를 `listBoothsByExhibitionId`로 읽어 `images`를 늘 빈 칸으로
보고 덮어쓰려 했는데, **계획 테스트 12개가 전부 통과한 채로** 그 버그가 살아 있었다.
운영 dry-run이 유일한 검출 경로였다.

- **저장소 변경은 운영 dry-run까지 해야 "됐다"**: `.env`(운영 자격증명)로 `npx next dev`를
  띄우고 읽기 전용 경로를 실제로 태운다. mock 강제는 그 반대:
  `NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev`
- mock의 역할은 **테스트 픽스처**다(라우트 통합 테스트 8개 파일). 그 이상으로 취급하지 않는다.
