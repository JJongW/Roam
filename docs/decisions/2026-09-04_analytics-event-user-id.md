# analytics_event에 user_id 추가

2026-09-04 · `feat/admin-metrics-foundation`

## 왜

취향·판단·결과는 `user_signal`에 **`user_id` 기준**으로 쌓인다. 반면 클릭·체류·히트맵·동선은
`analytics_event`에 **`session_id` 기준**으로만 쌓여 왔다. 둘을 잇는 키가 없어서
운영 콘솔에서 답할 수 없는 질문이 있었다:

> "어느 취향의 사람이 어디를 많이 눌렀나"

취향 세그먼트(온보딩 가치 + `UserBrain`)와 행동(UI 클릭·부스 조회)이 서로 다른 축에
있어 교차가 불가능했다. 이건 주최 측에 파는 인사이트("이 전시엔 굿즈 성향이 많고
그들은 C존을 선호했다")의 재료이기도 하다.

## 왜 지금

**과거 행은 소급이 불가능하다.** 세션과 사용자를 사후에 이어붙일 방법이 없으므로,
컬럼을 늦게 넣을수록 영구히 귀속 불가능한 데이터가 쌓인다. 설계 논의 중 가장 먼저
처리해야 할 항목으로 판단했다.

## 왜 이 방식

- **nullable.** 기존 행에 값을 채울 수 없고, `/admin`·`/api` 직접 호출처럼 게이트 밖에서
  오는 이벤트도 있다. `null` = "익명이거나 이 컬럼 도입 전"으로 읽는다.
- **`on delete set null`.** 계정이 지워져도 집계는 남아야 한다. 귀속만 끊는다.
- **선택 파라미터.** `recordAnalytics(sessionId, exhibitionId, input, userId?)` — 기존
  호출부를 깨지 않으면서 추가한다.
- **실질 커버리지는 거의 100%.** 방문객 앱 전체가 로그인 게이트 뒤(`src/proxy.ts`가
  `roam_user` 없으면 307)라 이벤트 대부분에 사용자가 있다. 지금까지 안 적었을 뿐이다.

## 마이그레이션 번호

`0042`. 운영에 적용된 최신은 `0041`이다.

⚠️ `supabase/`는 gitignore라 레포의 `supabase/migrations/`가 운영 상태를 반영하지
않는다(로컬엔 `0024~0037`만 있다). **번호를 정할 때 로컬 디렉터리를 신뢰하면 안 되고
운영 DB를 확인해야 한다** — 이번에도 로컬만 보고 `0038`로 잡았다가 두 번 고쳤다.

이 SQL은 커밋되지 않으므로 운영 적용은 수동.

## 변경

| 파일 | 내용 |
|---|---|
| `supabase/migrations/0042_analytics_event_user_id.sql` | 컬럼·FK·인덱스 2종 (신규) |
| `src/lib/types/index.ts` | `AnalyticsEvent.userId` |
| `src/lib/repositories/types.ts` | `recordAnalytics` 시그니처 |
| `src/lib/supabase/repository.ts` | `user_id` insert |
| `src/lib/mock/repository.ts` | mock 동기화 |
| `src/app/api/analytics/events/route.ts` | `getUserId()` 전달 |

## 다음

이 컬럼을 전제로 `metrics-rollup` 워커가 취향 세그먼트 × 행동 집계를 만든다.
전체 설계: `docs/admin-automation-architecture.md`
