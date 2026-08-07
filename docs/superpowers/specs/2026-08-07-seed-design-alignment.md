# SEED 디자인 토큰 정렬 — 1단계(토큰 뼈대 + /admin/design-system) Design

**Goal:** 색(인디고 브랜드)은 그대로 두고, 폰트는 Inter→Pretendard로 바꾸고(한글
글리프가 없는 Inter는 지금 한국어 텍스트에 전혀 적용 안 되고 OS 기본 폰트로 조용히
폴백되고 있었다 — 사실상 "우리 폰트"가 없던 상태), 나머지 디자인 토큰
체계(간격·radius·그림자·모션·타이포 위계·레이아웃 브레이크포인트)를 카카오모빌리티가
아니라 당근마켓(Karrot)의 SEED 디자인 시스템(seed-design.io) 값으로 맞춘다. 관리자
콘솔에 `/admin/design-system` 페이지를 새로 만들어, SEED 사이트 자체의 문서 구성
방식(사이드바 카테고리 + 페이지 내 목차 + 스와치/실제 예시 + 스펙 표)을 그대로 본떠
Roam이 가진 모든 디자인 토큰(색 포함)을 한눈에 보여준다.

**Architecture:** `pretendard` 패키지를 설치하고 `src/app/layout.tsx`의 폰트 로딩을
`next/font/google`(Inter)에서 `next/font/local`(Pretendard, 정적 400/500/700 woff2)로
교체한다. `globals.css`의 `@theme inline` 블록에 SEED 값으로 채운 새 CSS
커스텀 프로퍼티를 추가한다. 기존 Tailwind 시맨틱 이름(`--radius-sm/md/lg/xl/2xl`,
`--text-xs/sm/base/lg/xl/2xl/3xl`)은 대부분 SEED 스케일과 값이 정확히 일치해
**이름은 그대로 두고 값만 교체**한다 — 이렇게 하면 기존 컴포넌트 코드를 한 줄도
안 고쳐도 전체 앱이 즉시 새 토큰을 쓰게 된다. 모션은 CSS 변수와 함께 JS 상수 모듈도
둔다(`framer-motion`이 실제 숫자값을 요구하므로). `/admin/design-system`은 이 토큰들을
읽어 렌더하는 새 정적 페이지 하나로 시작한다.

## Global Constraints

- **색은 안 건드린다** — `globals.css`의 기존 `--primary`/`--secondary`/`--success`
  등 모든 색상 값은 그대로. `/admin/design-system`에도 SEED 색이 아니라 **Roam
  자체 팔레트**를 스와치로 보여준다.
- **폰트는 Pretendard로 교체** — `next/font/local`로 자체 호스팅(구글 폰트에 없음).
  크기·행간·굵기·이름 체계(위계)는 SEED `t1~t14` 스케일을 따른다.
- 기존 컴포넌트 코드(className)는 이번 스코프에서 **거의 안 건드린다** — 이름이
  같은 토큰은 값만 바꾸는 방식으로 자동 적용. 기존 코드가 새 토큰을 "제대로" 쓰도록
  정리하는 건 2단계(이번 스펙 밖).
- `/admin/design-system`은 새 페이지 1개 + 필요한 하위 표시 컴포넌트만 추가한다 —
  기존 `/admin` 레이아웃·사이드바 패턴(`AdminSidebar`, `AdminSection`, `Card`)을
  재사용한다, 새로 안 만든다.
- 레이아웃/그리드 브레이크포인트는 **관리자 콘솔에만** 적용한다 — 방문객 앱은
  의도적으로 고정 모바일 폭(`max-w-md`)이라 반응형으로 바꾸지 않는다(요청 밖).

---

## 섹션 A — 토큰 값 매핑

### A-0. 폰트 — Inter → Pretendard

`pretendard` npm 패키지(확인됨, 최신 1.3.9) 설치. 400/500/700 세 굵기만 쓰는
기존 관례(A-5)에 맞춰 정적 woff2 3개만 로드한다(가변 폰트 TTF는 6.7MB로
과함 — 정적 굵기별 woff2는 각 750~800KB, 한글 폰트 특성상 필요한 크기).

`src/app/layout.tsx` 기존:
```tsx
import { Inter } from "next/font/google";
// ...
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});
```

교체:
```tsx
import localFont from "next/font/local";
// ...
const pretendard = localFont({
  src: [
    {
      path: "../../node_modules/pretendard/dist/web/static/woff2/Pretendard-Regular.woff2",
      weight: "400",
    },
    {
      path: "../../node_modules/pretendard/dist/web/static/woff2/Pretendard-Medium.woff2",
      weight: "500",
    },
    {
      path: "../../node_modules/pretendard/dist/web/static/woff2/Pretendard-Bold.woff2",
      weight: "700",
    },
  ],
  variable: "--font-pretendard",
  display: "swap",
});
```

같은 파일 안 `className={\`${inter.variable} ...\`}`도 `${pretendard.variable}`로.

`globals.css`:
```css
--font-sans: var(--font-pretendard), ui-sans-serif, system-ui, -apple-system, sans-serif;
```

### A-1. Spacing (신규 — 지금 토큰 자체가 없음)

`globals.css` `@theme inline`에 원시 스케일 + 의미 토큰을 추가:

```css
/* raw scale (SEED $dimension.x*) */
--spacing-x0-5: 0.125rem; /* 2px */
--spacing-x1: 0.25rem;    /* 4px */
--spacing-x1-5: 0.375rem; /* 6px */
--spacing-x2: 0.5rem;     /* 8px */
--spacing-x2-5: 0.625rem; /* 10px */
--spacing-x3: 0.75rem;    /* 12px */
--spacing-x3-5: 0.875rem; /* 14px */
--spacing-x4: 1rem;       /* 16px */
--spacing-x4-5: 1.125rem; /* 18px */
--spacing-x5: 1.25rem;    /* 20px */
--spacing-x6: 1.5rem;     /* 24px */
--spacing-x7: 1.75rem;    /* 28px */
--spacing-x8: 2rem;       /* 32px */
--spacing-x9: 2.25rem;    /* 36px */
--spacing-x10: 2.5rem;    /* 40px */
--spacing-x12: 3rem;      /* 48px */
--spacing-x13: 3.25rem;   /* 52px */
--spacing-x14: 3.5rem;    /* 56px */
--spacing-x16: 4rem;      /* 64px */

/* semantic (SEED 문서가 명시한 용도) */
--spacing-global-gutter: var(--spacing-x4);      /* 16px — 화면 좌우 기본 여백 */
--spacing-component-default: var(--spacing-x3);  /* 12px — 컴포넌트 간 기본 세로 간격 */
--spacing-nav-to-title: var(--spacing-x5);       /* 20px — 상단바~타이틀 */
--spacing-screen-bottom: var(--spacing-x14);     /* 56px — 화면 하단 여백 */
--spacing-between-text: var(--spacing-x1-5);     /* 6px — 텍스트 요소 간 */
--spacing-between-chips: var(--spacing-x2);      /* 8px — 칩 간 가로 간격 */
```

새 이름이라 기존 `px-4`/`gap-3` 같은 Tailwind 기본 유틸은 그대로 동작한다(안 깨짐).
이 토큰들은 **새로 짜는 코드**(2·3단계, `/admin/design-system` 자체)부터 쓰기
시작한다.

### A-2. Radius (기존 이름 유지, 값만 SEED로 교체)

`globals.css` 기존:
```css
--radius-sm: calc(var(--radius) - 6px);   /* 8px */
--radius-md: calc(var(--radius) - 3px);   /* 11px */
--radius-lg: var(--radius);               /* 14px */
--radius-xl: calc(var(--radius) + 6px);   /* 20px */
--radius-2xl: calc(var(--radius) + 12px); /* 26px */
```

교체(SEED `r`-스케일, sm·lg·xl은 정확히 일치, md·2xl은 가장 가까운 값):
```css
--radius-sm: 0.5rem;   /* 8px  = r2 (정확히 일치) */
--radius-md: 0.75rem;  /* 12px = r3 (기존 11px에서 반올림) */
--radius-lg: 0.875rem; /* 14px = r3_5 (정확히 일치) */
--radius-xl: 1.25rem;  /* 20px = r5 (정확히 일치) */
--radius-2xl: 1.5rem;  /* 24px = r6 (기존 26px에서 반올림) */

/* SEED 전체 스케일(더 세밀한 값이 필요할 때, 신규 컴포넌트용) */
--radius-r0-5: 0.125rem; /* 2px */
--radius-r1: 0.25rem;    /* 4px */
--radius-r1-5: 0.375rem; /* 6px */
--radius-r2-5: 0.625rem; /* 10px */
--radius-full: 9999px;
```

`rounded-sm`/`rounded-md`/`rounded-lg`/`rounded-xl`/`rounded-2xl`를 쓰는 기존
컴포넌트는 코드 변경 없이 새 값을 자동으로 받는다.

### A-3. Shadow (기존 이름 유지, SEED s1/s2/s3로 매핑)

`globals.css` 기존:
```css
--shadow-card: 0 1px 2px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.05);
--shadow-sheet: 0 -2px 24px rgba(0, 0, 0, 0.10);
--shadow-pop: 0 8px 28px rgba(0, 0, 0, 0.12);
```

교체 — `card`는 가장 옅은 s1(평상시 카드), `pop`은 가장 진한 s3(팝오버·강조),
`sheet`는 s2 정도의 세기이되 **방향은 유지**(바텀시트는 위로 뜨는 그림자라 SEED의
방향 없는 값을 그대로 못 씀 — 세기만 s2 기준으로):
```css
--shadow-card: 0px 1px 4px 0px rgba(0, 0, 0, 0.08); /* s1 */
--shadow-sheet: 0 -2px 10px rgba(0, 0, 0, 0.10);    /* s2 세기, 방향은 위로 유지 */
--shadow-pop: 0px 4px 16px 0px rgba(0, 0, 0, 0.12); /* s3 */
```

### A-4. Motion (신규 — 지금 토큰 없음, `duration-150/200/300/500`이 기준 없이 혼재)

`globals.css`에 CSS 변수 추가:
```css
/* durations */
--motion-d1: 50ms;
--motion-d2: 100ms;
--motion-d3: 150ms;
--motion-d4: 200ms;
--motion-d5: 250ms;
--motion-d6: 300ms;
--motion-color-transition: var(--motion-d3);
--motion-pressed-scale: var(--motion-d3);

/* easings */
--motion-ease-linear: cubic-bezier(0, 0, 1, 1);   /* 등속 — 스피너·진행바처럼 반복 재생되는 움직임용 */
--motion-ease-functional: cubic-bezier(0.35, 0, 0.35, 1);
--motion-ease-enter: cubic-bezier(0, 0, 0.15, 1);
--motion-ease-exit: cubic-bezier(0.35, 0, 1, 1);
--motion-ease-enter-expressive: cubic-bezier(0.03, 0.4, 0.1, 1);
--motion-ease-exit-expressive: cubic-bezier(0.35, 0, 0.95, 0.55);
```

같은 값을 JS(framer-motion)에서도 쓸 수 있게 `src/lib/motion.ts` 신규:
```ts
// SEED 모션 토큰의 JS 판본 — framer-motion의 transition prop은 CSS 변수를 직접
// 못 읽어서(문자열 대입이 아니라 숫자 필요) 여기 원본 값을 그대로 복제해 둔다.
// globals.css의 --motion-* 값과 반드시 같이 바꿀 것.
export const MOTION_DURATION = {
  d1: 0.05, d2: 0.1, d3: 0.15, d4: 0.2, d5: 0.25, d6: 0.3,
} as const;

export const MOTION_EASE = {
  linear: [0, 0, 1, 1],
  functional: [0.35, 0, 0.35, 1],
  enter: [0, 0, 0.15, 1],
  exit: [0.35, 0, 1, 1],
  enterExpressive: [0.03, 0.4, 0.1, 1],
  exitExpressive: [0.35, 0, 0.95, 0.55],
} as const;
```

기존 `duration-150`류 Tailwind 유틸은 이번엔 안 건드린다(2단계에서 정리) — 새 변수는
`/admin/design-system` 페이지의 모션 데모와, 앞으로 새로 짜는 코드부터 적용.

### A-5. Typography (폰트는 Pretendard로 교체(A-0), 크기·행간·이름 체계는 SEED)

실사용 조사 결과 Tailwind 기본 스텝 7개(`xs/sm/base/lg/xl/2xl/3xl`)만 쓰이고
있고(230회 중 219회가 xs~2xl), SEED `t`-스케일과 대부분 정확히 일치한다. Tailwind
자체 타이포 변수를 덮어써서 기존 컴포넌트 코드 변경 없이 적용:

```css
--text-xs: 0.75rem;    /* 12px = t2 */  --text-xs--line-height: 1rem;      /* 16px */
--text-sm: 0.875rem;   /* 14px = t4 */  --text-sm--line-height: 1.25rem;   /* 20px */
--text-base: 1rem;     /* 16px = t5 */  --text-base--line-height: 1.5rem;  /* 24px */
--text-lg: 1.125rem;   /* 18px = t6 */  --text-lg--line-height: 1.625rem;  /* 26px */
--text-xl: 1.25rem;    /* 20px = t7 */  --text-xl--line-height: 1.75rem;   /* 28px */
--text-2xl: 1.5rem;    /* 24px = t9 */  --text-2xl--line-height: 2rem;     /* 32px */
--text-3xl: 1.75rem;   /* 28px = t11(가장 가까운 값, 기존 30px에서 반올림) */
```

굵기는 SEED와 동일하게 400/500/700 세 단만 쓰는 게 이미 Roam 코드 관례라
(`font-medium`/`font-bold`/`font-extrabold` 위주) 손 안 댐 — `/admin/design-system`
문서에 "400/500/700만 쓴다"는 규칙으로 명시만 한다.

---

## 섹션 B — `/admin/design-system` 페이지

**위치**: `/admin/design-system`, `AdminSidebar`의 `ITEMS` 배열에 항목 추가(기존
"분석" 옆). 레이아웃은 `AdminLayout`을 그대로 상속(새 레이아웃 안 만듦).

**구성** — SEED 문서 페이지 형식을 본떠, 페이지 안에서 좌측 카테고리 앵커 + 섹션별
스와치/실제 예시 + 스펙 표:

1. **색(Color)** — Roam 팔레트(라이트/다크 각각) 스와치. `--primary`부터
   `--booth-skipped` 계열 상태색까지 전부. 각 스와치에 변수명 + hex 값 표시.
2. **타이포(Typography)** — `text-xs`~`text-3xl` 실제 텍스트 샘플(Pretendard로 렌더,
   한글·영문·숫자 예시 문구 같이) + 각 단계의 px/rem/line-height 표. 400/500/700
   굵기 3종 나란히.
3. **간격(Spacing)** — `x0_5`~`x16` 각 값을 실제 폭의 색칠된 바(bar)로 시각화 +
   의미 토�큰(`global-gutter` 등) 표.
4. **Radius** — 각 단계를 실제 둥근 사각형 스와치로.
5. **그림자(Shadow)** — `card`/`sheet`/`pop` 각각 실제 카드에 그림자 적용해서 보여줌
   (라이트/다크 배경 위 둘 다).
6. **모션(Motion)** — 버튼을 눌러 각 duration/easing 조합을 실제로 재생해보는
   인터랙티브 데모(정적 표가 아니라 실제 움직임 — "사이트 수준"의 핵심은 여기).

각 섹션은 `AdminSection`(기존 컴포넌트) 안에 담는다 — 새 섹션 래퍼를 안 만든다.

## 에러 처리 / 엣지 케이스

- 이 페이지는 정적 토큰 표시라 데이터 조회 실패 시나리오가 없다(DB 안 씀).
- 다크모드 토글은 기존 `ThemeToggle`(admin-nav.tsx에 이미 있음)을 그대로 쓴다 —
  색·그림자 섹션은 다크모드에서 실제로 다르게 보이므로 검증에 유용.

## 테스트

- `npx tsc --noEmit`, `npx eslint` — 새 페이지는 정적 렌더라 단위 테스트 대상 로직이
  거의 없음(순수 표시).
- 수동 확인: `/admin/design-system`에서 각 섹션이 실제 Roam 값을 정확히 보여주는지,
  라이트/다크 둘 다.
- 회귀 확인: radius/shadow/typography 값 교체 후 `npx vitest run` — 기존 스냅샷·
  UI 테스트가 있다면(현재는 없음, 확인만) 깨지지 않는지.
