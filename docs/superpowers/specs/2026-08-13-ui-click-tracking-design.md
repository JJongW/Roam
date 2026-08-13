# UI 클릭 집계 설계 (admin 분석)

**날짜**: 2026-08-13
**배경**: admin "안된 부분들" 3대 서브프로젝트(사용자별 행동 타임라인 → 분석 히트맵 재설계 →
admin 개요 대시보드) 착수 전 사용자가 별도 요청: "보통 온보딩에서 어떤 버튼을 사람들이
많이 누르는지 이런 통계는 있어야할 거아냐" — 지도 컨트롤·피드 카드 CTA·컴패니언 바를
전체(개인 아님) 집계로 봐야 한다고 명시. 온보딩 가치 선택 집계는 이미 별도로
`onboardingValueBreakdown`(commit 7eb6935)으로 shipped — 본 설계 범위 아님.

## 범위

- **포함**: 지도 컨트롤(줌인·줌아웃·전체보기·회전), 피드 소진 상태 CTA(마치기로 스크롤·
  지도로가기)·"새로 고르기" 버튼, 컴패니언 바(열기·FAQ 3문항), 관람 마치기 시작 버튼.
  전체 버튼별 클릭 수 집계(개인 아님).
- **제외**: 사용자별 행동 타임라인(별도 서브프로젝트, D1), 온보딩 가치 선택 집계(이미
  shipped), 히트맵 재설계·admin 개요 대시보드(다음 서브프로젝트들).
- **실제 코드 확인 결과 보정**: 브레인스토밍 중 언급된 "관심 밀도 토글" 지도 컨트롤은
  실재하지 않는다(`exhibition-map.tsx`엔 회전·줌인·줌아웃·전체보기 4개 버튼만 있음,
  히트맵은 prop으로 받아 상시 표시 — 토글 UI 없음). 범위에서 뺀다.

## 데이터 경로 — 기존 Stream A 재사용

`analytics_event` 테이블(`POST /api/analytics/events` → `repo.recordAnalytics`)을 그대로
쓴다. 버튼마다 새 enum 값을 늘리는 대신 **`ANALYTICS_TYPES`에 `"ui_click"` 하나만
추가**하고, 어떤 버튼인지는 `meta.control`(문자열)로 구분한다 — `route_start`·
`route_complete`·`booth_arrive`는 동선 제품 제거로 이미 죽은 값이라 debt를 더 쌓지 않는다.

**추적 대상 control id (11개, 고정 문자열):**

| control id | 위치 | 트리거 |
|---|---|---|
| `map_zoom_in` | `exhibition-map.tsx` | 확대 버튼 |
| `map_zoom_out` | 〃 | 축소 버튼 |
| `map_reset_view` | 〃 | 전체 보기 버튼 |
| `map_rotate` | 〃 | 90도 회전 버튼 |
| `feed_exhausted_finish` | `interest-feed.tsx` | 소진 상태 "마치기"(앵커 스크롤) |
| `feed_exhausted_map` | 〃 | 소진 상태 "지도로 보기" |
| `feed_repick` | 〃 | 목록 끝 "새로 고르기" |
| `companion_bar_open` | `companion-bar.tsx` | 하단 필 버튼(대화 시트 열기) |
| `companion_faq_q1` | 〃 | FAQ 질문 1 |
| `companion_faq_q2` | 〃 | FAQ 질문 2 |
| `companion_faq_q3` | 〃 | FAQ 질문 3 |
| `finish_visit_start` | `finish-visit.tsx` | "오늘 관람 마치기" 버튼 |

## exhibitionId 귀속 문제와 해법

`/api/analytics/events`는 지금 `boothId → repo.getBooth(boothId).exhibitionId`로만
전시를 알아낸다. 위 11개 컨트롤은 전부 부스와 무관해 이 경로가 안 먹는다(세션의
`exhibitionId`로 폴백하면 세션이 다른 전시에서 만들어졌거나 "unknown"으로 굳어 있을 때
틀린 전시에 잡힌다 — `view` 이벤트에서 이미 한 번 고친 것과 같은 버그 클래스).

`analyticsEventInputSchema`에 `exhibitionSlug?: string`을 추가한다. 라우트는
`boothId`가 있으면 기존 경로, 없고 `exhibitionSlug`가 있으면
`repo.getExhibition(exhibitionSlug)`(이미 슬러그로 조회하는 기존 메서드,
`ExhibitionDetail.exhibition.id`)로 전시를 정한다. 클라이언트는 이미 슬러그를 쥐고
있다:
- `ExhibitionMap`은 새 prop `exhibitionSlug?: string`을 받는다(현재 유일한 호출부
  `map-view.tsx`가 이미 `detail.exhibition.slug`를 갖고 있다 — `persistKey`와 값은
  같지만 의미가 다른 별개 prop으로 둔다, `persistKey`는 스토리지 키일 뿐 전시 식별
  용도가 아니다).
- `InterestFeed`는 이미 `slug` prop을 갖고 있다 — 그대로 쓴다.
- `CompanionBar`는 prop이 없다 — `pathname`에서 `/exhibitions/([^/]+)/` 정규식으로
  뽑는다(이미 `isExhibitionHome` 판정에 같은 pathname을 정규식으로 쓰는 기존 패턴).
- `FinishVisit`는 이미 `slug` prop을 갖고 있다 — 그대로 쓴다.

## 클라이언트 계측

fire-and-forget: `void fetch("/api/analytics/events", { method: "POST", ... })` —
기존 `interest-feed.tsx`의 `fire()`가 쓰는 `api.post` 패턴을 재사용한다. 실패해도
UI 동작(줌·회전·시트 열기 등)을 막지 않는다 — 클릭 자체는 항상 즉시 실행되고 계측
호출은 그 위에 얹는다.

## 집계 함수

`src/lib/admin/ui-click-breakdown.ts` — `journey-funnel.ts`/`issue-grouping.ts`와 같은
패턴(순수 함수, 저장소가 아니라 이미 가져온 이벤트 배열을 받는다):

```ts
export interface UiClickCount {
  control: string;
  count: number;
}

export function uiClickBreakdown(events: AnalyticsEvent[]): UiClickCount[]
```

`type === "ui_click"`인 이벤트만 골라 `meta.control`로 묶고 count 내림차순 정렬,
0회 control은 결과에 없음(집계 대상 자체가 없으므로).

admin 분석 페이지는 이미 있는 `repo._allAnalytics(exhibitionId)`(mock·supabase 둘 다
구현됨, `issue-grouping`/`journey-funnel`과 동일하게 raw 배열을 순수 함수에 넘기는
기존 관례)로 이벤트를 가져와 이 함수에 넘긴다.

## admin UI

`src/components/charts/ui-click-chart.tsx` — `onboarding-value-chart.tsx`를 그대로
템플릿 삼는다(같은 `COLORS` 팔레트, `recharts` `BarChart layout="vertical"`,
같은 tooltip 스타일). control id → 한글 라벨 매핑은 컴포넌트 내부 상수(위 표의
"트리거" 열 문구를 축약한 라벨)로 둔다 — `VALUE_TAGS`처럼 재사용되는 공유 사전이
아니라 이 차트 전용이라 굳이 별도 모듈로 뺄 이유가 없다(YAGNI).

`src/app/admin/analytics/page.tsx`에 `<AdminSection title="버튼 인기도">` 패널 하나
추가, `onboardingValueBreakdown` 패널 바로 아래.

## 제약 (CLAUDE.md 준수)

- LLM 없음 — 순수 카운팅.
- Mock repo 변경(스키마 필드 추가는 없음, 기존 `recordAnalytics`/`_allAnalytics` 그대로
  재사용) — 새 로직은 `ui-click-breakdown.ts`뿐이라 여기에 단위 테스트.
  Supabase 쪽은 스키마 변경 없음(`meta` 컬럼이 이미 자유 JSON) → tsc/eslint만.
- 라우트 스키마 확장(`exhibitionSlug` 추가)은 하위호환 optional 필드라 기존
  `view`/`dwell` 이벤트 호출부(부스 상세 등)는 변경 불필요.

## 자체 검토

- 플레이스홀더 없음 — 모든 control id·파일 경로·시그니처 확정값.
- 브레인스토밍 브리프의 "관심 밀도 토글"은 실재하지 않아 범위에서 제외(위 "실제 코드
  확인 결과 보정" 참고) — 실제 코드와 어긋나는 요구사항을 그대로 계획에 넣지 않았다.
- 범위: 단일 서브프로젝트, 기존 Stream A 인프라의 순수 확장이라 추가 분해 불필요.
