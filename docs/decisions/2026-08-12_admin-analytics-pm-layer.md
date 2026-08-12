# admin 분석 재설계 — 마케팅/PM 지표 레이어

**날짜**: 2026-08-12
**관련 파일**: `app/admin/analytics/page.tsx`, `api/admin/analytics/*`, `lib/supabase/repository.ts`(1628–1943), `lib/mock/repository.ts`(878–1095), `lib/repositories/types.ts`(analytics 269–290), `lib/memory/{service,taste,distill}.ts`, `lib/types/index.ts`, `components/admin/*`, `components/charts/*`
**성격**: 결정 문서 + 구현 스펙(Claude Code 실행용). 선행 감사 결과 포함.

---

## 0. 핵심 진단 (왜 재설계인가)

admin엔 이미 분석 화면이 있지만 **잘못된 데이터 소스**를 읽는다. 데이터 흐름이 둘로 갈려 있다:

- **Stream A `analytics_event`** — 익명 `session_id` 기반. enum 6종 중 **실제 발화는 `view` 하나뿐**
  (dwell·booth_arrive·route_start·route_complete·event_bookmark = 발화부 0). 현재 분석 위젯 4개
  (히트맵·인기부스·방문흐름·전환율)이 전부 여기 얹혀 있어서 → **방문흐름 영구 빈 화면, 전환율은 제거된
  동선(route) 제품 기준, 인기부스는 균일 `popularity:50` + view 랭킹.** 계정에 join 불가.
- **Stream B `user_signal_log`** — 계정(`user_id`)·전시·타임스탬프 기반. 반응 전체 분류
  (`reaction_must/curious/pass`, `verdict_good/ok/bad`, `booth_bookmarked`, `search_query`) + `booth_note`
  (interest→verdict 상태) + `user_brain`(증류된 취향·`visits[]`·literacy). **"누가 뭘 했는지"를 아는
  유일한 흐름인데 admin에선 계정 드릴다운 한 곳만 사용. 집계 전무.**

**결론**: 원하는 PM/마케팅 지표를 만들 데이터는 **이미 존재**한다. 대부분 **새 이벤트 수집 없이 Stream B
집계만 추가하면 되는 퀵윈**이다. 대시보드를 Stream A(죽음)에서 Stream B(진짜)로 옮기는 게 핵심.

---

## 1. 파트 A — 토대 정리 (먼저)

죽은 소스를 읽는 위젯을 실제 소스로 재배선한다. **UI는 유지, 데이터 소스만 교체**하는 게 대부분.

- **전환율 퍼널 재배선** — `analyticsConversion`를 `route_plan`/`user_preference`/익명 세션에서 떼어내고
  실제 여정으로: 아래 §2-1 참조.
- **인기 부스 재배선** — 정적 `popularity` 대신 실제 반응/조회로: §2-4.
- **방문 흐름** — `booth_arrive`가 없으면 계속 빈 화면. 임시로 **부스 상세 `view` 시퀀스**(같은 사용자,
  시간순)로 근사하거나, 구조적 해결(§3) 전까지 위젯을 "준비 중"으로 정직하게 표기.
- **죽은 배관 표기/제거** — `route_plan`, `route_start/complete`, `user_preference` 기반 온보딩,
  발화 없는 `analytics_event` enum 항목, 데드 `ai_query_log`. 대시보드가 유령 소스를 안 읽게.
- **집계 성능** — 현재 분석 메서드는 전 이벤트를 메모리로 끌어와 `Array.filter`(O(n)×부스). 지표가
  늘기 전에 `created_at` 범위 인덱스 쿼리 또는 롤업으로. (구조, §3)

---

## 2. 파트 B — 퀵윈 지표 (새 수집 없음, Stream B 집계만)

각 지표에 **소스·계산·해석(PM/마케터가 뭘 읽나)·액션**을 붙인다. "어떻게 해석하나"가 이 문서의 요청 핵심.

### 2-1. 진짜 여정 퍼널 (login → 회고) ⭐최우선
- **소스**: `app_user`(가입) + `user_signal_log`(reaction/verdict) + `user_brain.visits`(회고=reflect).
- **단계**: 가입 → 가치 온보딩 완료(value-onboarding `reaction_must` 존재) → 피드 반응 1개↑(`reaction_*`) →
  현장 판정 1개↑(`verdict_*`) → 관람 마치기(VisitDigest 1개↑). 전시별 필터.
- **계산**: 각 단계의 distinct `user_id` 수, 전 단계 대비 전환율.
- **해석**: 어느 단계에서 사람이 새는가. 가입→온보딩 급락 = 온보딩 마찰. 반응→판정 급락 = 현장에서 앱을
  안 켬(= co-presence 문제, 별 문서). 판정→마치기 급락 = 회고 도달성 버그(개선 브리프 TASK 1).
- **액션**: 가장 큰 드롭 구간이 다음 스프린트 우선순위. 이 퍼널 하나가 제품 건강의 심박이다.

### 2-2. 리텐션 / 코호트 / 재방문
- **소스**: `app_user.created_at`, `user_signal_log.created_at`(전시 걸침).
- **계산**: 가입 코호트(주별) × Day-N 복귀, DAU/WAU, **크로스-전시 재방문**(같은 user_id가 2개↑ 전시에서
  활동 — 로그인 필수 전환으로 *비로소* 측정 가능해진 지표, L4의 실증).
- **해석**: 재방문율이 이 제품의 진짜 해자. 단일 전시 1회성 사용자 vs 전시를 넘어 돌아오는 사용자 비율이
  "동행자" 전략이 먹히는지의 증거.
- **액션**: 크로스-전시 복귀 코호트가 뭘 다르게 했는지 역추적(온보딩 완료? 회고 도달?).

### 2-3. 관객 선호도 분포 (집단 취향)
- **소스**: `user_brain.interests[].confidence`, `mutedSlugs`, value-on보딩 `reaction_must` slugs.
- **계산**: 8가치 축별 평균 confidence·상위 관심 분포·뮤트 분포. 전시별/전체.
- **해석**: 이 전시에 온 사람들이 *집단으로* 뭘 원하는가(발견형이 많은가, 굿즈형이 많은가). 주최/브랜드
  세일즈 자료로 직결 — "이 전시 방문객의 62%가 발견·영감 성향".
- **액션**: enrichment 저작 우선순위·부스 배치·마케팅 메시지의 근거. 선호 분포 ↔ 실제 인기 부스(§2-4)
  갭이 곧 "채워지지 않은 수요".

### 2-4. 부스 성과 — 관심→방문 전환 & "찜했는데 안 감"
- **소스**: `booth_note.interest`(must/curious/pass) vs `verdict`/`visited_at`, 부스별 집계. 조회는 `view`.
- **계산**: 부스별 (a) 관심 획득 수, (b) 관심→실제 방문(verdict/visited) 전환율, (c) **must였는데 미방문
  비율**(per-user `listMustNotVisited` 로직을 집계로), (d) verdict 긍정률(good/(good+ok+bad)).
- **해석**: 단순 조회수 랭킹을 넘어 — 관심은 높은데 전환이 낮은 부스 = 위치/동선 문제 or 현장 실망.
  긍정률 낮은 부스 = 기대 대비 실제 실망(브랜드에 피드백할 사실). "찜했는데 안 감"이 높은 부스 = 놓치기
  쉬운 위치(co-presence T5 넛지 대상).
- **액션**: 정적 `popularity` 필드를 이 실측 인기로 대체(피드 스코어링에도 반영). 브랜드 리포트의 핵심.

### 2-5. 예측 정확도(취향 파악) 집계 & 추세
- **소스**: `computeTasteAccuracy`/`getTasteAccuracy`(per-user) → 집계, `interests[].trend`(up/flat/down).
- **계산**: 전체 평균 예측정확도, 판정 5개 이상 사용자 비율(로미가 "감 잡은" 사용자 비율), 추세.
- **해석**: 로미의 추천이 실제로 맞는가의 집단 지표. 낮으면 스코어링/enrichment 문제. 판정 5+ 도달률은
  "온보딩을 넘어 진짜 학습 단계에 든 사용자" 비율.
- **액션**: interest=must인데 verdict=bad 비율이 높은 가치 축 = 그 축의 추천 로직/데이터 손봐야 할 곳.

### 2-6. 계정 리스트 인게이지먼트 컬럼 & 검색 트렌드
- **소스**: `user_signal_log` per-user 집계(`COUNT`, `MAX(created_at)`), `search_query` signals.
- **계산**: 계정 목록에 반응 수·마지막 활동·판정 수 컬럼. 검색어 상위(죽은 `ai_query_log` 대체).
- **해석**: 파워유저 식별, 검색 트렌드 = 사람들이 못 찾는 것/원하는 것(enrichment·부스 유치 신호).

### ⚠️ 전 지표 공통 — 시계열 축
현재 모든 admin 지표는 단일 스냅샷이다. 모든 테이블에 `created_at`이 있으니 **날짜 필터 + 일별 버킷 +
추세선**을 공통 셸로 넣는다. "처음부터 끝까지 어떻게 변화하는지"의 시간 축이 여기서 나온다.

---

## 3. 파트 C — 구조적 지표 (새 수집/스키마 필요)

- **체류 시간(dwell)** — `dwell` 이벤트 정의만 있고 발화 0. 클라 enter/leave 계측 + duration 필드 필요.
- **경로/동선 분석(flow)** — `booth_arrive` 발화 필요, 그리고 **익명 `session_id`가 아니라 `user_id`로**
  키잉해야 계정 여정과 연결됨.
- **세션 조회를 계정에 연결** — `analytics_event`에 `user_id` 추가 or 부스-view 추적을 signal 스트림으로
  이전. view→bookmark→verdict per-user 퍼널의 전제.
- **시계열 롤업 저장** — 대규모 추세 쿼리용 일별 집계 테이블(현재 인메모리 filter는 확장 불가).
- **예측정확도 히스토리** — 현재값만 계산됨. 스냅샷 주기 저장 or append-only 원장 리플레이.

---

## 4. 해석 프레임 — PM/마케터가 대시보드를 읽는 법

한 화면에 다 띄우지 말고 **세 렌즈**로 묶어 각 렌즈에 "이걸로 뭘 결정하나"를 명시:

1. **획득·유지 (성장)**: 여정 퍼널(2-1) + 리텐션/코호트(2-2). → *제품이 성장하는가, 어디서 새는가.*
2. **취향·수요 (제품·브랜드)**: 선호 분포(2-3) + 예측정확도(2-5). → *방문객이 뭘 원하고, 로미가 맞히는가.*
3. **부스·콘텐츠 (운영·세일즈)**: 부스 성과(2-4) + 검색 트렌드(2-6). → *뭐가 먹히고 뭘 채워야 하나.*

**두 개의 갭이 가장 많은 걸 말해준다**: (a) 선호 분포 ↔ 실제 인기 부스 갭 = *채워지지 않은 수요*,
(b) 관심(must) ↔ 실제 방문(verdict) 갭 = *현장 전환 손실*(위치·동선·co-presence). 대시보드의 목적은
숫자 나열이 아니라 **이 두 갭을 매주 좁히는 것**.

---

## 5. 진행 순서 & 검증

1. **파트 A**(죽은 소스 재배선) — 특히 여정 퍼널(2-1)을 실제 소스로. 이거 하나가 즉시 임팩트 최대.
2. **파트 B 퀵윈** — 2-1 → 2-4 → 2-2 → 2-3 → 2-5 → 2-6 순(임팩트/난이도).
3. **시계열 공통 셸**(날짜 필터·버킷).
4. **파트 C 구조적** — 각각 결정 문서 먼저(dwell 계측, flow user_id 키잉, 롤업).

**설계 원칙 준수**: admin 집계는 서버(RSC/route)에서, 방문객이 보는 값과 **같은 순수 함수 재사용**
(`computeTasteAccuracy`·brain 파생 — 계정 상세가 취향 레이더를 방문객과 공유한 전례). 숫자가 갈리면 안 됨.

**검증**: `npx tsc --noEmit` · `npx vitest run`(새 집계 순수 함수 유닛 테스트) · `npx eslint <changed>`.
`/why` 기록. 집계 쿼리는 `wrote()`/PostgREST 규약 밖(읽기 전용)이지만 전시 스코프 필터 항상 확인
(전환율의 `user_preference` 전역 카운트 버그가 이 누락 때문이었음).
