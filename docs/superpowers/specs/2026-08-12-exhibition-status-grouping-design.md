# 전시 목록 상태별 구분 + 회차 묶음 — 설계

**날짜**: 2026-08-12
**배경**: 홈(`src/app/(visitor)/page.tsx`)이 전시를 평평한 목록으로만 보여준다. 실제로 이미 종료된 전시(SIBF, SIF)와 예정된 전시(House Archive)가 섞여 있는데 구분이 없다.

## 목적

홈의 전시 목록을 **예정 / 진행중 / 지난 전시** 세 섹션으로 나누고, 같은 회차 시리즈("제N회 OO도서전" 등)는 대표 전시 하나로 묶어 보여준다.

## 범위 결정 (브레인스토밍에서 확정)

- **상태 판정**: `startDate`/`endDate` vs 오늘 날짜만으로 계산. DB에 새 상태 필드를 추가하지 않는다.
- **회차 묶음**: "제N회" 접두사를 뗀 나머지 이름을 묶음 키로 자동 감지한다. 새 DB 필드(`seriesSlug` 등)를 추가하지 않는다 — 순수하게 표시 단계에서만 같은 묶음의 대표 전시 1개로 합친다(진행중·예정은 가장 임박한 것, 종료는 가장 최근 것). 별도 "회차 목록" 페이지는 만들지 않는다.
- **섹션당 표시 개수**: 최대 3개, 넘으면 "더보기"로 같은 자리에서 나머지를 펼친다. 새 라우트를 만들지 않는다.
- **추천 배지**: 기존 취향 겹침 추천(`matchExhibition`/`topReason`)은 진행중·예정 섹션에만 적용한다. 이미 끝난 전시에 "네 취향과 맞아"라고 추천하는 건 의미가 없다 — 지난 전시 섹션엔 배지를 붙이지 않는다.

## 아키텍처

### 1. 순수 함수 — `src/lib/exhibition/status.ts`(신규)

- `exhibitionStatus(ex: Exhibition, todayISO: string): "upcoming" | "ongoing" | "ended"` — `todayISO < startDate`면 upcoming, `todayISO > endDate`면 ended, 나머지는 ongoing.
- `seriesKeyOf(name: string): string` — `/^제\s*\d+\s*회\s*/` 접두사를 떼어낸 나머지를 trim해 반환. 접두사가 없으면 이름 그대로가 키(그 전시 하나만의 묶음이 된다).
- `pickSeriesRepresentative(exhibitions: Exhibition[], status: "upcoming"|"ongoing"|"ended"): Exhibition[]` — `seriesKeyOf`로 그룹핑 후, upcoming·ongoing은 `startDate` 오름차순 1등, ended는 `endDate` 내림차순 1등을 그룹별 대표로 남긴다.

### 2. 홈 페이지 재구성 — `src/app/(visitor)/page.tsx`

기존 `matchExhibition`/정렬 로직(취향 겹침 점수 계산)은 그대로 둔다. 그 결과 위에서: 전체 전시를 상태별로 3그룹(`exhibitionStatus`)으로 나누고, 각 그룹에 `pickSeriesRepresentative`를 적용한 뒤 정렬(진행중·예정은 기존 매치 점수 우선 정렬 유지, 지난 전시는 종료일 최근순)한다. `topReason`(추천 배지)은 진행중·예정 그룹에서 나온 후보에만 계산해 붙인다.

### 3. 더보기 컴포넌트 — `src/components/exhibition/exhibition-status-section.tsx`(신규, client)

섹션 제목 + `ExhibitionCard` 목록(최대 3개) + 남은 개수가 있으면 "더보기 (N)" 버튼. 클릭하면 로컬 state로 전체를 펼친다(별도 API 호출·라우트 없음 — 이미 서버에서 다 받아온 목록 중 일부만 숨겼다 보여주는 것뿐).

## 테스트

`exhibitionStatus`/`seriesKeyOf`/`pickSeriesRepresentative`는 순수 함수라 유닛테스트(경계값: 시작일 당일, 종료일 당일, 접두사 없는 이름, 같은 회차 여러 개). 홈 페이지·섹션 컴포넌트는 이 프로젝트의 기존 관례상(다른 방문객 페이지도 대부분 테스트 없음) 별도 테스트 없이 tsc+eslint로 검증한다.

## 스코프 밖

- DB 스키마 변경(상태·회차 필드 추가)
- 회차별 전체 이력을 보여주는 별도 페이지
- 종료 전시에 대한 취향 겹침 배지
