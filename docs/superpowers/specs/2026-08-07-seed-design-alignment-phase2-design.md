# SEED 디자인 토큰 정렬 2단계 — 여백·모션 토큰화 Design

**Goal:** 1단계에서 만든 새 토큰(`--spacing-global-gutter`, `--motion-d*`)을 기존 컴포넌트가
숫자만 우연히 맞추는 게 아니라 실제로 참조하도록 코드를 바꾼다. 화면 좌우 여백을 16px로
통일하고, transition duration을 SEED 모션 스케일로 교체한다.

**Architecture:** 1단계는 이름이 같은 Tailwind 네이티브 토큰(radius/shadow/typography)의
*값*만 바꿔 기존 코드가 무변경으로 새 값을 받도록 했다. 이번 2단계가 다루는 spacing/motion은
애초에 Tailwind 네임스페이스 밖(`:root`, `@theme inline` 아님)에 뒀기 때문에 그 방식이 안
통한다 — 컴포넌트마다 클래스 자체를 `px-[var(--spacing-global-gutter)]`,
`duration-[var(--motion-d6)]`처럼 Tailwind v4의 임의값(arbitrary value) 문법으로 직접
바꿔야 한다. 새 백엔드·새 컴포넌트 없음, 전부 기존 파일의 className 교체.

## Global Constraints

- 값을 우연히 맞추는 숫자 클래스(`px-4`, `duration-300`)가 아니라 반드시 `var(--토큰명)`을
  참조하는 임의값 클래스로 바꾼다 — 나중에 토큰 값이 바뀌어도 자동 반영되게.
- easing 클래스(`ease-out`, `ease-in-out` 등)는 이번 스코프 밖 — duration만 다룬다. easing을
  SEED 스케일로 바꾸려면 각 전환이 enter/exit/functional 중 무엇인지 새로 판단해야 해서
  훨씬 큰 작업이고, 로드맵 문서에도 2단계 항목으로 없었다.
- 그림자(`shadow-[...]`) 항목은 로드맵에 있었지만 실사용 조사 결과 전부 이미
  `shadow-[var(--shadow-card)]` 같은 형태로 토큰을 쓰고 있어 할 일이 없다 — 이번 스코프에서 제외.
- **Roam은 라이트 모드만 지원한다** — 다크모드 검증은 하지 않는다(기존 `.dark` CSS·
  `ThemeToggle`은 남아있지만 이번 작업의 수동 확인 대상 아님).
- 관리자 콘솔의 반응형 여백(`md:px-8`)은 1단계에서 정한 "브레이크포인트는 관리자 전용"
  원칙 그대로 유지 — 모바일 기준값만 토큰화하고 데스크톱 확장은 손대지 않는다.

---

## 섹션 A — 화면 좌우 여백 16px 통일

실사용 조사: `(visitor)/layout.tsx`엔 공통 좌우 패딩이 없어 각 화면이 각자 정한다. 홈
화면은 `px-4`(16px)로 일관, 전시·부스 상세는 `px-5`(20px)로 일관 — 화면 간 불일치.
16px(SEED 권장 기본값, 1단계에 정의된 `--spacing-global-gutter`)로 통일한다.

**변경 대상 (8곳, 전부 `px-[var(--spacing-global-gutter)]`로 교체):**

| 파일 | 위치 | 기존 |
|---|---|---|
| `src/app/(visitor)/page.tsx:64` | 헤더 | `px-4` |
| `src/app/(visitor)/page.tsx:97` | 검색바 wrapper | `px-4` |
| `src/app/(visitor)/page.tsx:115` | 메인 섹션 | `px-4` |
| `src/app/(visitor)/exhibitions/[slug]/page.tsx:143` | 콘텐츠 wrapper | `px-5` |
| `src/app/(visitor)/booths/[id]/page.tsx:101` | 섹션 | `px-5` |
| `src/app/(visitor)/booths/[id]/page.tsx:106` | 섹션 | `px-5` |
| `src/app/(visitor)/booths/[id]/page.tsx:125` | 섹션 | `px-5` |
| `src/app/admin/layout.tsx:21` | `main` 기준값(모바일)만, `md:px-8`은 유지 | `px-4 ... md:px-8` |

지도(`map/page.tsx`)·메모장(`notes/page.tsx`)·커뮤니티(`community/page.tsx`) 페이지는
자체 wrapper 없이 하위 컴포넌트에 위임하는 구조라(page.tsx 자체엔 className이 없음)
이번 스코프 밖 — 별도 여백 개념이 없거나(지도는 풀블리드) 컴포넌트 내부 문제.

## 섹션 B — 모션 duration 토큰화

Tailwind v4는 radius/text와 달리 `duration-*`를 테마 네임스페이스로 갖지 않는다
(`node_modules/tailwindcss/theme.css`에 `--default-transition-duration`만 있고 enumerable
스케일이 없음 — 확인됨). 그래서 1단계처럼 "이름 유지, 값만 교체"가 안 되고 클래스 자체를
바꿔야 한다.

실사용 조사: 전체 7곳 중 6곳이 SEED 스케일과 정확히 일치(150→d3, 200→d4, 300×4→d6).
`duration-500`(온보딩 진행바) 하나만 대응 단계가 없어 d6(300ms)로 내림 — 진행바가 조금
빨라지지만 시각적으로 거의 차이 없음.

**변경 대상 (4개 파일, 7곳):**

| 파일 | 기존 | 교체 후 | 비고 |
|---|---|---|---|
| `src/components/ui/button.tsx` | `duration-150` | `duration-[var(--motion-pressed-scale)]` | 눌림 효과라 범용 d3 대신 의미가 맞는 별칭 사용 |
| `src/components/ui/sheet.tsx` | `duration-200`(닫힘) | `duration-[var(--motion-d4)]` | |
| `src/components/ui/sheet.tsx` | `duration-300`(열림) | `duration-[var(--motion-d6)]` | |
| `src/components/ui/progress.tsx` | `duration-300` | `duration-[var(--motion-d6)]` | |
| `src/components/onboarding/conversation.tsx` | `duration-300` × 2곳 | `duration-[var(--motion-d6)]` | |
| `src/components/onboarding/conversation.tsx` | `duration-500`(진행바) | `duration-[var(--motion-d6)]` | 대응 단계 없어 d6로 내림, 확정 |

---

## 에러 처리 / 엣지 케이스

전부 CSS 클래스 값 교체라 런타임 실패 시나리오가 없다. 여백이 최대 4px 좁아지는 화면
(전시·부스 상세)에서 텍스트 줄바꿈 위치가 미세하게 바뀔 수 있음 — 수동 확인 대상.

## 테스트

- 로직 없는 순수 클래스 교체라 단위 테스트 대상 코드 없음.
- `npx tsc --noEmit`, `npx eslint <변경 파일>`, `npx vitest run` — 회귀 확인.
- 수동 확인(라이트 모드만 — Roam은 다크모드 미지원): 여백 8곳이 실제로 16px로 맞춰졌는지,
  모션 4개 파일(버튼 눌림·시트 열림/닫힘·진행바·온보딩 진행바)이 실제로 재생 시 자연스러운지.
