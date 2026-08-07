# SEED 디자인 시스템 정렬 3단계 계속 — Progress Circle · Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Progress Circle·Menu 컴포넌트를 새로 만든다. Progress Circle은
`companion-bar.tsx`의 취향 정확도 알약에 실제로 연결하고, Menu는 아직 실사용처가 없어
`/admin/design-system` 데모로 검증한다.

**Architecture:** `Menu`는 `Sheet`/`AlertDialog`와 같은 패턴으로 새 Radix 프리미티브
(`@radix-ui/react-dropdown-menu`)를 감싼다. `ProgressCircle`은 새 의존성 없이 순수 SVG +
Tailwind로 구현한다. 둘 다 `src/components/ui/`에 추가하고 1·2단계 토큰만 쓴다.

## Global Constraints

- Progress Circle의 tone은 `neutral`/`brand`만 — SEED의 static-white/custom은 소비처
  없어 스코프 밖.
- indeterminate 모드는 Tailwind 내장 `animate-spin` 재사용 — 새 모션 토큰 안 만듦.
- Menu는 지금 실사용처 없음 — `/admin/design-system` 데모로만 검증, 다른 화면에
  연결하지 않는다.
- `companion-bar.tsx`의 `tastePct` 알약도 이번에 `Chip`으로 함께 정리한다(3단계가
  놓친 5번째 칩 중복).
- Roam은 라이트 모드만 지원 — 다크모드 검증 불필요.

---

### Task 1: Progress Circle + `tastePct` 알약 정리

**Files:**
- Create: `src/components/ui/progress-circle.tsx`
- Modify: `src/components/companion/companion-bar.tsx`

**Interfaces:**
- Produces: `ProgressCircle({ size?: 24 | 40, value?: number, indeterminate?: boolean, tone?: "neutral" | "brand", className?: string })` — `src/components/ui/progress-circle.tsx`에서 export. `size` 기본 24, `tone` 기본 `neutral`.
- Consumes: `Chip`(`src/components/ui/chip.tsx`, 이미 존재 — `icon` prop으로 prefix 슬롯 지원함).

- [ ] **Step 1: `src/components/ui/progress-circle.tsx` 신규 작성**

```tsx
import { cn } from "@/lib/utils";

export interface ProgressCircleProps {
  /** 40 = 두께 5px(풀페이지용), 24 = 두께 3px(요소 단위용). 기본 24. */
  size?: 24 | 40;
  /** 0~100. indeterminate가 true면 무시됨. */
  value?: number;
  /** true면 value 무시하고 회전 스피너로 표시. */
  indeterminate?: boolean;
  tone?: "neutral" | "brand";
  className?: string;
}

export function ProgressCircle({
  size = 24,
  value = 0,
  indeterminate = false,
  tone = "neutral",
  className,
}: ProgressCircleProps) {
  const strokeWidth = size === 40 ? 5 : 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, value));
  const offset = circumference * (1 - clamped / 100);
  const color = tone === "brand" ? "var(--primary)" : "var(--muted-foreground)";
  const center = size / 2;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={cn(indeterminate && "animate-spin", className)}
      role="progressbar"
      aria-valuenow={indeterminate ? undefined : clamped}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke="var(--border)"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={center}
        cy={center}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={
          indeterminate ? `${circumference * 0.25} ${circumference}` : circumference
        }
        strokeDashoffset={indeterminate ? 0 : offset}
        transform={`rotate(-90 ${center} ${center})`}
      />
    </svg>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/components/ui/progress-circle.tsx`
Expected: 에러 없음.

- [ ] **Step 3: `companion-bar.tsx`의 취향 정확도 알약을 `Chip` + `ProgressCircle`로 교체**

`src/components/companion/companion-bar.tsx`, import 블록(16행 `} from "@/components/ui/sheet";` 다음)에 추가:

```tsx
import { Chip } from "@/components/ui/chip";
import { ProgressCircle } from "@/components/ui/progress-circle";
```

취향 알약, 기존:
```tsx
          {isExhibitionHome && home && tastePct !== null && (
            <span className="shrink-0 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
              {t("companion.tastePct", { pct: tastePct })}
            </span>
          )}
```

교체:
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

(문구·조건은 그대로 — UI만 교체.)

- [ ] **Step 4: 빌드 + 회귀 확인**

Run: `npx tsc --noEmit && npx eslint src/components/companion/companion-bar.tsx`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과.

- [ ] **Step 5: 수동 확인 (라이트 모드만)**

`npm run dev`(mock 모드) 후 로그인 → 아무 전시 홈에서 부스에 5개 이상 반응해
`tastePct`가 채워지면(판정 5개 미만이면 알약 자체가 안 뜨니, 반응을 충분히 남겨야
함) 하단 컴패니언 바에 원형 게이지 + "취향 N%" 텍스트가 함께 뜨는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/components/ui/progress-circle.tsx src/components/companion/companion-bar.tsx
git commit -m "feat(ui): Progress Circle 추가 — 컴패니언 바 취향 정확도 알약에 연결, Chip으로 정리"
```

---

### Task 2: Menu

**Files:**
- Create: `src/components/ui/menu.tsx`
- Modify: `package.json` (dependencies)

**Interfaces:**
- Produces: `Menu`(Root)/`MenuTrigger`/`MenuContent`/`MenuGroup`/`MenuGroupLabel`/
  `MenuItem`(`variant?: "default" | "destructive"`, `icon?: React.ReactNode`)/
  `MenuSeparator` — `src/components/ui/menu.tsx`에서 export.

- [ ] **Step 1: `@radix-ui/react-dropdown-menu` 설치**

`package.json`의 `dependencies`에 알파벳 순서로 추가(`@radix-ui/react-dialog`와
`@radix-ui/react-label` 사이):

```json
    "@radix-ui/react-dropdown-menu": "^2.1.24",
```

Run: `npm install`

- [ ] **Step 2: `src/components/ui/menu.tsx` 신규 작성**

```tsx
"use client";

import * as React from "react";
import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import { cn } from "@/lib/utils";

const Menu = DropdownMenuPrimitive.Root;
const MenuTrigger = DropdownMenuPrimitive.Trigger;

const MenuContent = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(({ className, sideOffset = 8, ...props }, ref) => (
  <DropdownMenuPrimitive.Portal>
    <DropdownMenuPrimitive.Content
      ref={ref}
      sideOffset={sideOffset}
      className={cn(
        "z-50 max-h-[480px] min-w-[10rem] overflow-y-auto rounded-lg border border-border bg-card p-1 shadow-[var(--shadow-pop)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </DropdownMenuPrimitive.Portal>
));
MenuContent.displayName = "MenuContent";

const MenuGroup = DropdownMenuPrimitive.Group;

function MenuGroupLabel({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("px-2 py-1.5 text-xs font-semibold text-muted-foreground", className)}
      {...props}
    />
  );
}

const MenuItem = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & {
    variant?: "default" | "destructive";
    icon?: React.ReactNode;
  }
>(({ className, variant = "default", icon, children, ...props }, ref) => (
  <DropdownMenuPrimitive.Item
    ref={ref}
    className={cn(
      "flex cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm font-medium outline-none transition-colors focus:bg-secondary data-[disabled]:pointer-events-none data-[disabled]:opacity-40",
      variant === "destructive" ? "text-destructive focus:bg-destructive/10" : "text-foreground",
      className,
    )}
    {...props}
  >
    {icon}
    {children}
  </DropdownMenuPrimitive.Item>
));
MenuItem.displayName = "MenuItem";

const MenuSeparator = React.forwardRef<
  React.ElementRef<typeof DropdownMenuPrimitive.Separator>,
  React.ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(({ className, ...props }, ref) => (
  <DropdownMenuPrimitive.Separator ref={ref} className={cn("my-1 h-px bg-border", className)} {...props} />
));
MenuSeparator.displayName = "MenuSeparator";

export { Menu, MenuTrigger, MenuContent, MenuGroup, MenuGroupLabel, MenuItem, MenuSeparator };
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/components/ui/menu.tsx`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과(이 파일은 아직 아무 데도 안 쓰여 회귀 위험 없음).

- [ ] **Step 4: 커밋**

```bash
git add package.json package-lock.json src/components/ui/menu.tsx
git commit -m "feat(ui): Menu 컴포넌트 추가 — 아직 소비처 없음, 관리자 타임라인에서 쓸 예정"
```

---

### Task 3: `/admin/design-system` 데모 섹션 추가

**Files:**
- Create: `src/components/admin/design-system/progress-circle-demo.tsx`
- Create: `src/components/admin/design-system/menu-demo.tsx`
- Modify: `src/app/admin/design-system/page.tsx`

**Interfaces:**
- Consumes: `ProgressCircle`(Task 1), `Menu`/`MenuTrigger`/`MenuContent`/`MenuItem`/`MenuSeparator`(Task 2), `AdminSection`(기존), `Button`(기존).

- [ ] **Step 1: `src/components/admin/design-system/progress-circle-demo.tsx` 신규 작성**

```tsx
"use client";

import { useState } from "react";
import { ProgressCircle } from "@/components/ui/progress-circle";

export function ProgressCircleDemo() {
  const [value, setValue] = useState(60);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-8">
        <div className="flex flex-col items-center gap-2">
          <ProgressCircle size={40} value={value} tone="brand" />
          <p className="text-xs text-muted-foreground">size 40 · determinate</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ProgressCircle size={24} value={value} tone="neutral" />
          <p className="text-xs text-muted-foreground">size 24 · determinate</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ProgressCircle size={40} indeterminate tone="brand" />
          <p className="text-xs text-muted-foreground">size 40 · indeterminate</p>
        </div>
        <div className="flex flex-col items-center gap-2">
          <ProgressCircle size={24} indeterminate tone="neutral" />
          <p className="text-xs text-muted-foreground">size 24 · indeterminate</p>
        </div>
      </div>
      <label className="flex items-center gap-3 text-sm">
        <span className="w-16 shrink-0 font-semibold">{value}%</span>
        <input
          type="range"
          min={0}
          max={100}
          value={value}
          onChange={(e) => setValue(Number(e.target.value))}
          className="w-full"
        />
      </label>
    </div>
  );
}
```

- [ ] **Step 2: `src/components/admin/design-system/menu-demo.tsx` 신규 작성**

```tsx
"use client";

import { Copy, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Menu,
  MenuContent,
  MenuItem,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu";

export function MenuDemo() {
  return (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="outline" size="sm">
          메뉴 열기
        </Button>
      </MenuTrigger>
      <MenuContent>
        <MenuItem icon={<Pencil className="size-4" />}>수정</MenuItem>
        <MenuItem icon={<Copy className="size-4" />}>복제</MenuItem>
        <MenuSeparator />
        <MenuItem variant="destructive" icon={<Trash2 className="size-4" />}>
          삭제
        </MenuItem>
      </MenuContent>
    </Menu>
  );
}
```

- [ ] **Step 3: `/admin/design-system/page.tsx`에 두 섹션 추가**

`src/app/admin/design-system/page.tsx`, import 블록(2행 `MotionDemo` import 다음)에 추가:

```tsx
import { ProgressCircleDemo } from "@/components/admin/design-system/progress-circle-demo";
import { MenuDemo } from "@/components/admin/design-system/menu-demo";
```

모션 섹션(`<AdminSection title="모션(Motion)" ...>...</AdminSection>`) 바로 다음,
`</div>`(최상위 컨테이너 닫는 태그) 앞에 추가:

```tsx
      <AdminSection
        title="Progress Circle"
        description="size 24/40 · determinate/indeterminate · neutral/brand"
      >
        <ProgressCircleDemo />
      </AdminSection>

      <AdminSection
        title="Menu"
        description="아직 실사용처 없음 — 관리자 타임라인에서 쓸 예정, 여기서만 검증"
      >
        <MenuDemo />
      </AdminSection>
```

- [ ] **Step 4: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/components/admin/design-system/progress-circle-demo.tsx src/components/admin/design-system/menu-demo.tsx src/app/admin/design-system/page.tsx`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과.

- [ ] **Step 5: 수동 확인 (라이트 모드만)**

`npm run dev` 후 `/admin/design-system`에서 새 두 섹션이 보이는지 — Progress Circle
슬라이더를 움직이면 두 원(40px·24px)이 실시간으로 채워지는지, indeterminate 원 2개가
계속 도는지, Menu 섹션의 "메뉴 열기" 버튼을 누르면 4항목(수정/복제/구분선/삭제) 메뉴가
뜨고 삭제 항목이 빨갛게 보이는지, 항목 밖을 클릭하면 닫히는지 확인.

- [ ] **Step 6: 커밋**

```bash
git add src/components/admin/design-system/progress-circle-demo.tsx src/components/admin/design-system/menu-demo.tsx src/app/admin/design-system/page.tsx
git commit -m "feat(admin): 디자인 시스템 페이지에 Progress Circle·Menu 데모 섹션 추가"
```

---

## 최종 검증 (전체 태스크 완료 후)

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/ui/progress-circle.tsx src/components/ui/menu.tsx src/components/companion/companion-bar.tsx src/components/admin/design-system/progress-circle-demo.tsx src/components/admin/design-system/menu-demo.tsx src/app/admin/design-system/page.tsx
```

브라우저로 컴패니언 바(취향 정확도 알약, 반응 5개 이상 남긴 상태)와
`/admin/design-system`(Progress Circle·Menu 두 섹션)을 라이트 모드로 한 번씩 훑어
최종 확인.
