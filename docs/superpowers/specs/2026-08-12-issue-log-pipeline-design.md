# 오류/로그 파이프라인 정비 — 설계

**날짜**: 2026-08-12
**성격**: 설계 문서(브레인스토밍 승인 완료) — admin "오류/이슈" 개편의 4개 서브프로젝트 중 1번째.
나머지 3개(사용자별 행동 타임라인, 분석 히트맵 재설계, admin 개요 대시보드)는 각자 별도 스펙.

## 배경 — 조사로 확인한 현재 상태

- 서버 오류 캡처 경로는 두 곳이다: (1) `src/instrumentation.ts`의 `onRequestError`(Next.js
  표준 훅 — 진짜 uncaught 예외만 여기로 온다), (2) 클라이언트(`error-reporter.tsx`·
  `error.tsx`·`global-error.tsx`)가 `POST /api/errors`로 보고. **`src/lib/api/http.ts`의
  `withErrorBoundary`(전체 API route 52개 중 7개가 쓰는 헬퍼)는 오류를 여기서 잡아
  처리해 버려서(catch 후 `fail()` 응답 반환, 재던지기 없음) `onRequestError`까지 절대
  안 올라간다 — 콘솔에만 찍히고 admin DB(`issue_log`)엔 안 남는다.** 이 7개 라우트의
  처리된 오류가 admin에서 안 보이는 진짜 원인(나머지 45개는 명시적 catch가 없어
  uncaught로 올라가므로 이미 캡처된다).
- 이미 비동기다: 클라이언트는 fire-and-forget fetch, 서버 훅도 응답을 막지 않는다.
  이 부분은 재설계 불필요.
- `IssueLog` 타입(`src/lib/types/index.ts:359`)엔 이미 `userId`·`sessionId`·`context`가
  있는데 `issue-log-list.tsx`가 표시를 안 한다 — 데이터는 있고 UI만 안 보여주는 부분과,
  진짜 데이터 자체가 없는 부분(기기·위치)이 섞여 있다.
- Vercel 배포라 모든 요청에 `x-vercel-ip-country`/`x-vercel-ip-city` 헤더가 이미 실려
  온다 — 새 지오IP 서비스 연동 없이 국가/도시를 바로 읽을 수 있다. User-Agent 헤더도
  이미 있다(파싱 코드만 없음).
- 보존기간·삭제 기능 자체가 없다 — `issue_log` 테이블이 무한 적재된다.
- 같은 오류가 반복되면 지금은 매번 별도 행으로 쌓여 다른 이슈를 파묻는다.

## 승인된 결정 (브레인스토밍 문답 요약)

- 사용자: 혼자(운영자 1인), 외부 알림/Sentry 연동 불필요. 향후 확장 가능한 구조로만.
- 보존기간: 30일. 삭제: 크론 없이 admin 버튼으로 수동.
- 위치: IP 자체는 저장하지 않는다 — 국가/도시만.
- 중복: 같은 오류(경로+메시지) 묶어서 횟수로 표시.
- 범위: "오류"만(warning/info 레벨은 이번 범위 밖).
- 영어 메시지 번역: 전체 번역 안 함 — 경로·시각·사용자 같은 맥락 정보로 충분하게.
- 구성요소 분류: 새 입력 없이 경로(path) 규칙으로 자동 분류.

## 아키텍처

### 1. 캡처 완전성 — `withErrorBoundary`도 기록하게

`src/lib/api/http.ts`의 `withErrorBoundary`가 catch한 오류도 `logIssue`를 타도록 고친다.
`instrumentation.ts`의 `onRequestError`와 로직(마스킹·기기·위치 파싱)이 겹치므로 공용
헬퍼로 뽑는다.

**신설**: `src/lib/api/issue-capture.ts`
```ts
export async function captureServerIssue(input: {
  error: unknown;
  path: string;
  method?: string;
  userAgent?: string;
  country?: string;
  city?: string;
  userId?: string;
  sessionId?: string;
  digest?: string;
}): Promise<void>
```
내부에서 `redact`(아래)로 message/stack을 마스킹하고, `parseUserAgent`로 device 문자열을
만들고, `repo.logIssue`를 호출한다. `withErrorBoundary`와 `instrumentation.ts`의
`onRequestError` 둘 다 이 함수 하나만 부른다 — 중복 로직 없음.

`withErrorBoundary` 시그니처를 `(req: Request, handler: () => Promise<NextResponse>) =>`로
바꾼다 — 실제 호출부는 7곳뿐이라 전부 고쳐도 부담이 작고, `req.url`에서 path를,
`req.headers`에서 user-agent·geo 헤더를 한 곳에서 일관되게 뽑을 수 있다(`next/headers`의
`headers()`는 경로를 안 주므로 이쪽이 더 간단하고 안전).

### 2. 기기 파싱

**신설**: `src/lib/admin/issue-capture-parse.ts` (순수 함수, 새 패키지 없음)
```ts
/** User-Agent → "iPhone · Safari" 같은 간단한 표시 문자열. 모르면 undefined. */
export function parseUserAgent(ua?: string): string | undefined
```
정규식으로 OS(iPhone/iPad/Android/Mac/Windows)와 브라우저(Safari/Chrome/Firefox) 각각을
탐지해 " · "로 합친다. 둘 다 못 찾으면 undefined(빈 문자열 저장 안 함).

클라이언트 발 오류(`error-reporter.tsx`·`error.tsx`·`global-error.tsx`)는 지금 요청
바디에 `userAgent`가 없다 — `navigator.userAgent`를 추가로 실어 보내고, 서버가
`errorReportSchema`로 받아 `parseUserAgent`를 태운다(클라이언트가 직접 파싱하지 않는다
— 파싱 로직 단일 소스).

### 3. 위치(국가/도시)

**신설**: `geoFromHeaders(get: (name: string) => string | null): { country?: string; city?: string }`
(같은 `issue-capture-parse.ts`) — `x-vercel-ip-country`/`x-vercel-ip-city` 헤더를 읽는다.
로컬 개발(Vercel 아님)에선 헤더가 없어 자연스럽게 undefined. IP는 어디에도 안 담는다.

### 4. 마스킹

**신설**: `redact(text?: string): string | undefined` (같은 파일) — 이메일 패턴
(`\S+@\S+\.\S+`)과 **진짜 비밀처럼 생긴 패턴만** 좁게 마스킹한다: JWT
(점 3개로 나뉜 base64 세 조각), `Bearer <token>`, 알려진 API 키 접두사(`sk-`·`AIza` 등).
자체 리소스 ID(`uid()`가 만드는 `prefix_영숫자` 형태 — 예: `booth_abc12345xyz789`)는
**의도적으로 제외**한다 — 디버깅에 필요한 맥락(어느 부스·어느 사용자인지)이라 여기까지
지우면 "맥락으로 충분하게"라는 목표와 충돌한다. 일반적인 "20자 이상 영숫자"처럼 넓은
규칙은 쓰지 않는다(우리 ID 형식과 겹쳐 오탐이 남).
`redactContext(ctx?: Record<string, unknown>)`는 JSON.stringify 후 같은 치환을 적용하고
다시 파싱(실패하면 통째로 `{ redacted: true }`로 대체 — 마스킹 실패가 원본 노출로
이어지지 않게). `captureServerIssue`와 `POST /api/errors` 양쪽 다 저장 직전에 이걸
거친다 — repo 구현(Mock/Supabase) 각각이 아니라 이 한 곳에서만.

### 5. 스키마 확장

`IssueLog`(`src/lib/types/index.ts`)에 필드 추가:
```ts
export interface IssueLog {
  // ...기존 필드 그대로
  device?: string;   // parseUserAgent 결과
  country?: string;
  city?: string;
}
```
`Repository.logIssue` 입력 타입에도 동일 필드 추가.

**Supabase**: 새 마이그레이션 `supabase/migrations/0037_issue_log_device_geo.sql`
```sql
alter table issue_log
  add column if not exists device  text,
  add column if not exists country text,
  add column if not exists city    text;
```
`supabase/repository.ts`의 `logIssue`/`mapIssueLog`(select 매핑) 양쪽 갱신.
`Mock` repository는 타입만 통과하면 되므로 필드 추가만.

`errorReportSchema`(`src/lib/schemas`)에 `userAgent: z.string().max(300).optional()` 추가.

### 6. 중복 묶기 + 구성요소 분류 — 순수 함수, 이번 세션 확립된 패턴 재사용

`journey-funnel.ts`/`onboardingValueBreakdown`과 같은 자리(`src/lib/admin/`)에 신설.

**신설**: `src/lib/admin/issue-grouping.ts`
```ts
export function componentOf(path?: string): string
// 규칙(우선순위 순): /api/admin, /admin → "관리자"
//                    /login, /auth, /api/auth → "로그인"
//                    /exhibitions/*/map → "지도"
//                    /booths → "부스 상세"
//                    /exhibitions (map 제외) → "피드/전시홈"
//                    /api/me/reflect, 컴패니언 관련 API → "컴패니언"
//                    나머지 → "기타"

export interface IssueGroup {
  key: string;            // `${path}::${message}`
  component: string;
  path?: string;
  message: string;
  count: number;
  firstSeenAt: string;
  lastSeenAt: string;
  sample: IssueLog;        // 가장 최근 발생 건 — stack/context/device/location/userId 열람용
}

/** 30일 창(호출부가 이미 windowed된 목록을 넘긴다는 전제) 안에서
 *  (path, message)로 묶는다. 정렬: lastSeenAt 내림차순. */
export function groupIssues(issues: IssueLog[]): IssueGroup[]
```
`repo.listIssues()` 자체는 지금처럼 원본 배열을 반환(윈도우: 최근 30일, 기존 `limit`
옵션과 별개로 날짜 필터 추가). admin 페이지(`errors/page.tsx`)가 받아서
`groupIssues()`에 넘긴다 — repo 구현 두 곳(Mock/Supabase)에 그룹핑 로직을 중복
안 넣는다.

### 7. 보존/삭제

**신설 repo 메서드**: `deleteOldIssues(olderThanDays: number): Promise<number>`
(Mock: 배열 filter, Supabase: `delete from issue_log where created_at < now() - interval`).
반환값 = 삭제된 행 수(버튼 클릭 후 "N건 삭제했어요" 피드백용).

**신설**: `POST /api/admin/issues/cleanup` — `requireAdmin()` 가드, body 없음, 고정
30일. 응답 `{ deleted: number }`.

**UI**: `errors/page.tsx`(오류 로그 탭) 상단에 "30일 이전 로그 정리" 버튼 —
클릭 시 확인 없이 바로(파괴적이지만 되돌릴 필요 없는 로그 데이터라 확인 다이얼로그
불필요, 삭제 결과만 토스트).

### 8. UI — `issue-log-list.tsx` 재작성

- 필터: 기존 전체/서버/클라이언트 탭에 구성요소 필터(드롭다운 또는 칩) 추가.
- 목록 행: 구성요소 배지 · 메시지 · **횟수**("124회") · 최근 발생 시각(상대 시간,
  예: "3분 전") · path.
- 펼치면: 최초 발생 시각, 최신 샘플의 stack, context(JSON pretty), userId(있으면
  `/admin/accounts/[id]`로 링크), device, country/city.

## 데이터 흐름 요약

```
클라이언트 오류 → POST /api/errors(userAgent 포함) → redact + parseUserAgent
                                                    → repo.logIssue(device/country/city 포함)

API route 오류(처리됨) → withErrorBoundary catch → captureServerIssue()
API route/RSC 오류(uncaught) → onRequestError → captureServerIssue()
                                                    → repo.logIssue

admin 오류 탭 → repo.listIssues(최근 30일) → groupIssues() → 목록 렌더
admin "정리" 버튼 → POST /api/admin/issues/cleanup → repo.deleteOldIssues(30)
```

## 수용 기준

- API route에서 `fail()`로 처리되는 오류(예: zod validation 실패 이후 unexpected throw)도
  `issue_log`에 남는다 — 재현: 강제로 route 안에서 throw하는 테스트 route 하나로 확인.
- 같은 (path, message)가 3번 발생하면 목록엔 1행, count=3으로 뜬다.
- 국가/도시가 있으면 표시, 없으면(로컬 개발) 조용히 생략 — 에러 안 남.
- 마스킹: message에 `foo@bar.com`이 들어가면 저장된 값엔 `[masked]`만 남는다(유닛 테스트로
  고정).
- "30일 이전 로그 정리" 클릭 → 실제로 30일 넘은 행만 삭제, 최근 행은 유지.
- `npx tsc --noEmit` / `npx vitest run` / `npx eslint <changed>` 통과.
- `parseUserAgent`·`redact`·`redactContext`·`componentOf`·`groupIssues` 전부 유닛 테스트.

## 스코프 밖 (다음 서브프로젝트나 별도 과제)

- warning/info 레벨 로그.
- Slack/Sentry 등 외부 알림 연동.
- 에러 메시지 자동 번역(맥락 정보로 대체하기로 결정).
- 크론 기반 자동 로테이션(수동 버튼으로 결정).
- 사용자별 행동 타임라인·분석 히트맵 재설계·admin 개요 대시보드 — 각자 별도 스펙.
