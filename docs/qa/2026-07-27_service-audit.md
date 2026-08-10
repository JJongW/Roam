# 서비스 상태 QA 감사 — 2026-07-27

> **수정 반영 완료 (같은 날).** P0 2건 · P1-1 · P1-3 조치하고 실DB로 재검증했다. 상세는 §9.
> 미해결: P1-2(리뷰·커뮤니티 소유자 통일 — 데이터 이전 필요), P2-1(E2E), P2-3~7.

## 감사 조건

| 항목 | 값 |
|---|---|
| 대상 | 로컬 `main` (97e24a2), 워킹트리 clean |
| 데이터 모드 | **Supabase 실DB** (`/api/health` → `mode:"supabase"`) |
| 키 | Supabase 3종·Gemini·Cloudinary·ORGANIZER_CODE 설정됨 / **FCM 6개 공란** |
| 방법 | ① `tsc`·`vitest`·`eslint`·`next build` ② dev 서버(:3111)에 API 실호출 55회 ③ 렌더 HTML 내용 검증 ④ 소스 대조 |
| 계정 | `qa_20260727` (`user_u5cdopetms2ybugk`) |
| FAIL 기준 | **구현된 것의 약속 위반만 FAIL.** 미구현 지향은 §4 GAP으로 분리 |

## 요약

정적 품질은 전부 통과한다 — 타입·테스트·빌드가 깨끗하다. 그런데 **런타임에서 쓰기 두 종류가 통째로 유실되고 있고, 둘 다 API는 201 성공을 반환한다.** 서버 로그에도 아무것도 안 남는다. 원인은 하나로 모인다: Supabase repository가 insert 에러를 버리고 메모리 상의 행을 그대로 성공인 척 돌려준다.

| 구간 | 결과 |
|---|---|
| 정적 검증 (tsc/vitest/eslint/build) | **4/4 PASS** |
| 방문객 API | 38 PASS / **2 FAIL** |
| 페이지 렌더 | 8/8 PASS |
| 메모리·브레인 계층 | PASS (문서가 "미구현"이라 적은 것보다 앞서 있음) |
| 심각도 | **P0 2건 · P1 3건 · P2 7건** |

---

## 1. 체크리스트 & 결과

### 1-1. 정적 검증

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| S1 | `npx tsc --noEmit` | **PASS** | 출력 없음 |
| S2 | `npx vitest run` | **PASS** | 18파일 130테스트 전부 통과, 4.31s |
| S3 | `npx eslint .` | **PASS(경고)** | 에러 0 / 경고 17 → P2-7 |
| S4 | `npx next build` | **PASS** | 라우트 전량 컴파일 |

### 1-2. 인증 게이트

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| A1 | 미로그인 시 보호 페이지 차단 | **PASS** | `/exhibitions/foo` → 307 `→ /login?next=%2Fexhibitions%2Ffoo` |
| A2 | 닉네임 가입·로그인 | **PASS** | POST `/api/auth/login` 201, 쿠키 `roam_user` 발급 |
| A3 | 세션 조회 | **PASS** | GET `/api/auth/me` 200 |
| A4 | 어드민 API 게이트 | **PASS** | 분석 4종 모두 401 `UNAUTHORIZED` |
| A5 | 어드민 코드 오답 거부 | **PASS** | POST `/api/admin/unlock` 403 |
| A6 | 닉네임 문자 규칙 | **FAIL(경미)** | 하이픈 거부 → P2-3 |

### 1-3. 전시 · 부스 조회

| # | 항목 | 결과 | 지연 |
|---|---|---|---|
| R1 | `GET /api/exhibitions` | PASS | 0.16s |
| R2 | `GET /api/exhibitions/sibf-2026` | PASS | 1.55s |
| R3 | `GET .../booths` | PASS | 1.06s |
| R4 | `GET .../events` | PASS | 1.00s |
| R5 | `GET .../heatmap` | PASS | 1.13s |
| R6 | `GET .../community` | PASS | 1.07s |
| R7 | `GET .../keywords` | PASS | 1.77s |
| R8 | `GET /api/booths/b_a1001` | PASS | 0.94s |
| R9 | 부스 리뷰·포스트·웰컴키트 | PASS | 웰컴키트 404는 데이터 부재의 정상 응답 |
| R10 | 없는 전시/부스 404 | PASS | `{"error":{"code":"NOT_FOUND",…}}` |

### 1-4. 쓰기 — **여기서 깨진다**

| # | 항목 | 응답 | 실제 저장 | 결과 |
|---|---|---|---|---|
| W1 | 부스 노트 `PUT /api/me/notes/[boothId]` | 200 | **O** | PASS |
| W2 | 리뷰 `POST /api/booths/[id]/reviews` | 201 | **O** | PASS |
| W3 | 사용자 신호 `POST /api/me/signal` | 204 | **O** | PASS |
| W4 | 분석 이벤트 `POST /api/analytics/events` | 202 | O | PASS |
| W5 | **북마크 `POST /api/bookmarks`** | **201** | **X** | **FAIL — P0-1** |
| W6 | **커뮤니티 `POST .../community`** | **201** | **X** | **FAIL — P0-2** |
| W7 | 푸시 구독 `POST /api/push/subscribe` | 201 | O | PASS |

W5·W6은 성공 응답 + 정상 형태의 객체까지 돌려준 뒤 조회하면 사라진다.

### 1-5. AI · 메모리

| # | 항목 | 결과 | 근거 |
|---|---|---|---|
| M1 | 브레인 조회 `GET /api/me/brain` | PASS | 0.26s |
| M2 | 신호 → 관심 증류 | **PASS** | 신호 4건 후 `interests` 생성, `confidence 0.552`, `trend:"up"`, `version 5` |
| M3 | 방문 아크 기록 | PASS | `visits[0].summary` = "1개 부스 관람 · 주로 학습" |
| M4 | 회고 `POST /api/me/reflect` | PASS | 200, `{reflected:true}` |
| M5 | 부스 요약 (Gemini 실호출) | PASS | 200 / **1.77s** |
| M6 | 커뮤니티 요약 (Gemini 실호출) | PASS | 200 / **2.53s** |
| M7 | 푸시 발송 (키 없음) | PASS | 202 `{delivered:false, mode:"unconfigured"}` — 의도된 degrade |

### 1-6. 페이지 렌더 (로그인 상태, HTML 내용 검증)

| # | 페이지 | 코드 | warm 지연 | 내용 |
|---|---|---|---|---|
| P1 | `/` | 200 | 0.19s | O |
| P2 | `/login` | 200 | 0.79s | O |
| P3 | `/exhibitions/sibf-2026` | 200 | **2.30~3.22s** | 피드 12건 + 근거문구 + 가치 온보딩 + "오늘 관람 마치기" 모두 렌더 → P1-3 |
| P4 | `/exhibitions/sibf-2026/map` | 200 | 0.60s | `<svg>` + 부스 폴리곤 + 코드 라벨 O |
| P5 | `.../notes` | 200 | 0.68s | O |
| P6 | `.../community` | 200 | 1.92s | O |
| P7 | `/booths/b_a1001` | 200 | 0.33s | 부스명·탭·enrichment 요약 O |
| P8 | `/admin` | 200 | 1.21s | 코드 입력 게이트 O |

전 페이지에서 `Application error` / `__next_error__` 마커 0건.

---

## 2. FAIL 상세

### P0-1 · 북마크가 Supabase 모드에서 100% 유실된다

"가고 싶은 부스 저장"이 저장되지 않는다. API는 201에 정상 객체를 돌려준다.

```
POST /api/bookmarks {"targetType":"booth","targetId":"b_a1001"}
→ 201 {"data":{"bookmark":{"id":"bm_n7cnny9oms2yg8oc","sessionId":"user_u5cdopetms2ybugk",…}}}
GET  /api/bookmarks
→ 200 {"data":[]}
```

DB에 직접 같은 insert를 넣어 원인을 확정했다:

```
23503  insert or update on table "bookmark" violates foreign key constraint "bookmark_session_id_fkey"
       Key (session_id)=(user_u5cdopetms2ybugk) is not present in table "visitor_session".
```

`src/app/api/bookmarks/route.ts:24`는 `user.id`를 넘기는데 `bookmark.session_id`는 `visitor_session(id)`를 참조한다. 로그인 필수 전환 때 라우트만 계정 기준으로 바꾸고 스키마는 세션 기준으로 남았다. `bookmark` 테이블은 현재 **전체 0행**이다.

### P0-2 · 커뮤니티 글쓰기가 100% 유실된다

```
POST /api/exhibitions/sibf-2026/community {"body":"QA 감사 포스트 2026-07-27"}
→ 201 {"data":{"post":{"id":"cp_flf0nelhms2ygaqi",…}}}
GET  /api/exhibitions/sibf-2026/community
→ 200 총 4건(전부 seed) / 방금 쓴 글 0건
```

원인은 FK가 아니라 **스키마 드리프트**다:

```
PGRST204  Could not find the 'media_public_id' column of 'community_post' in the schema cache
```

`src/lib/supabase/repository.ts:1291`이 `media_public_id`를 넣는데 운영 DB에 그 컬럼이 없다. 미디어 첨부 마이그레이션이 코드에만 있고 DB에 반영되지 않았다.

### P1-1 · Supabase repository가 insert 에러를 버린다 — 위 두 건의 공통 원인

```ts
// src/lib/supabase/repository.ts:1225
const { data } = await db.from("bookmark").insert(row).select("*").single();
return mapBookmark((data ?? row) as Row);   // ← 실패해도 로컬 row를 성공처럼 반환
```

`error`를 받지 않으므로 실패가 **성공 응답으로 위장되고, 서버 로그에도 남지 않는다**(감사 중 dev 로그 92줄에 에러 0건). 같은 패턴이 6곳:

| 줄 | 테이블 | 영향 |
|---|---|---|
| 619 | `booth` | 어드민 부스 생성 |
| 698 | `event` | 어드민 이벤트 생성 |
| 793 | `review` | 리뷰 (현재는 성공 중) |
| 1073 / 1122 | `app_user` | **계정 생성 — 실패 시 로그인이 조용히 무효화** |
| 1225 | `bookmark` | P0-1 |
| 1294 | `community_post` | P0-2 |

`app_user`가 여기 포함된 게 가장 위험하다. 지금은 동작하지만 같은 방식으로 터지면 로그인 자체가 조용히 실패한다.

### P1-2 · 로그인 필수 전환이 데이터 계층까지 내려오지 않았다

같은 앱 안에서 소유자 키가 두 갈래다.

| 도메인 | 소유자 키 | 상태 |
|---|---|---|
| 부스 노트 · 브레인 · 신호 | `app_user.id` | 정상 |
| 북마크 | 라우트는 `user.id` / 스키마는 `visitor_session` | **깨짐 (P0-1)** |
| 리뷰 | `visitor_session.id` | 저장은 되나 **계정에 안 묶임** |
| 커뮤니티 포스트 | `visitor_session.id` | 저장 자체 실패 (P0-2) |

감사 중 만든 리뷰는 `sessionId: sess_kici7pffms2yehl2`로 들어갔다 — `qa_20260727` 계정으로 조회할 방법이 없다. "내가 쓴 리뷰"를 만들 수 없는 상태다.

### P1-3 · 전시 홈 SSR 2.3~3.2초

warm 상태 재측정에서도 2.30s / 3.22s. 앱에서 가장 많이 열리는 화면이다. 같은 페이지가 `getExhibition`(1.55s) + `listBooths`(1.06s) + 브레인 + `curateFeed`를 순차로 물고 있는 것으로 보인다. `/booths/[id]`가 0.33s인 것과 대비된다.

### P2 (7건)

| # | 내용 |
|---|---|
| P2-1 | **E2E 테스트 0개.** `playwright@1.60.0`이 devDependency에 있으나 설정·스펙 파일 없음. P0 두 건 다 단위테스트로는 못 잡는 종류 |
| P2-2 | FCM 키 6개 공란 → 푸시 기능 비활성 (degrade 자체는 정상) |
| P2-3 | 닉네임 정규식 `^[\w가-힣][\w가-힣 ]*$` — 공백·언더스코어는 되고 하이픈 불가 |
| P2-4 | `DELETE /api/bookmarks`가 쿼리스트링이 아닌 **본문**을 요구 (`parseBody`) |
| P2-5 | 응답 봉투 불일치 — 커뮤니티는 `{data:[…]}`, 나머지 목록은 `{data:{data:[…]}}` |
| P2-6 | `node scripts/gen-seed.mjs` 실행 불가 — `supabase/seed.sql` 없음 (`supabase/`가 gitignore되어 로컬 부재). CLAUDE.md가 적은 사유(`seed.waitings`)와 다름 |
| P2-7 | eslint 경고 17건 — `react-hooks/set-state-in-effect` 2건 + 미사용 심볼 15건 |

---

## 3. PASS 중 특기할 것

- **메모리 엔진이 실제로 돈다.** 신호 4건만으로 관심 항목이 증류되고 confidence·trend·literacy가 계산되며 `version`이 5까지 올라갔다. CLAUDE.md는 지식 4계층을 "미구현"이라 적었는데 실제 코드가 문서보다 앞서 있다.
- **AI 폴백·degrade 설계가 견고하다.** FCM 미설정에서 `{delivered:false, mode:"unconfigured"}`로 202를 준다. 실패를 성공으로 위장하는 P1-1과 정확히 대비되는 올바른 패턴이다.
- **Gemini 실호출이 1.8~2.5초로 들어온다.** thinking off 설정이 살아 있다.
- 지도 SVG가 부스 폴리곤·코드 라벨까지 서버 렌더로 나온다 (0.60s).

---

## 4. GAP — 미구현 방향 (FAIL 아님)

- L1 근거 데이터: enrichment 97개 항목 중 `summary` 97 / `themeTags` 66 / `thingsToDo` 45 / `timing` 31 / **`valueTags`·`roamInterpretation`·`recommendationReasons`·`memoryHooks` 각 16**. 저작 커버리지가 갭.
- 관람 아크 3막 중 회고(`/api/me/reflect`)는 있으나 peak-end 해소 UI는 최소 형태.
- L2 휘발 상황(실시간)은 heatmap 외 미구현.

---

## 5. 문서-코드 불일치 — CLAUDE.md 갱신 필요

CLAUDE.md의 "핵심 아키텍처 / LLM 추천 / 온보딩 / 지도 동작" 절은 **현재 코드에 존재하지 않는 시스템을 서술한다.** 동선(route) 아키텍처가 피드·컴패니언 모델로 교체됐는데 문서가 따라오지 않았다.

| 문서 서술 | 실제 |
|---|---|
| `engine/route.ts` → `navigation.ts` | **파일 없음** (engine에 `scoring.ts`·`service.ts`만) |
| `POST /api/onboarding/route` | **라우트 없음** |
| `POST /api/ai/quick-route` | **라우트 없음** |
| `PATCH /api/route/[id]` | **라우트 없음** |
| `/exhibitions/[slug]/onboarding` 페이지 | **없음** (실제 온보딩 = 홈의 `value-onboarding.tsx`) |
| `ai-companion-onboarding.tsx` | **없음** |
| `route-profile-builder.ts` | **없음** |
| `useRouteStore` · `buildHallSweepRoute` · `buildProfileFromContext` | **참조 0** |
| localStorage `roam-route` / `roam-cart` | **참조 0** |
| `ai-recommend-sheet.tsx` | **없음** (stale 주석 1곳에만 언급) |
| 지도 뒤로가기 "관람이 끝나셨나요?" | **없음** — `map-view.tsx:113`은 그냥 `router.back()` |
| `booth-recommender.recommendBoothIds` | 존재하나 **호출자 0 = 데드코드** |
| `logAiQuery` / `topQueryKeywords` | 양쪽 repo + 인터페이스에 있으나 **호출자 0** (유일한 호출부였을 quick-route가 없음) |
| `onboarding-flow.ts` / `onboarding-inference.ts` / `onboarding-types.ts` | **참조 0 = 데드코드** |
| enrichment "79/256 채워짐, 저작 2개 부스" | 실제 **97개 항목, 저작 16개 부스** |
| "SIBF 데이터는 시드/데모" | DB에 **`sif-2026`(서울일러스트레이션페어)도 등록됨** |
| `gen-seed.mjs`가 `seed.waitings` 때문에 깨짐 | 실제로는 `supabase/seed.sql` 부재로 깨짐 |
| 지식 4계층 "아직 미구현" | **동작 중** (brain·signal·distill) |

---

## 6. 권장 순서

1. **P1-1 먼저.** `insert`/`update`/`upsert` 6곳에서 `error`를 받아 던지게 바꾼다. 이것만 해도 P0 두 건이 조용한 유실에서 시끄러운 에러로 바뀐다.
2. **P0-2.** `community_post`에 `media_public_id` 컬럼 추가 마이그레이션 적용.
3. **P0-1.** 북마크 소유자를 결정한다 — `bookmark.session_id` FK를 `app_user`로 옮기거나(P1-2와 함께 정리), 라우트가 세션 id를 넘기게 되돌리거나. 리뷰·커뮤니티까지 묶어 한 번에 가는 쪽을 권한다.
4. **P2-1.** 위 3건을 회귀 방지할 E2E 최소 스펙(로그인 → 북마크 → 재조회, 로그인 → 글쓰기 → 재조회). 단위테스트로는 못 잡는다.
5. CLAUDE.md의 §5 표 반영.

---

## 7. 감사 중 실DB에 생성한 레코드

| 테이블 | 레코드 | 정리 |
|---|---|---|
| `app_user` | `user_u5cdopetms2ybugk` / `qa_20260727` | 삭제 대상 |
| `booth_note` | `user_u5cdopetms2ybugk` × `b_a1001` (visited, 메모) | 삭제 대상 |
| `review` | `rv_4gzxkzqwms2yehmw` — "QA 감사용 리뷰 2026-07-27" (b_a1001, 공개 노출됨) | **우선 삭제** |
| `visitor_session` | `sess_kici7pff…`, `sess_jco1ftat…`, `sess_skwvuusn…` | 삭제 대상 |
| 브레인/신호/분석 이벤트 | 위 user에 귀속 | user 삭제 시 함께 |
| `bookmark` / `community_post` | **0행** — P0-1·P0-2로 저장 자체가 안 됨 | 정리 불필요 |

정리 SQL:

```sql
delete from review where id = 'rv_4gzxkzqwms2yehmw';
delete from booth_note where user_id = 'user_u5cdopetms2ybugk';
delete from app_user where id = 'user_u5cdopetms2ybugk';
```

## 8. 재현

```bash
npx tsc --noEmit && npx vitest run && npx eslint . && npx next build
npx next dev -p 3111
curl -c jar -X POST localhost:3111/api/auth/login -H 'Content-Type: application/json' -d '{"nickname":"qa_20260727"}'
curl -b jar -X POST localhost:3111/api/bookmarks -H 'Content-Type: application/json' -d '{"targetType":"booth","targetId":"b_a1001"}'
curl -b jar localhost:3111/api/bookmarks   # → {"data":[]}
```

---

## 9. 수정 반영 (2026-07-27, 감사 당일)

### 9-1. P1-1 — 쓰기 에러 삼키기 제거 ✅

`src/lib/supabase/repository.ts`에 게이트 3종을 넣고 **쓰기 30곳 전부** 통과시켰다.

| 헬퍼 | 용도 | 실패 시 |
|---|---|---|
| `wrote(res, what)` | insert/upsert — 반드시 행이 남아야 함 | throw |
| `maybeWrote(res, what)` | update/delete — 미매치는 정상 | 에러만 throw, 미매치는 null |
| `loggedWrite(res, what)` | 텔레메트리(`analytics_event`·`ai_query_log`) | 요청은 살리고 `console.error` |

검증 — 없는 부스에 리뷰 작성(FK 위반 유도):

```
POST /api/booths/b_does_not_exist/reviews  → 500
dev 로그: ⨯ Error: 세션 생성 실패: insert or update on table "visitor_session"
          violates foreign key constraint "visitor_session_exhibition_id_fkey" (23503)
```

수정 전이었다면 201 성공에 로그 0줄이었다.

### 9-2. P0-2 — 커뮤니티 미디어 컬럼 복구 ✅

`supabase/migrations/0024_community_post_media.sql` 작성 후 운영 DB 적용.
감사 시점엔 `media_public_id`만 없는 줄 알았으나 실제로는 **`media_url`·`media_type`·`media_public_id` 3개 전부** 없었다 — 미디어 첨부 기능의 마이그레이션이 적용된 적 없다. `media_type` CHECK 제약도 함께 넣었다.

```
POST /api/exhibitions/sibf-2026/community → 201
GET  .../community → 총 5건 / 방금 쓴 글 1건   ✅ (수정 전: 0건)
```

### 9-3. P0-1 — 북마크 소유자를 계정으로 전환 ✅

`supabase/migrations/0025_bookmark_owned_by_user.sql` 적용: `session_id` → `user_id` 리네임, FK를 `visitor_session` → `app_user`(CASCADE), `(user_id, target_type, target_id)` 유니크 인덱스 추가. 테이블이 0행이라 데이터 이전 없음.

코드도 계정 기준으로 맞췄다 — `Bookmark.sessionId` → `Bookmark.userId`(도메인 타입), `Repository` 인터페이스 시그니처, Supabase/Mock 두 구현 전부.

```
POST /api/bookmarks → 201 {"userId":"user_…"}
GET  /api/bookmarks → 200 [1건]              ✅ (수정 전: [])
```

### 9-4. P1-3 — 전시 홈 지연 ✅

같은 요청에서 중복 쿼리가 돌고 있었다. `getExhibition`이 **3번**(`generateMetadata` + 페이지 본문 + `rankForExhibition`), `readBrain`이 **2번**(페이지 + `curateFeed`), 게다가 전부 순차.

- `src/lib/repositories/cached.ts` 신규 — `getExhibitionCached`(React `cache`)로 요청 단위 중복 제거. 셋이 공유.
- `rankForExhibition`: 부스·이벤트·히트맵을 `Promise.all`로 병렬화.
- 전시 홈: 전시·로케일·로그인을 `Promise.all`로, 브레인은 한 번만 읽어 `curateFeed(…, brain)`으로 전달.

| | 수정 전 (warm) | 수정 후 (warm) |
|---|---|---|
| `/exhibitions/sibf-2026` | 2.30 / 3.22s | **0.94 / 1.01 / 1.01 / 1.31 / 1.46s** |

지도 0.83s · 부스 상세 0.45s · 노트 0.70s로 회귀 없음.

### 9-5. 검증

`npx tsc --noEmit` 클린 · `npx vitest run` 130/130 · eslint 에러 0(경고는 기존 것만).
감사·검증 중 만든 계정·북마크·포스트·리뷰·세션은 전부 삭제했다 — `app_user` 18행, `bookmark` 0행, `community_post` 4행으로 감사 전 상태 복귀 확인.

### 9-6. 남은 것

| 항목 | 이유 |
|---|---|
| **P1-2** 리뷰·커뮤니티 소유자 통일 | 리뷰 3행·포스트 4행·세션 36행이 엮여 있어 세션→계정 매핑 규칙(익명 행 처리 포함) 설계가 먼저. 별도 작업으로 분리 |
| **P2-1** E2E | 이번 P0 두 건은 단위테스트로 못 잡는 종류. 최소 스펙(로그인→북마크→재조회, 로그인→글쓰기→재조회) 필요 |
| P2-3~7 | 닉네임 하이픈 · DELETE 본문 · 봉투 불일치 · `gen-seed.mjs` · eslint 경고 17 |

### 9-7. 적용한 마이그레이션 원문

⚠️ `supabase/`는 `.gitignore`에 있어 **마이그레이션 파일이 git에 남지 않는다.** 유실 대비로 아래에 원문을 박아둔다. 둘 다 운영 DB에 적용 완료.

`supabase/migrations/0024_community_post_media.sql`

```sql
alter table public.community_post
  add column if not exists media_url text,
  add column if not exists media_type text,
  add column if not exists media_public_id text;

alter table public.community_post
  drop constraint if exists community_post_media_type_check;
alter table public.community_post
  add constraint community_post_media_type_check
  check (media_type is null or media_type in ('image', 'video'));
```

`supabase/migrations/0025_bookmark_owned_by_user.sql`

```sql
alter table public.bookmark
  drop constraint if exists bookmark_session_id_fkey;

alter table public.bookmark
  rename column session_id to user_id;

alter table public.bookmark
  add constraint bookmark_user_id_fkey
  foreign key (user_id) references public.app_user(id) on delete cascade;

create unique index if not exists bookmark_user_target_uniq
  on public.bookmark (user_id, target_type, target_id);
```

적용 방법(사용자 승인 완료 방식) — `.env`의 `SUPABASE_ACCESS_TOKEN`으로 Management API에 직접:

```
POST https://api.supabase.com/v1/projects/{ref}/database/query   body: {"query": "<SQL>"}
```

### 9-8. 다음 세션 이어받기

- **shadcn MCP**: `.mcp.json` 등록 완료(`shadcn` 로컬 4.15.0 고정). 재시작하면 붙고 프로젝트 MCP 승인 프롬프트가 뜬다. 툴 7종: `get_project_registries`·`list_items_in_registries`·`search_items_in_registries`·`view_items_in_registries`·`get_item_examples_from_registries`·`get_add_command_for_items`·`get_audit_checklist`.
- **다음 작업**: shadcn으로 UI 손보기. 대상 미정 — 후보는 전시 홈 피드(근거 카드가 `interest-feed.tsx` 인라인과 `grounding-card.tsx`로 이원화) · 로그인 화면 · 부스 상세 · 어드민 콘솔.
- **워킹트리**: 아래가 커밋 안 된 상태로 남아 있다.
  - 수정: `CLAUDE.md` · `package.json`/`package-lock.json`(shadcn devDependency) · `src/lib/supabase/repository.ts` · `src/lib/mock/repository.ts` · `src/lib/types/index.ts` · `src/lib/repositories/types.ts` · `src/lib/engine/service.ts` · `src/lib/feed/curate.ts` · `src/app/(visitor)/exhibitions/[slug]/page.tsx`
  - 신규: `.mcp.json` · `src/lib/repositories/cached.ts` · `docs/qa/`
- **검증 상태**: `tsc` 클린 · `vitest` 130/130 · 변경 파일 eslint 클린 · `next build` 통과(감사 시점).
