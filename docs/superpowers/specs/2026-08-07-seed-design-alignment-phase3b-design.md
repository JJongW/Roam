# SEED 디자인 시스템 정렬 3단계 계속 — Progress Circle · Menu Design

**Goal:** 로드맵이 "당장 수요 없음"으로 미뤄뒀던 Progress Circle·Menu를 지금 만든다.
둘 다 순수 스펙큘레이티브 컴포넌트로 남기지 않고 최소 하나의 실제 연결점(소비처 또는
데모)을 갖게 한다.

**Architecture:** `Menu`는 `AlertDialog`(2단계)가 `@radix-ui/react-alert-dialog`를,
`Sheet`가 `@radix-ui/react-dialog`를 감싸는 것과 같은 패턴으로 `@radix-ui/react-dropdown-menu`를
새로 설치해 감싼다. `ProgressCircle`은 새 의존성 없이 순수 SVG + Tailwind 유틸리티로
구현한다. 둘 다 `src/components/ui/`에 신규 파일로 추가하고, 1·2단계 토큰만 쓴다.

## Global Constraints

- Progress Circle의 tone은 `neutral`/`brand`만 만든다 — SEED의 `static-white`/`custom`은
  지금 어두운 배경 위 오버레이 같은 소비처가 없어 스코프 밖.
- indeterminate(스피너) 모드는 Tailwind 내장 `animate-spin`을 그대로 쓴다 — SEED의
  1.2s 큐빅베지어 타이밍을 위해 새 모션 토큰을 만들지 않는다(차이가 미미하고, 이
  모드는 지금 실사용처가 없어 정밀도보다 단순함을 우선).
- Menu는 지금 실제 소비처가 없다 — 관리자 타임라인(중단된 스레드, 향후 재개 예정) 작업
  때 쓸 예정으로 인프라만 준비한다. 이번 스코프에 관리자 타임라인 자체는 포함 안 됨.
- 두 컴포넌트 다 `/admin/design-system`에 데모 섹션을 추가해 최소 한 곳에서는 실제로
  렌더되게 한다(순수 죽은 코드로 안 남기기 위함).
- `companion-bar.tsx`의 `tastePct` 알약(1단계 로드맵 이후 새로 발견된, 3단계가 놓친
  5번째 칩 중복)도 이번에 `Chip`으로 함께 정리한다.
- Roam은 라이트 모드만 지원 — 다크모드 검증 불필요.

---

## 섹션 A — Progress Circle

**SEED 스펙 확인(seed-design.io/components/progress-circle):**
- size 40(두께 5px, 풀페이지 로딩용) / size 24(두께 3px, 요소 단위 로딩용)
- determinate(`value` 기반 채움) / indeterminate(진행 시간 모를 때 회전) 두 모드
- tone: neutral(기본, 로딩 자체 인지가 중요할 때) / brand(핵심 전환 강조) / static-white
  (어두운 배경 위) / custom — 이번엔 neutral·brand만

**구현 (`src/components/ui/progress-circle.tsx`, 신규):**
```tsx
interface ProgressCircleProps {
  size?: 24 | 40; // 기본 24
  value?: number; // 0~100, 주어지면 determinate
  indeterminate?: boolean; // true면 회전 스피너(value 무시)
  tone?: "neutral" | "brand"; // 기본 neutral
  className?: string;
}
```
SVG 두 개의 `<circle>`(트랙 + 진행) 겹침, `stroke-dasharray`/`stroke-dashoffset`로 채움
계산(`circumference = 2πr`, `offset = circumference * (1 - value/100)`). 반지름은
`(size - strokeWidth) / 2`. indeterminate면 `<svg>`에 Tailwind `animate-spin` 클래스를
얹고 진행 원의 `stroke-dasharray`를 원주의 약 25%로 고정(회전하는 부분 호). tone은
`neutral`→`var(--muted-foreground)`, `brand`→`var(--primary)`를 진행 원 stroke 색으로.

**소비처 (`src/components/companion/companion-bar.tsx`):**
기존(취향 알약, 63~74행 부근):
```tsx
          {isExhibitionHome && home && tastePct !== null && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {t("companion.tastePct", { pct: tastePct })}
            </span>
          )}
```
교체(`Chip` + `ProgressCircle` prefix 아이콘):
```tsx
          {isExhibitionHome && home && tastePct !== null && (
            <Chip
              icon={<ProgressCircle size={24} value={tastePct} tone="brand" />}
              className="pl-0.5"
            >
              {t("companion.tastePct", { pct: tastePct })}
            </Chip>
          )}
```
(문구·조건은 그대로 — UI 컴포넌트만 교체.)

## 섹션 B — Menu

**SEED 스펙 확인(seed-design.io/components/menu):**
- 구조: Container(배경·그림자·테두리) / Menu Group / Menu Group Label / Menu Item
  (prefix 아이콘/label/badge/suffix 슬롯, prefix·suffix 동시 사용 안 함 — chevron 예외)
  / Divider
- 위치: 트리거 기준 side(top/bottom/left/right) + align, 트리거와 8px 간격, 공간
  부족하면 자동으로 반대편 전환(flip)·화면 안에 맞춤(shift)
- 항목 상태: Enabled/Hover·Pressed/Focused/Disabled, variant `default`/`destructive`
  (삭제류는 빨간색)
- 가이드: 항목 7개 넘으면 그룹핑, 최대 480px 높이에서 스크롤

**구현 (`src/components/ui/menu.tsx`, 신규):**
`@radix-ui/react-dropdown-menu` 설치 후 `Sheet`/`AlertDialog`와 같은 패턴으로 래핑:
```tsx
Menu (Root) / MenuTrigger / MenuContent / MenuGroup / MenuGroupLabel / MenuItem
  ({variant?: "default" | "destructive", icon?: ReactNode}) / MenuSeparator
```
`MenuContent`는 `sideOffset={8}`(SEED의 8px 간격), `--radius-lg`/`--shadow-pop` 토큰,
`max-h-[480px] overflow-y-auto`. `MenuItem`의 `destructive` variant는 `text-destructive`
+ hover 시 `bg-destructive/10`.

**소비처 없음** — 이번 스코프엔 실제 호출부가 없다. `/admin/design-system`에 데모
섹션(트리거 버튼 + "수정"·"복제"·구분선·"삭제"(destructive) 4항목 메뉴)만 추가해
렌더·상호작용을 검증 가능하게 한다.

## 섹션 C — `/admin/design-system` 데모 섹션 추가

기존 6개 섹션(색·타이포·간격·radius·그림자·모션) 다음에 2개 추가:
- **Progress Circle**: determinate 슬라이더(0~100 드래그하면 실시간으로 원이 채워짐) +
  indeterminate 스피너 나란히, size 24/40 각각.
- **Menu**: 트리거 버튼 하나 + 클릭하면 뜨는 4항목 메뉴(수정/복제/구분선/삭제).

둘 다 기존 `AdminSection` 재사용, 새 레이아웃 안 만듦.

---

## 에러 처리 / 엣지 케이스

전부 UI 컴포넌트라 별도 실패 시나리오 없음. `tastePct === null`(판정 5개 미만)이면
기존처럼 알약 자체가 안 뜨는 조건 그대로 유지.

## 테스트

- 로직 없는 순수 UI라 단위 테스트 대상 거의 없음. `ProgressCircle`의 dasharray/offset
  계산이 별도 순수 함수로 분리되면 그 부분만 유닛 테스트(구현 단계에서 결정).
- `npx tsc --noEmit`, `npx eslint <변경 파일>`, `npx vitest run` 회귀 확인.
- 수동 확인(라이트 모드만): companion-bar 알약이 실제 데이터로 원+텍스트 조합으로
  뜨는지, `/admin/design-system`의 두 새 섹션(슬라이더로 채움 확인, 메뉴 열고 항목
  클릭 가능한지, destructive 항목이 빨갛게 보이는지)이 정상 동작하는지.
