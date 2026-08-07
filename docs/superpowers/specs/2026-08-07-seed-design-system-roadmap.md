# SEED 디자인 시스템 정렬 — 전체 로드맵 (왜 · 뭘 추가 · 뭘 수정)

이 문서는 [1단계 상세 스펙](./2026-08-07-seed-design-alignment.md)이 다루는 "토큰
뼈대 + `/admin/design-system`" 너머, 전체 정렬 작업이 왜 필요하고 무엇을 추가·수정
해야 하는지를 한곳에 모아둔 로드맵이다. 1단계만 지금 구현 계획까지 나가고, 2·3단계는
이 문서 수준(무엇을·왜)까지만 — 각각 착수할 때 이 정도 깊이의 자체 스펙으로 다시
다듬는다.

## 왜 이 작업을 하는가

1. **토큰이 아예 없거나 근거 없이 흩어져 있었다.** 간격·모션은 토큰 자체가 없어
   컴포넌트마다 `px-4`/`px-5`, `duration-150`/`duration-300`을 감으로 골라 썼다
   (실측: 좌우 여백 `px-4` 20곳·`px-5` 23곳 반반, duration 150/200/300/500 혼재).
   radius·그림자는 토큰이 있었지만 값을 손으로 골라 서로 왜 다른지 설명이 없었다.
2. **품질 기준을 검증된 시스템에 맞춘다.** 색은 이미 Roam의 정체성이라 유지하지만,
   나머지(간격·radius·그림자·모션·타이포 위계)는 당근마켓 SEED처럼 대규모
   프로덕션에서 검증된 스케일을 가져와 "왜 이 값인지"에 답할 수 있게 한다.
3. **폰트도 사실상 없었다.** 기존 Inter는 한글 글리프가 없는 라틴 전용 폰트라
   한국어 텍스트(앱 대부분)엔 적용되지 않고 OS 기본 폰트로 조용히 폴백되고
   있었다 — Pretendard(한글 최적화, 무료 오픈소스)로 교체한다.
4. **컴포넌트 목록이 실제 필요보다 훨씬 얇다.** shadcn 기반 14개뿐이라 반복되는
   UI 패턴(확인 다이얼로그·칩·아바타 등)을 매번 새로 만들거나 `window.confirm()`
   같은 네이티브 대체재로 때웠다(아래 "왜 수정" 참고).
5. **관리자가 이 전체를 한눈에 검증할 곳이 없었다.** `/admin/design-system`이
   생기면 새 토큰·컴포넌트가 실제로 뭘 뜻하는지 코드를 안 열어도 바로 확인된다.

## 1단계 — 토큰 뼈대 + `/admin/design-system` (스펙 완료, 구현 계획으로 진행)

상세: [2026-08-07-seed-design-alignment.md](./2026-08-07-seed-design-alignment.md)

- **추가**: `pretendard` 패키지, spacing 원시·의미 토큰, radius 세부 스케일
  (`r0_5`~`r2_5`, `full`), 모션 CSS 변수 + `src/lib/motion.ts`,
  `/admin/design-system` 페이지.
- **수정**: `src/app/layout.tsx`의 폰트 로딩(Inter→Pretendard, `next/font/local`),
  `globals.css`의 `--radius-sm/md/lg/xl/2xl`, `--shadow-card/sheet/pop`,
  Tailwind `--text-xs~3xl` 값을 SEED 기준으로 교체(radius·타이포는 이름 유지 —
  기존 컴포넌트 코드 무변경으로 자동 적용). `AdminSidebar`의 `ITEMS`에 항목 하나
  추가.

## 2단계 — 기존 컴포넌트가 새 토큰을 "제대로" 쓰도록 정리

1단계는 이름이 같은 토큰의 *값만* 바꾸는 것이라 기존 코드가 자동으로 새 값을
받긴 하지만, 애초에 토큰을 안 쓰고 임의 값을 박아둔 곳들은 여전히 안 맞는다.

**왜 수정하나**: 예를 들어 그림자를 `shadow-[var(--shadow-card)]`가 아니라
`shadow-[0_2px_8px_rgba(0,0,0,0.1)]`처럼 인라인으로 박아둔 컴포넌트는 1단계
토큰 교체의 혜택을 전혀 못 받는다. 간격도 마찬가지 — `gap-3`(12px, 우연히 SEED
`component-default`와 같음)처럼 이름만 안 붙었지 값은 맞는 경우와, 진짜 임의의
값(`gap-[13px]`류)이 섞여 있어 구분해서 정리해야 한다.

**뭘 해야 하나**(착수 시 실제 grep으로 재조사해 확정):
- `shadow-[...]` 인라인 값을 쓰는 컴포넌트를 찾아 `var(--shadow-*)`로 교체
- 화면 좌우 여백(`px-4`/`px-5` 혼재)을 `--spacing-global-gutter`(16px) 기준으로
  통일할지, 지금처럼 화면마다 다르게 둘지 결정 — **1단계 논의에서 남겨둔 지점**,
  2단계 착수 시 사용자와 다시 확인 필요
- `duration-150/200/300/500`을 의미에 맞는 `--motion-d*`로 교체(예: 버튼 눌림은
  `pressed-scale`=150ms, 페이지 전환류는 200ms 이상)
- `window.confirm()`으로 때운 삭제 확인(`booth-manager.tsx` 등)을 3단계에서 만들
  Alert Dialog 컴포넌트로 교체 — 3단계 완료 후에 가능

## 3단계 — 부족한 컴포넌트 채우기

**왜 추가하나**: 반복되는 UI 패턴을 매번 새로 만들거나 네이티브 브라우저 API
(`confirm()`)로 대체해온 것들을 재사용 가능한 컴포넌트로 승격한다.

### Roam이 이미 가진 것(14개, shadcn) — SEED 대응
Badge·Button(Action/Input Button 대응)·Card(SEED엔 없는 범용 컨테이너, 유지)·
Input(Text Input)·Label·Progress(선형만)·Select·Separator(Divider)·Sheet(Bottom
Sheet)·Skeleton(Content Placeholder 겸)·Slider·Sonner(Snackbar)·Switch·Tabs·
Textarea.

### 추가가 필요해 보이는 것(우선순위는 착수 시 재논의)
- **Alert Dialog** — 지금 `window.confirm()`으로 때우는 모든 삭제 확인(부스·이벤트
  관리, 앞으로 만들 계정·커뮤니티·북마크 관리 전부)이 이걸 기다리고 있다. 가장
  먼저 필요.
- **Dialog** — `AppOnboardingGate`처럼 `role="dialog"` div를 직접 짜둔 곳들을
  정식 컴포넌트로 승격.
- **Chip** — `CategoryChip`·`ThemeChip`·`ValueChips`가 각자 따로 있는데, 공통
  Chip 위에 각자 variant를 얹는 형태로 통합할 여지가 있음.
- **Avatar** — `RoamAvatar` 등 여러 곳에서 비슷한 원형 이미지 패턴을 반복 중.
- **Callout** — 부스 상세의 팁 박스 등 강조 정보 박스가 지금 컴포넌트 없이
  스타일만 반복됨.
- **Menu / Menu Sheet** — 드롭다운형 액션 메뉴가 필요한 지점이 생기면(지금은
  아직 없음, 관리자 화면 확장 시 필요해질 가능성).
- **Progress Circle** — 선형 Progress만 있음. 원형이 필요한 지점(예: 짧은 로딩)
  이 생기면.

### SEED엔 있지만 Roam엔 안 맞는 것(추가 안 함)
- **Manner Temp / Manner Temp Badge** — 당근마켓 중고거래 신뢰도 평점 위젯,
  Roam 도메인과 무관.
- **Quantity Picker** — 수량 증감 UI, Roam엔 해당 시나리오 없음.
- **Attachment Input**(전용 컴포넌트로) — Roam은 이미 `NotePhotos` 등 사진 첨부
  전용 UI가 있어 범용 첨부 컴포넌트로 대체할 실익이 당장은 낮음.
- Bottom/Top/Side Navigation — Roam은 이미 `AppBar`·`AdminSidebar`·`AdminTopNav`
  로 각 용도에 맞게 만들어져 있어 SEED 이름의 범용 버전으로 다시 감쌀 필요는
  낮음(형태 정합만 1단계 토큰으로 자연히 따라옴).

---

## 진행 상태

- [x] 1단계 스펙 작성·확인
- [ ] 1단계 구현 계획(writing-plans) → 구현
- [ ] 2단계 스펙 (착수 시 작성)
- [ ] 3단계 스펙 (착수 시 작성, 우선순위 재확인)
