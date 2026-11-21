# 도메인 세부 — CLAUDE.md에서 옮겨 온 설명

_CLAUDE.md에서 옮겨 옴(2026-11-21). CLAUDE.md에는 규칙 한 줄과 이 문서 링크만 남겼다._

## 제품 방향 (2026-07 기준. 브랜드 규칙과 어긋나면 브랜드 규칙)
**박람회를 같이 다니는 동행자**: 앱은 판단 근거를 주고 사용자가 판단한다. 동선은 제품이 아니라 부산물.
**서비스가 판단, LLM은 말만** — 결정은 결정론 모듈, LLM은 언어 표면 한 겹. 새 작업은 이 방향에 정렬.
설계: `docs/decisions/2026-07-07_{companion-reframe,knowledge-architecture,agent-architecture}.md`. 이력은 `project-notes.md`.
옛 디자인 톤 메모: Apple HIG + Toss(미니멀·반응형·라이트/다크). 지금 화면 값은 Figma와 Roam-design v2 토큰이 정한다.

## 로그인 게이트
- **열람은 공개, 로미의 개인화는 로그인.** `app_user` 단일 계정(닉네임 무비번 + Google OAuth).
  신원은 앱 쿠키 `roam_user` — OAuth 콜백(`/auth/callback`)은 Supabase 세션으로 identity만 읽고 `signOut`한다.
  mock 모드엔 Google 버튼 숨김. 설계: `docs/decisions/2026-07-07_google-oauth-login.md`.
- 게이트 `src/proxy.ts`: `roam_user` 없으면 `/login?next=`로 307. 앱 안에서 로그인을 부르는 자리는 페이지를 옮기지 않고
  `useAuthStore.getState().openLogin(source)`로 지금 화면 위 시트(UI 5-04, `LoginSheet`)를 띄운다. 내용은 `/login`과 같은 `LoginPanel`(11-20 Ted).
- 공개 = `/`·`/privacy`·`/terms`·`/survey`(공개 설문, `docs/decisions/2026-10-16_공개-설문-페이지.md`) + 정확 패턴 `/exhibitions/[slug]`·`/exhibitions/[slug]/map`·`/booths/[id]`.
  하위 경로는 패턴에 안 걸려 자동으로 로그인 필수. 예외 프리픽스 = `/login`·`/auth`·`/admin`(자체 게이트)·`/api`·정적.
- 로미 개인화는 라우트가 아니라 **컴포넌트 레벨**에서 막는다.

## 참가사(행사를 넘는 브랜드)
- `exhibitor` ← `exhibition_participant`(회차별 표기 이름) ← `booth_participant`.
  인스타나 웹 도메인이 겹치면 자동 연결, **이름만 같으면 사람이 확인**(`/admin/brands/links`).
- 확인은 **참가 단위**다(`exhibitor_link_candidate.participant_id`, 0073). 부스는 붙는 정보일 뿐이라 부스 없는 참가(brands.v1)도
  후보가 된다(`docs/decisions/2026-11-20_브랜드-대조는-참가-단위.md`).
  예외 하나: 같은 행사에 부스 없는 참가 사실(브랜드 먼저 인입)과 표기 이름이 같으면 그 참가 사실에 배정한다.
- 판정은 `lib/exhibitor/identity.ts` 하나뿐(품질 게이트의 신원 앵커와 공유).
- 소개·사진은 참가사에 복사하지 않는다 — 가장 최근 승인 부스가 원천.
- 로미 근거 우선순위: 내 지난 반응(긍정만) > 이번 행사의 내 반응 > 브랜드의 지난 출전(피드당 2번) > 저작 근거.
  설계 `docs/superpowers/specs/2026-10-02-cross-exhibition-brand-design.md`.

## 브랜드 알림(iOS APNs)
- Vercel Cron `/api/cron/brand-appear`(매일 한국 10시대)가 새 참가 × 브랜드 하트를 골라
  `notification_log`(0071)에 넣고, 한국 10~20시에만 사용자마다 하루 한 번 묶어 보낸다. 한 줄 = (사용자, 브랜드, 박람회),
  `dedupe_key` unique라 다시 알리지 않는다.
- 기기가 없거나 브랜드 알림을 꺼도(muted, 11-19 Ted) 줄은 남아 알림함(`/api/me/notifications`)에 보인다.
- 푸시 userInfo의 kind는 **"brand"**(iOS `PushLanding`)라 설정 이름 "brand_appear"와 다르다. APNs 키가 없으면 보내지 않고 queued로 둔다.
- 대상은 `user_id`가 있는 토큰뿐(2026-11-17).
- 드라이런 `npm run brand-appear:dry-run -- --days 30`(운영 읽기만). `docs/decisions/2026-11-19_브랜드-알림-서버.md`.

## 인스타 댓글 자동 DM
- `/api/instagram/webhook`(서명 검증 → 키워드 매칭 → Private Reply). 규칙은 `src/lib/instagram/rules.ts`(문구 해요체).
- 웹훅 재전송 중복 방지는 `ig_comment_dm`(0058)에 댓글 ID로 선점 — 실패는 재시도 안 함.
  설정·Meta 제약 `docs/decisions/2026-10-14_instagram-comment-auto-dm.md`.
- 토큰(60일)은 cron `/api/cron/ig-token-refresh`가 7일마다 갱신해 `ig_token`(0059)에 두고,
  웹훅·게시 CLI는 `ig_token` > env 순으로 읽는다(`lib/instagram/token.ts`).

## 인스타 카드뉴스 자동 게시
- `npm run ig:publish -- --dir <JPG 폴더> --caption <캡션.txt> (--brands <브랜드.json> | --no-brands) [--check | --publish]`
- **허락 문**: 게시물에 나온 브랜드를 `publish-brands.v1` 파일(출전 id와 용도)로 밝히거나, 없으면 `--no-brands`.
  허락 기록(participant_permission granted/partial + 맞는 allowed_use), 연락 금지, 내려 달라는 요청을 읽어 걸리면
  드라이런부터 멈춘다(`src/lib/instagram/permission-gate.ts`, 읽기만).
- 기본 드라이런, `--check`는 게시 직전(캐러셀 FINISHED)까지만 실제 API 확인, `--publish`면 공개 버킷 `ig-publish`에
  올리고 캐러셀 게시(`src/lib/instagram/publish.ts`). `instagram_business_content_publish` 권한 필요.
  `docs/decisions/2026-10-14_instagram-auto-publish.md`.

## 부스 요약(Gemini) 캐시
- 요약은 보는 사람과 무관하게 소개글만으로 정해지므로 미리 만들어 `booth/summaries.json`에 담았다.
  시드가 합성한 소개는 애초에 부르지 않고(`booth/blurb.ts`), 나머지는 파일에서 찾는다
  (`booth/summary-cache.ts`, 열쇠 = 소개글 해시 → 소개가 바뀌면 낡은 요약이 안 남는다).
- **새 행사를 붙이면 그 부스만 Gemini로 내려간다** — `scripts/booth-summary-dump.ts`로 입력을 뽑아
  `summaries.json`을 채우면 다시 0이 된다.
- 래퍼 `src/lib/ai/gemini.ts`: `generateJSON`/`generateText`/`generateGrounded`(JSON 강제 불가 → `extractJSON`) ·
  server-only · 재시도+모델 폴백 · `hasGemini` 게이트.
- thinking을 켜면 8~15초+로 느려져 타임아웃 → 전부 결정론 폴백된다.

## 지도
- 엔진은 `components/map/exhibition-map.tsx` 하나이고 v2(`components/map-v2/fair-map-screen.tsx`)는 `renderLayer`로 그림만 바꾼다.
- 지도 화면은 `fixed inset-0`으로 방문객 레이아웃의 `max-w-md`를 벗어나 화면을 다 쓴다. 검색과 칩(위), 로미 줄이나
  카드(아래)의 실제 높이를 재서 엔진 `safeInsets`로 넘긴다. 맞추기, 이동 한계, 부스 초점이 그 사이 띠 안에서 계산된다.
- 출입구, 화장실 표식은 `components/map-v2/map-markers.ts`가 자리와 크기를 정한다(벽 바깥, 맞춘 배율에서 12px 이상).
- 뼈대 확인: 개발 서버에서 `?skeletonDelay=3000`(최대 10초, 프로덕션은 무시, `lib/dev/skeleton-delay.ts`).
- 뒤로가기(`components/v2/back-button.tsx`): 앱 안에서 왔으면 `router.back()`, 아니면 전시 홈으로 push.
- 장소와 배치: 벽·입출구·화장실은 건물 속성이라 `src/lib/venues/<venue>.json`에 한 번 저작하고 모든 행사가 재사용한다.
  행사는 부스 배치만 말한다. 합성은 `src/lib/floorplan/compose.ts`.
  새 도면은 "표준부스가 3×3m(플라츠 3×2m)로 떨어지나"로 스케일을 검증한다.
  입출구를 지어 넣으면 그 홀의 다음 행사까지 거짓말을 물려받는다.
  SIBF만 예외: 개략도라 미터 환산이 안 돼 `buildSibf()`가 따로 남아 있다.

## 데이터 주입
- **새 행사 붙이기**: ① 도면 → `floorplan-<slug>.json`(부스 배치 + `"venue"`) + `FLOORPLANS` 등록 한 줄
  ② `data/intake/<slug>.json`을 `/admin/intake`에 업로드. 코드 변경 없이 데이터로 된다.
- 계약 `src/lib/intake/schema.ts`, 계획 `src/lib/intake/plan.ts`(순수), 설계 `docs/superpowers/specs/2026-09-06-exhibition-intake-design.md`.
- **부스 번호 전엔 `brands.v1`**(같은 `/admin/intake`, 파일 `version`으로 가름): 브랜드와 참가 사실, 빈 프로필 칸(intro, links, photos)만 넣고,
  부스가 들어오면 인스타·도메인 또는 같은 행사 표기 이름으로 그 브랜드에 잇는다. `src/lib/intake/brands-{schema,plan,apply}.ts`, `docs/decisions/2026-11-10_브랜드-먼저-인입.md`.
- 좌표는 계약에 없다 — `FLOORPLANS[slug]`가 `code`로 댄다.
- 빈 칸만 채운다. 양쪽 값이 다르면 `conflicts`로 빠진다(사람이 "충돌도 덮어쓰기"를 켜야 덮인다). 배열은 합집합 안 만든다.
- 부스 한 건 편집은 `/admin/booths`(`PATCH /api/booths/[id]`).
- 인스타 자동 스크래핑 불가/금지 → 운영자 수동 입력(`docs/booth-enrichment.md` 양식).
- enrichment 최소 필수 6종: `summary`·`valueTags`·`recommendationReasons`·`thingsToDo`·`timing`·`memoryHooks`.
  `themeTags`(=slug)는 `booth.tags`에 병합돼 LLM 없이 스코어링에 반영된다.
- `booth_enrichment`와 `booth`는 따로 채운다 — 피드는 `booth_enrichment`를 조인해 읽는다.
