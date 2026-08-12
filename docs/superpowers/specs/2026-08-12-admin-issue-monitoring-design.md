# admin 오류/이슈 모니터링 (D2) — 설계

**날짜**: 2026-08-12
**배경**: [judgment-vocabulary 후속 브레인스토밍](2026-08-11-admin-account-detail-design.md)에서 D1(계정 상세 확장) 다음으로 미뤄둔 두 번째 트랙. 지금까지 서버·클라이언트 오류는 콘솔에만 찍히고 사라지고, admin에는 오류/데이터 상태를 확인할 방법이 전혀 없다.

## 목적

주최자(관리자)가 실서비스에서 벌어지는 세 종류의 문제를 `/admin`에서 확인할 수 있게 한다:
1. 서버 API 오류
2. 클라이언트(방문객 브라우저) 오류
3. 데이터 이슈(부스 정보 결측, 판단 레코드 정합성 등 — "사건"이 아니라 "지금 데이터 상태")

## 범위 결정 (브레인스토밍에서 확정)

- **알림 없음** — 실시간 Slack/이메일 알림은 이번 범위 밖. admin에 들어가서 확인하는 대시보드만.
- **데이터 이슈는 저장하지 않는다** — 조회 시점에 실시간으로 계산한다. 서버/클라이언트 오류처럼 "언젠가 발생한 사건"이 아니라 "지금 데이터가 어떤 상태인가"라서, 별도 로그로 쌓지 않고 admin이 그 탭을 열 때마다 다시 계산해 항상 최신 상태를 보여준다.
- **서버 오류와 클라이언트 오류는 같은 테이블**에 담는다 — 둘 다 구조가 동일한 "사건 기록"(언제·어디서·무슨 메시지·스택)이라 나눌 이유가 없다. `source` 컬럼으로만 구분한다.

## 아키텍처

### 1. 저장소 — `issue_log` 테이블

서버·클라이언트 오류 이벤트를 담는 단일 테이블. 컬럼: `id`, `source`(`server`|`client`), `message`, `stack`(nullable), `path`(발생 URL/경로, nullable), `digest`(Next.js 에러 다이제스트, nullable), `user_id`(nullable), `session_id`(nullable), `context`(jsonb — user agent, http status, method 등 부가정보), `created_at`.

`ai_query_log`(0014 마이그레이션)와 같은 관례를 따른다: 익명 insert 허용(누가 발생시켰든 기록은 남아야 한다), 조회는 admin만. `Repository` 인터페이스에 `logIssue()`/`listIssues()` 추가 — Mock·Supabase 양쪽 구현. 쓰기는 `loggedWrite()` 패턴으로 감싼다: 로깅 자체가 실패해도 원래 요청·화면은 절대 영향받지 않는다(로그를 남기려다 서비스가 더 망가지면 안 된다).

### 2. 서버 오류 캡처 — `instrumentation.ts`의 `onRequestError`

기존 API route 51개를 일일이 try/catch로 감싸는 대신, Next.js가 제공하는 전역 서버 오류 훅(`onRequestError`, Sentry 같은 도구가 쓰는 바로 그 메커니즘) 하나로 API route·RSC에서 발생하는 예외를 전부 잡는다. `logIssue({source: "server", ...})` 호출 한 곳으로 끝난다. 기존 route 파일은 무변경.

### 3. 클라이언트 오류 캡처 — 두 갈래

- **React 렌더 오류**: 이미 있는 `error.tsx`/`global-error.tsx`의 `console.error("[app:error]", error)` 자리(주석에 "monitoring hook — forward to a service in production"라고 이미 적혀 있던 자리)를 `POST /api/errors` 호출로 바꾼다.
- **React 트리 밖 오류**: 이벤트 핸들러·비동기 코드에서 나는 오류는 error boundary가 못 잡는다 — 지금은 이 부분이 통째로 안 잡히고 있다. 루트 레이아웃에 `window.onerror`/`unhandledrejection` 리스너를 한 번 등록하는 작은 클라이언트 컴포넌트를 새로 추가한다.

두 경로 모두 신규 라우트 `POST /api/errors`로 모인다. 방문객 앱 전체가 로그인 게이트 뒤에 있어(CLAUDE.md) 오남용 위험이 낮으므로 별도 인증 없이 열어두되, zod로 message/stack 길이를 제한한다.

### 4. 데이터 이슈 — 조회 시점 계산

저장 없이, admin이 탭을 열 때 계산한다. 두 종류:
- **부스 enrichment 결측**: CLAUDE.md에 정의된 최소 필수 6종(summary·valueTags·recommendationReasons·thingsToDo·timing·memoryHooks) 기준으로 부스별 결측 필드를 센다.
- **판단 레코드 정합성**: interest/verdict가 서로 모순되거나 고아 상태인 레코드를 찾는다 — 취향 추론(로미의 브레인)이 조용히 틀어지는 걸 조기에 잡기 위한 체크(D2 브레인스토밍 중 실제로 논의된 우려: 피드와 지도 두 곳에서 같은 부스 판단 버튼을 누르는 구조라, 레코드가 꼬이면 발견하기 어렵다).

### 5. admin UI — `/admin/errors`

탭 2개:
- **오류 로그**: 최신순, `source` 필터(전체/서버/클라이언트), 행 클릭 시 stack 펼침. `/admin/timeline` 리스트 패턴 재사용.
- **데이터 이슈**: 부스 결측 목록 + 판단 레코드 정합성 목록.

## 테스트

`issue_log` repo 메서드는 Mock repo 대상 유닛테스트. 데이터 이슈 계산(결측 카운트, 정합성 체크)은 순수 함수로 분리해 유닛테스트. `instrumentation.ts`·`error.tsx`·전역 리스너·`/admin/errors` 페이지는 이 프로젝트의 기존 관례상(다른 admin 라우트·에러 바운더리도 테스트 없음) 별도 테스트 없이 tsc+eslint로 검증한다.

## 스코프 밖 (이번엔 안 함)

- 실시간 알림(Slack/이메일)
- 로그 보존 기간 자동 정리(volume이 작아 필요해지면 나중에)
- 클라이언트 오류 dedup/그룹핑(같은 오류가 여러 번 쌓여도 이번엔 그대로 나열)
