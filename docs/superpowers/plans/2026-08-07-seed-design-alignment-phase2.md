# SEED 디자인 토큰 정렬 2단계 — 여백·모션 토큰화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 1단계에서 만든 `--spacing-global-gutter`(16px)와 `--motion-d*` 토큰을, 우연히
같은 숫자를 쓰던 기존 컴포넌트가 실제로 `var()`로 참조하도록 className을 바꾼다.

**Architecture:** Tailwind v4의 임의값(arbitrary value) 문법 `px-[var(--토큰명)]`,
`duration-[var(--토큰명)]`으로 기존 숫자 클래스(`px-4`/`px-5`, `duration-150`~`500`)를
교체한다. 새 파일·새 로직 없음 — 순수 className 값 교체.

## Global Constraints

- 값을 우연히 맞추는 숫자 클래스가 아니라 반드시 `var(--토큰명)`을 참조하는 임의값
  클래스로 바꾼다.
- easing 클래스(`ease-out`, `ease-in-out`)는 이번 스코프 밖 — duration만 다룬다.
- 그림자(`shadow-[...]`)는 이미 전부 토큰화되어 있어 손대지 않는다.
- **Roam은 라이트 모드만 지원한다** — 수동 확인은 라이트 모드만, 다크모드 검증 불필요.
- 관리자 콘솔의 `md:px-8`(데스크톱 확장)은 그대로 유지 — 모바일 기준값만 토큰화한다.

---

### Task 1: 화면 좌우 여백 16px 토큰화

**Files:**
- Modify: `src/app/(visitor)/page.tsx` (3곳)
- Modify: `src/app/(visitor)/exhibitions/[slug]/page.tsx:143`
- Modify: `src/app/(visitor)/booths/[id]/page.tsx` (3곳)
- Modify: `src/app/admin/layout.tsx:21`

**Interfaces:**
- Consumes: `--spacing-global-gutter`(1단계에서 이미 `src/app/globals.css`의 `:root`에
  정의됨, 값 16px). 이 태스크는 그 변수를 처음으로 코드에서 참조한다.

- [ ] **Step 1: `src/app/(visitor)/page.tsx`의 3곳 교체**

기존(64행):
```tsx
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-4 pt-safe backdrop-blur-xl">
```
교체:
```tsx
      <header className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-border bg-background/80 px-[var(--spacing-global-gutter)] pt-safe backdrop-blur-xl">
```

기존(97행):
```tsx
        <div className="px-4 pb-2">
```
교체:
```tsx
        <div className="px-[var(--spacing-global-gutter)] pb-2">
```

기존(115행):
```tsx
      <section className="space-y-3 px-4 pb-6 pt-2">
```
교체:
```tsx
      <section className="space-y-3 px-[var(--spacing-global-gutter)] pb-6 pt-2">
```

- [ ] **Step 2: `src/app/(visitor)/exhibitions/[slug]/page.tsx:143` 교체**

기존:
```tsx
        <div className="space-y-4 px-5 pt-5 pb-28 landscape:w-[420px] landscape:shrink-0 landscape:self-stretch landscape:overflow-y-auto landscape:border-l landscape:border-border">
```
교체:
```tsx
        <div className="space-y-4 px-[var(--spacing-global-gutter)] pt-5 pb-28 landscape:w-[420px] landscape:shrink-0 landscape:self-stretch landscape:overflow-y-auto landscape:border-l landscape:border-border">
```

- [ ] **Step 3: `src/app/(visitor)/booths/[id]/page.tsx`의 3곳 교체**

기존(101행):
```tsx
            <div className="px-5 pt-1 pb-2">
```
교체:
```tsx
            <div className="px-[var(--spacing-global-gutter)] pt-1 pb-2">
```

기존(106행):
```tsx
          <div className="px-5 py-2">
```
교체:
```tsx
          <div className="px-[var(--spacing-global-gutter)] py-2">
```

기존(125행):
```tsx
          <div className="px-5 py-2 landscape:py-4">
```
교체:
```tsx
          <div className="px-[var(--spacing-global-gutter)] py-2 landscape:py-4">
```

- [ ] **Step 4: `src/app/admin/layout.tsx:21` 교체 — 모바일 기준값만, `md:px-8`은 유지**

기존:
```tsx
          className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:px-8"
```
교체:
```tsx
          className="mx-auto w-full max-w-5xl flex-1 px-[var(--spacing-global-gutter)] py-6 md:px-8"
```

- [ ] **Step 5: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint "src/app/(visitor)/page.tsx" "src/app/(visitor)/exhibitions/[slug]/page.tsx" "src/app/(visitor)/booths/[id]/page.tsx" src/app/admin/layout.tsx`
Expected: 에러 없음.

- [ ] **Step 6: 수동 확인 (라이트 모드만)**

`npm run dev` 후 홈(`/`), 전시 상세, 부스 상세, 관리자(`/admin`) 화면을 열어 좌우 여백이
전부 16px로 맞춰졌는지(홈은 기존과 동일, 전시·부스 상세는 살짝 좁아짐), 텍스트 줄바꿈이
깨지지 않는지 확인. 관리자 화면은 데스크톱 너비에서 `md:px-8`(32px)이 그대로 적용되는지도
확인.

- [ ] **Step 7: 커밋**

```bash
git add "src/app/(visitor)/page.tsx" "src/app/(visitor)/exhibitions/[slug]/page.tsx" "src/app/(visitor)/booths/[id]/page.tsx" src/app/admin/layout.tsx
git commit -m "fix(design): 화면 좌우 여백을 --spacing-global-gutter(16px)로 통일"
```

---

### Task 2: 모션 duration 토큰화

**Files:**
- Modify: `src/components/ui/button.tsx:7`
- Modify: `src/components/ui/sheet.tsx:30`
- Modify: `src/components/ui/progress.tsx:17`
- Modify: `src/components/onboarding/conversation.tsx` (3곳)

**Interfaces:**
- Consumes: `--motion-pressed-scale`, `--motion-d4`, `--motion-d6`(전부 1단계에서 이미
  `src/app/globals.css`의 `:root`에 정의됨: `--motion-pressed-scale: var(--motion-d3)`
  즉 150ms, `--motion-d4: 200ms`, `--motion-d6: 300ms`).

- [ ] **Step 1: `src/components/ui/button.tsx:7` — 눌림 효과, 의미가 맞는 별칭 사용**

기존:
```tsx
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[background,color,box-shadow,transform] duration-150 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-[1.15em] [&_svg]:shrink-0 cursor-pointer select-none",
```
교체:
```tsx
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold transition-[background,color,box-shadow,transform] duration-[var(--motion-pressed-scale)] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-[1.15em] [&_svg]:shrink-0 cursor-pointer select-none",
```

- [ ] **Step 2: `src/components/ui/sheet.tsx:30` — 닫힘 d4, 열림 d6**

기존:
```tsx
  "fixed z-50 gap-4 bg-card shadow-[var(--shadow-sheet)] transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-200 data-[state=open]:duration-300",
```
교체:
```tsx
  "fixed z-50 gap-4 bg-card shadow-[var(--shadow-sheet)] transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-[var(--motion-d4)] data-[state=open]:duration-[var(--motion-d6)]",
```

- [ ] **Step 3: `src/components/ui/progress.tsx:17`**

기존:
```tsx
      className="h-full w-full flex-1 bg-primary transition-transform duration-300 ease-out"
```
교체:
```tsx
      className="h-full w-full flex-1 bg-primary transition-transform duration-[var(--motion-d6)] ease-out"
```

- [ ] **Step 4: `src/components/onboarding/conversation.tsx`의 3곳 — 진행바 500ms는 d6로 내림**

기존(83행, 진행바):
```tsx
              className="block h-full rounded-full bg-primary transition-all duration-500"
```
교체:
```tsx
              className="block h-full rounded-full bg-primary transition-all duration-[var(--motion-d6)]"
```

기존(98행):
```tsx
        className="animate-in fade-in slide-in-from-bottom-1 flex flex-1 flex-col items-center justify-center gap-5 text-center duration-300"
```
교체:
```tsx
        className="animate-in fade-in slide-in-from-bottom-1 flex flex-1 flex-col items-center justify-center gap-5 text-center duration-[var(--motion-d6)]"
```

기존(114행):
```tsx
        className="animate-in fade-in flex flex-col gap-2.5 pt-4 duration-300"
```
교체:
```tsx
        className="animate-in fade-in flex flex-col gap-2.5 pt-4 duration-[var(--motion-d6)]"
```

- [ ] **Step 5: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/components/ui/button.tsx src/components/ui/sheet.tsx src/components/ui/progress.tsx src/components/onboarding/conversation.tsx`
Expected: 에러 없음.

- [ ] **Step 6: 회귀 확인**

Run: `npx vitest run`
Expected: 전체 통과(이 파일들에 직접 의존하는 테스트가 있다면 특히 확인).

- [ ] **Step 7: 수동 확인 (라이트 모드만)**

`npm run dev` 후: 버튼을 눌러 살짝 눌림 효과가 자연스러운지, 바텀시트(예: 로그인 시트)를
열고 닫아 전환이 자연스러운지, 진행바(Progress 컴포넌트 쓰는 화면)가 부드럽게 차오르는지,
온보딩(`/` → 가치 온보딩 진입) 화면 전환과 진행바가 자연스러운지 확인.

- [ ] **Step 8: 커밋**

```bash
git add src/components/ui/button.tsx src/components/ui/sheet.tsx src/components/ui/progress.tsx src/components/onboarding/conversation.tsx
git commit -m "fix(design): transition duration을 SEED 모션 토큰(--motion-d*)으로 교체"
```

---

## 최종 검증 (전체 태스크 완료 후)

```bash
npx tsc --noEmit
npx vitest run
npx eslint "src/app/(visitor)/page.tsx" "src/app/(visitor)/exhibitions/[slug]/page.tsx" "src/app/(visitor)/booths/[id]/page.tsx" src/app/admin/layout.tsx src/components/ui/button.tsx src/components/ui/sheet.tsx src/components/ui/progress.tsx src/components/onboarding/conversation.tsx
```

브라우저로 홈·전시 상세·부스 상세·관리자 화면과 버튼·바텀시트·진행바·온보딩 전환을
라이트 모드로 한 번씩 훑어 최종 확인.
