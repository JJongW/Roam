# SEED 디자인 시스템 정렬 3단계 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 부족한 컴포넌트 3개(Alert Dialog·Chip·ImageLightbox)를 새로 만들고, 기존
중복·불일치 코드를 그걸로 대체한다.

**Architecture:** `Sheet`(`src/components/ui/sheet.tsx`)가 이미 `@radix-ui/react-dialog`를
감싸는 것과 같은 방식으로 `AlertDialog`를 `@radix-ui/react-alert-dialog` 위에 만든다.
`Chip`은 `class-variance-authority` 기반 순수 컴포넌트(새 의존성 없음). `ImageLightbox`는
기존 두 파일의 중복 JSX를 그대로 뽑아낸 순수 컴포넌트(새 의존성 없음). 전부 1·2단계
토큰(`--radius-*`, `--shadow-*`, `--motion-*`)만 쓰고 새 값 안 만든다.

## Global Constraints

- Avatar·Callout·(로드맵의) Dialog는 스코프 밖 — 이번 계획에 없음.
- Alert Dialog는 배경 클릭으로 안 닫힌다(Dialog와 다름, SEED 스펙) — Esc나 버튼으로만.
- Alert Dialog 액션은 최대 2개(취소+확인), 파괴적 액션(삭제)엔 `destructive` variant,
  취소 버튼엔 강조색 안 씀.
- Chip은 크기(sm 32px/md 36px/lg 40px)·variant 구조(tint/outline)만 SEED에서 가져오고,
  색은 Roam 고유 동적 hex(`color` prop)를 그대로 쓴다 — 고정 팔레트로 안 바꾼다.
- ImageLightbox는 SEED 대응 없음 — 순수 Roam 자체 중복 제거.
- Roam은 라이트 모드만 지원 — 다크모드 검증 불필요.
- 기존 소비처의 카피(문구)·삭제 로직은 변경하지 않는다 — UI 컴포넌트만 교체.

---

### Task 1: Alert Dialog

**Files:**
- Create: `src/components/ui/alert-dialog.tsx`
- Modify: `package.json` (dependencies)
- Modify: `src/components/admin/event-manager.tsx`
- Modify: `src/components/admin/booth-manager.tsx`
- Modify: `src/components/community/community-view.tsx`
- Modify: `src/lib/i18n/dictionaries.ts` (ko/en `common.cancel` 키 추가)

**Interfaces:**
- Produces: `AlertDialog`/`AlertDialogTrigger`/`AlertDialogContent`/`AlertDialogHeader`/
  `AlertDialogFooter`/`AlertDialogTitle`/`AlertDialogDescription`/`AlertDialogAction`
  (`variant?: "default" | "destructive"`, 기본 `"default"`)/`AlertDialogCancel` —
  `src/components/ui/alert-dialog.tsx`에서 export.

- [ ] **Step 1: `@radix-ui/react-alert-dialog` 설치**

`package.json`의 `dependencies`에 알파벳 순서로 추가(`@radix-ui/react-avatar`와
`@radix-ui/react-checkbox` 사이):

```json
    "@radix-ui/react-alert-dialog": "^1.1.23",
```

Run: `npm install`

- [ ] **Step 2: `src/components/ui/alert-dialog.tsx` 신규 작성**

```tsx
"use client";

import * as React from "react";
import * as AlertDialogPrimitive from "@radix-ui/react-alert-dialog";
import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

const AlertDialog = AlertDialogPrimitive.Root;
const AlertDialogTrigger = AlertDialogPrimitive.Trigger;
const AlertDialogPortal = AlertDialogPrimitive.Portal;

const AlertDialogOverlay = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/50 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
AlertDialogOverlay.displayName = "AlertDialogOverlay";

const AlertDialogContent = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Content>
>(({ className, ...props }, ref) => (
  <AlertDialogPortal>
    <AlertDialogOverlay />
    <AlertDialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-xl bg-card p-5 shadow-[var(--shadow-pop)] duration-[var(--motion-d4)] data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className,
      )}
      {...props}
    />
  </AlertDialogPortal>
));
AlertDialogContent.displayName = "AlertDialogContent";

function AlertDialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("flex flex-col gap-1.5 text-left", className)} {...props} />;
}

function AlertDialogFooter({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("mt-4 flex justify-end gap-2", className)} {...props} />;
}

const AlertDialogTitle = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Title ref={ref} className={cn("text-lg font-bold", className)} {...props} />
));
AlertDialogTitle.displayName = "AlertDialogTitle";

const AlertDialogDescription = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
));
AlertDialogDescription.displayName = "AlertDialogDescription";

const AlertDialogAction = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Action>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Action> & {
    variant?: "default" | "destructive";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <AlertDialogPrimitive.Action
    ref={ref}
    className={cn(buttonVariants({ variant, size: "sm" }), className)}
    {...props}
  />
));
AlertDialogAction.displayName = "AlertDialogAction";

const AlertDialogCancel = React.forwardRef<
  React.ElementRef<typeof AlertDialogPrimitive.Cancel>,
  React.ComponentPropsWithoutRef<typeof AlertDialogPrimitive.Cancel>
>(({ className, ...props }, ref) => (
  <AlertDialogPrimitive.Cancel
    ref={ref}
    className={cn(buttonVariants({ variant: "outline", size: "sm" }), className)}
    {...props}
  />
));
AlertDialogCancel.displayName = "AlertDialogCancel";

export {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
};
```

- [ ] **Step 3: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/components/ui/alert-dialog.tsx`
Expected: 에러 없음.

- [ ] **Step 4: `event-manager.tsx`에 적용**

`src/components/admin/event-manager.tsx`, import 블록 마지막 줄(`import type { Booth, BoothEvent } from "@/lib/types";` 앞)에 추가:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
```

`remove` 함수, 기존:
```tsx
  async function remove(ev: BoothEvent) {
    if (!confirm(`'${ev.title}' 이벤트를 삭제할까요?`)) return;
    try {
      await api.del(`/api/events/${ev.id}`);
      toast.success("삭제했어요");
      router.refresh();
    } catch {
      toast.error("삭제 실패");
    }
  }
```

교체(`confirm()` 줄만 제거 — 확인은 이제 AlertDialog가 담당):
```tsx
  async function remove(ev: BoothEvent) {
    try {
      await api.del(`/api/events/${ev.id}`);
      toast.success("삭제했어요");
      router.refresh();
    } catch {
      toast.error("삭제 실패");
    }
  }
```

삭제 버튼, 기존:
```tsx
              <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => remove(ev)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
```

교체:
```tsx
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="삭제">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>이벤트 삭제</AlertDialogTitle>
                    <AlertDialogDescription>
                      '{ev.title}' 이벤트를 삭제할까요?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => remove(ev)}>
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
```

- [ ] **Step 5: `booth-manager.tsx`에 적용 — 같은 패턴**

`src/components/admin/booth-manager.tsx`, import 블록 마지막에(Sheet import 다음)
추가:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
```

`remove` 함수, 기존:
```tsx
  async function remove(b: Booth) {
    if (!confirm(`'${b.name}' 부스를 삭제할까요?`)) return;
    try {
      await api.del(`/api/booths/${b.id}`);
      toast.success("삭제했어요");
      router.refresh();
    } catch {
      toast.error("삭제 실패");
    }
  }
```

교체:
```tsx
  async function remove(b: Booth) {
    try {
      await api.del(`/api/booths/${b.id}`);
      toast.success("삭제했어요");
      router.refresh();
    } catch {
      toast.error("삭제 실패");
    }
  }
```

삭제 버튼(`src/components/admin/booth-manager.tsx:129-131`), 기존:
```tsx
              <Button variant="ghost" size="icon" aria-label="삭제" onClick={() => remove(b)}>
                <Trash2 className="size-4 text-destructive" />
              </Button>
```

교체:
```tsx
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="삭제">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>부스 삭제</AlertDialogTitle>
                    <AlertDialogDescription>
                      '{b.name}' 부스를 삭제할까요?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>취소</AlertDialogCancel>
                    <AlertDialogAction variant="destructive" onClick={() => remove(b)}>
                      삭제
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
```

- [ ] **Step 6: i18n `common.cancel` 키 추가**

`src/lib/i18n/dictionaries.ts`, ko `common` 블록(줄 12~22)의 `close: "닫기",` 다음에 추가:

```ts
    cancel: "취소",
```

en `common` 블록(줄 499~508 부근)의 `close: "Close",` 다음에 추가:

```ts
    cancel: "Cancel",
```

- [ ] **Step 7: `community-view.tsx`에 적용 — 신고 확인**

`src/components/community/community-view.tsx`, import 블록에 추가(다른 `@/components/ui/*`
import 근처 — 이 파일엔 아직 `ui/` import가 없으므로 `@/components/common/app-bar` import
다음 줄):

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
```

`report` 함수, 기존:
```tsx
  async function report(id: string) {
    if (reportedIds.includes(id)) return;
    if (!window.confirm(t("community.reportConfirm"))) return;
    try {
```

교체(`window.confirm()` 줄만 제거):
```tsx
  async function report(id: string) {
    if (reportedIds.includes(id)) return;
    try {
```

신고 트리거 버튼(줄 308~318 부근), 기존:
```tsx
                        <button
                          type="button"
                          onClick={() => report(p.id)}
                          disabled={reportedIds.includes(p.id)}
                          aria-label={
                            reportedIds.includes(p.id)
                              ? t("community.reportDone")
                              : t("community.report")
                          }
                          className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                        >
                          <Flag className="size-4" />
                        </button>
```

교체:
```tsx
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <button
                              type="button"
                              disabled={reportedIds.includes(p.id)}
                              aria-label={
                                reportedIds.includes(p.id)
                                  ? t("community.reportDone")
                                  : t("community.report")
                              }
                              className="rounded-full p-1 text-muted-foreground hover:bg-secondary hover:text-destructive disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-muted-foreground"
                            >
                              <Flag className="size-4" />
                            </button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("community.report")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t("community.reportConfirm")}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("common.cancel")}</AlertDialogCancel>
                              <AlertDialogAction onClick={() => report(p.id)}>
                                {t("community.report")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
```

- [ ] **Step 8: 빌드 + 회귀 확인**

Run: `npx tsc --noEmit && npx eslint src/components/admin/event-manager.tsx src/components/admin/booth-manager.tsx src/components/community/community-view.tsx src/lib/i18n/dictionaries.ts`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과.

- [ ] **Step 9: 수동 확인 (라이트 모드만)**

`npm run dev`(mock 모드) 후 `/admin/events`·`/admin/booths`에서 삭제 버튼을 눌러
Alert Dialog가 뜨는지, 취소를 누르면 아무 일도 안 일어나는지, 삭제를 누르면 실제
삭제되고 토스트가 뜨는지 확인. 커뮤니티 화면에서 신고 버튼도 같은 방식으로 확인
(문구가 "이 글 신고할까? 여러 명이 신고하면 숨겨져." 그대로인지).

- [ ] **Step 10: 커밋**

```bash
git add package.json package-lock.json src/components/ui/alert-dialog.tsx src/components/admin/event-manager.tsx src/components/admin/booth-manager.tsx src/components/community/community-view.tsx src/lib/i18n/dictionaries.ts
git commit -m "feat(ui): Alert Dialog 추가 — 삭제·신고 확인 3곳을 window.confirm()에서 교체"
```

---

### Task 2: Chip

**Files:**
- Create: `src/components/ui/chip.tsx`
- Modify: `src/components/booth/theme-chip.tsx`
- Modify: `src/components/booth/category-chip.tsx`
- Modify: `src/components/values/value-chips.tsx`
- Modify: `src/components/booth/booth-highlights.tsx`

**Interfaces:**
- Produces: `Chip({ variant?: "tint" | "outline", size?: "sm" | "md" | "lg", color?: string, icon?: React.ReactNode, className?: string, children: React.ReactNode })` — `src/components/ui/chip.tsx`에서 export. `variant` 기본 `"tint"`, `size` 기본 `"sm"`.

- [ ] **Step 1: `src/components/ui/chip.tsx` 신규 작성**

```tsx
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-full font-semibold",
  {
    variants: {
      variant: {
        tint: "",
        outline: "border border-border bg-card text-foreground/90",
      },
      size: {
        sm: "h-8 px-2.5 text-xs",
        md: "h-9 px-3 text-sm",
        lg: "h-10 px-3.5 text-sm",
      },
    },
    defaultVariants: { variant: "tint", size: "sm" },
  },
);

export interface ChipProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof chipVariants> {
  /** hex 색(예: "#4f46e5"). tint variant에서만 쓰임 — 없으면 --primary 기본값. */
  color?: string;
  icon?: React.ReactNode;
}

export function Chip({
  variant = "tint",
  size = "sm",
  color,
  icon,
  className,
  style,
  children,
  ...props
}: ChipProps) {
  const isTint = variant === "tint";
  const tintStyle = isTint && color ? { backgroundColor: `${color}1a`, color, ...style } : style;
  return (
    <span
      className={cn(
        chipVariants({ variant, size }),
        isTint && !color && "bg-primary/10 text-primary",
        className,
      )}
      style={tintStyle}
      {...props}
    >
      {icon}
      {children}
    </span>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/components/ui/chip.tsx`
Expected: 에러 없음.

- [ ] **Step 3: `theme-chip.tsx`를 `Chip` 위에 재구현**

`src/components/booth/theme-chip.tsx` 전체 기존:
```tsx
import { primaryThemeFromTags, themeLabel } from "@/lib/booth/themes";

/**
 * 부스의 대표 테마(무엇을 그리는가) 한 개. 카테고리 칩(국내작가/기업)이 "누구인가"를
 * 말한다면 이건 "무엇을 그리는가"다 — 방문객의 취향이 실제로 붙는 축이라 먼저 읽히게
 * 카테고리보다 앞에 둔다. 근거가 없는 부스(소개가 부스코드·날짜뿐)엔 그리지 않는다.
 */
export function ThemeChip({ tags }: { tags: string[] }) {
  const key = primaryThemeFromTags(tags);
  if (!key) return null;
  return (
    <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
      {themeLabel(key)}
    </span>
  );
}
```

교체:
```tsx
import { primaryThemeFromTags, themeLabel } from "@/lib/booth/themes";
import { Chip } from "@/components/ui/chip";

/**
 * 부스의 대표 테마(무엇을 그리는가) 한 개. 카테고리 칩(국내작가/기업)이 "누구인가"를
 * 말한다면 이건 "무엇을 그리는가"다 — 방문객의 취향이 실제로 붙는 축이라 먼저 읽히게
 * 카테고리보다 앞에 둔다. 근거가 없는 부스(소개가 부스코드·날짜뿐)엔 그리지 않는다.
 */
export function ThemeChip({ tags }: { tags: string[] }) {
  const key = primaryThemeFromTags(tags);
  if (!key) return null;
  return <Chip className="font-bold">{themeLabel(key)}</Chip>;
}
```

(`font-bold`는 원래 이 칩만 `font-bold`였고 나머지 칩은 `font-semibold` 기본이라 —
`Chip`의 기본 굵기 `font-semibold` 위에 `className`으로 덮어씀.)

- [ ] **Step 4: `category-chip.tsx`를 `Chip` 위에 재구현**

`src/components/booth/category-chip.tsx` 전체 기존:
```tsx
import { Icon } from "@/components/common/icon";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";

export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold",
        className,
      )}
      style={{ backgroundColor: `${category.color}1a`, color: category.color }}
    >
      <Icon name={category.icon} className="size-3.5" />
      {category.name}
    </span>
  );
}
```

교체:
```tsx
import { Icon } from "@/components/common/icon";
import { Chip } from "@/components/ui/chip";
import type { Category } from "@/lib/types";

export function CategoryChip({ category, className }: { category: Category; className?: string }) {
  return (
    <Chip color={category.color} icon={<Icon name={category.icon} className="size-3.5" />} className={className}>
      {category.name}
    </Chip>
  );
}
```

- [ ] **Step 5: `value-chips.tsx`를 `Chip` 위에 재구현**

`src/components/values/value-chips.tsx` 전체 기존:
```tsx
"use client";

import { valueDef } from "@/lib/values";
import { useT } from "@/lib/i18n/provider";
import type { BoothValueTag } from "@/lib/types";

/** 부스의 관람 가치 태그를 색 칩으로. "왜 너에게 맞을 수 있는지"의 연결 가치. */
export function ValueChips({
  tags,
  max = 3,
}: {
  tags?: BoothValueTag[];
  max?: number;
}) {
  const t = useT();
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((tag) => {
        const d = valueDef(tag.slug);
        if (!d) return null;
        return (
          <span
            key={tag.slug}
            className="rounded-full px-2 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: `${d.color}1a`, color: d.color }}
          >
            {t(`values.${tag.slug}`)}
          </span>
        );
      })}
    </div>
  );
}
```

교체:
```tsx
"use client";

import { valueDef } from "@/lib/values";
import { useT } from "@/lib/i18n/provider";
import { Chip } from "@/components/ui/chip";
import type { BoothValueTag } from "@/lib/types";

/** 부스의 관람 가치 태그를 색 칩으로. "왜 너에게 맞을 수 있는지"의 연결 가치. */
export function ValueChips({
  tags,
  max = 3,
}: {
  tags?: BoothValueTag[];
  max?: number;
}) {
  const t = useT();
  if (!tags?.length) return null;
  return (
    <div className="flex flex-wrap gap-1">
      {tags.slice(0, max).map((tag) => {
        const d = valueDef(tag.slug);
        if (!d) return null;
        return (
          <Chip key={tag.slug} color={d.color}>
            {t(`values.${tag.slug}`)}
          </Chip>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6: `booth-highlights.tsx`의 신간·굿즈 칩을 `Chip`으로 교체**

`src/components/booth/booth-highlights.tsx`, import 블록 마지막에 추가:

```tsx
import { Chip } from "@/components/ui/chip";
```

신간 칩 목록, 기존:
```tsx
          <div className="flex flex-wrap gap-1.5">
            {newReleases.map((k) => (
              <span
                key={k}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground/90"
              >
                {k}
              </span>
            ))}
          </div>
```

교체:
```tsx
          <div className="flex flex-wrap gap-1.5">
            {newReleases.map((k) => (
              <Chip key={k} variant="outline" size="md" className="font-medium">
                {k}
              </Chip>
            ))}
          </div>
```

굿즈 칩 목록, 기존:
```tsx
          <div className="flex flex-wrap gap-1.5">
            {goods.map((k) => (
              <span
                key={k}
                className="rounded-full border border-border bg-card px-2.5 py-1 text-sm font-medium text-foreground/90"
              >
                {k}
              </span>
            ))}
          </div>
```

교체:
```tsx
          <div className="flex flex-wrap gap-1.5">
            {goods.map((k) => (
              <Chip key={k} variant="outline" size="md" className="font-medium">
                {k}
              </Chip>
            ))}
          </div>
```

- [ ] **Step 7: 빌드 + 회귀 확인**

Run: `npx tsc --noEmit && npx eslint src/components/ui/chip.tsx src/components/booth/theme-chip.tsx src/components/booth/category-chip.tsx src/components/values/value-chips.tsx src/components/booth/booth-highlights.tsx`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과.

- [ ] **Step 8: 수동 확인 (라이트 모드만)**

`npm run dev` 후 부스 상세 화면에서 테마·카테고리·가치 칩 3종이 색과 아이콘 그대로
보이는지(살짝 커진 것 외 시각적으로 안 깨지는지), 소개 탭의 신간·굿즈 칩이 여전히
테두리 스타일로 보이는지 확인.

- [ ] **Step 9: 커밋**

```bash
git add src/components/ui/chip.tsx src/components/booth/theme-chip.tsx src/components/booth/category-chip.tsx src/components/values/value-chips.tsx src/components/booth/booth-highlights.tsx
git commit -m "feat(ui): Chip 컴포넌트 추가 — 칩 4종 중복을 하나로 통합"
```

---

### Task 3: ImageLightbox

**Files:**
- Create: `src/components/common/image-lightbox.tsx`
- Modify: `src/components/booth/booth-gallery.tsx`
- Modify: `src/components/exhibition/poster-viewer.tsx`

**Interfaces:**
- Produces: `ImageLightbox({ src: string, alt: string, onClose: () => void })` —
  `src/components/common/image-lightbox.tsx`에서 export.

- [ ] **Step 1: `src/components/common/image-lightbox.tsx` 신규 작성**

```tsx
"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * 이미지 전체화면 오버레이 — 배경 클릭·Esc·X 버튼으로 닫힌다. 부스 갤러리·포스터
 * 확대보기가 완전히 같은 오버레이를 각자 구현하고 있던 걸 하나로 뽑았다.
 */
export function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  const t = useT();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={alt}
      onClick={onClose}
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 원본 비율 유지 */}
      <img
        src={src}
        alt={alt}
        onClick={(e) => e.stopPropagation()}
        className="max-h-full max-w-full rounded-2xl object-contain shadow-[var(--shadow-pop)]"
      />
      <button
        type="button"
        onClick={onClose}
        aria-label={t("common.close")}
        className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:scale-95"
      >
        <X className="size-5" />
      </button>
    </div>
  );
}
```

- [ ] **Step 2: 빌드 확인**

Run: `npx tsc --noEmit && npx eslint src/components/common/image-lightbox.tsx`
Expected: 에러 없음.

- [ ] **Step 3: `booth-gallery.tsx`에 적용**

`src/components/booth/booth-gallery.tsx` 전체 기존:
```tsx
"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * 부스 작품 갤러리 — 일러스트·창작 부스는 작품 이미지가 핵심 정보다. 상세 상단에
 * 가로 스크롤 스트립으로 보여주고, 탭하면 전체화면 원본 비율(contain)로 확대.
 * 외부 CDN webp라 최적화 없이 plain img + lazy. images 없으면 아무것도 안 그림.
 */
export function BoothGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!images.length) return null;

  return (
    <>
      <div className="-mx-[var(--spacing-global-gutter)] flex gap-2 overflow-x-auto px-[var(--spacing-global-gutter)] pb-1">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={t("booth.viewImage", { n: i + 1 })}
            className="relative aspect-square w-32 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이미지 다수, 최적화 없이 lazy */}
            <img
              src={src}
              alt={`${name} ${i + 1}`}
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      {open !== null && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setOpen(null)}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 원본 비율 유지 */}
          <img
            src={images[open]}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-2xl object-contain"
          />
          <button
            type="button"
            onClick={() => setOpen(null)}
            aria-label={t("common.close")}
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:scale-95"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}
```

교체:
```tsx
"use client";

import { useState } from "react";
import { useT } from "@/lib/i18n/provider";
import { ImageLightbox } from "@/components/common/image-lightbox";

/**
 * 부스 작품 갤러리 — 일러스트·창작 부스는 작품 이미지가 핵심 정보다. 상세 상단에
 * 가로 스크롤 스트립으로 보여주고, 탭하면 전체화면 원본 비율(contain)로 확대.
 * 외부 CDN webp라 최적화 없이 plain img + lazy. images 없으면 아무것도 안 그림.
 */
export function BoothGallery({
  images,
  name,
}: {
  images: string[];
  name: string;
}) {
  const t = useT();
  const [open, setOpen] = useState<number | null>(null);

  if (!images.length) return null;

  return (
    <>
      <div className="-mx-[var(--spacing-global-gutter)] flex gap-2 overflow-x-auto px-[var(--spacing-global-gutter)] pb-1">
        {images.map((src, i) => (
          <button
            key={src}
            type="button"
            onClick={() => setOpen(i)}
            aria-label={t("booth.viewImage", { n: i + 1 })}
            className="relative aspect-square w-32 shrink-0 overflow-hidden rounded-2xl border border-border bg-secondary active:scale-[0.98]"
          >
            {/* eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이미지 다수, 최적화 없이 lazy */}
            <img
              src={src}
              alt={`${name} ${i + 1}`}
              loading="lazy"
              className="size-full object-cover"
            />
          </button>
        ))}
      </div>

      {open !== null && (
        <ImageLightbox src={images[open]} alt={name} onClose={() => setOpen(null)} />
      )}
    </>
  );
}
```

(`useEffect`·`X` import가 더 이상 안 쓰여 제거됨 — Esc 처리는 `ImageLightbox` 내부로
이동.)

- [ ] **Step 4: `poster-viewer.tsx`에 적용**

`src/components/exhibition/poster-viewer.tsx` 전체 기존:
```tsx
"use client";

import { useEffect, useState } from "react";
import { Expand, X } from "lucide-react";
import { useT } from "@/lib/i18n/provider";

/**
 * 포스터 전체 보기 — 히어로는 임팩트 위해 cover 크롭이라 제목·일자가 잘린다.
 * 잘린 정보는 요구 시 원본 비율(contain)로 볼 수 있게 한다. 히어로 위 작은 버튼 →
 * 전체화면 오버레이. 배경 탭·Esc·X로 닫힘.
 */
export function PosterViewer({ src, name }: { src: string; name: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("common.viewPoster")}
        // 아래쪽 — 위에 두면 포스터의 주최·후원 크레딧(보통 상단)을 가린다.
        // 히어로 하단은 스크림이 가장 진하고, 전시명 h1을 걷어내 비어 있다.
        className="pointer-events-auto absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur active:scale-95"
      >
        <Expand className="size-3.5" />
        {t("common.viewPoster")}
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={name}
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-[110] flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm animate-in fade-in"
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- 원본 비율 유지 위해 fill 대신 contain */}
          <img
            src={src}
            alt={name}
            onClick={(e) => e.stopPropagation()}
            className="max-h-full max-w-full rounded-2xl object-contain shadow-[var(--shadow-pop)]"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("common.close")}
            className="absolute right-4 top-[calc(env(safe-area-inset-top)+1rem)] flex size-10 items-center justify-center rounded-full bg-white/15 text-white backdrop-blur active:scale-95"
          >
            <X className="size-5" />
          </button>
        </div>
      )}
    </>
  );
}
```

교체:
```tsx
"use client";

import { useState } from "react";
import { Expand } from "lucide-react";
import { useT } from "@/lib/i18n/provider";
import { ImageLightbox } from "@/components/common/image-lightbox";

/**
 * 포스터 전체 보기 — 히어로는 임팩트 위해 cover 크롭이라 제목·일자가 잘린다.
 * 잘린 정보는 요구 시 원본 비율(contain)로 볼 수 있게 한다. 히어로 위 작은 버튼 →
 * 전체화면 오버레이. 배경 탭·Esc·X로 닫힘.
 */
export function PosterViewer({ src, name }: { src: string; name: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("common.viewPoster")}
        // 아래쪽 — 위에 두면 포스터의 주최·후원 크레딧(보통 상단)을 가린다.
        // 히어로 하단은 스크림이 가장 진하고, 전시명 h1을 걷어내 비어 있다.
        className="pointer-events-auto absolute bottom-3 right-3 z-10 flex items-center gap-1.5 rounded-full bg-black/45 px-3 py-1.5 text-xs font-semibold text-white backdrop-blur active:scale-95"
      >
        <Expand className="size-3.5" />
        {t("common.viewPoster")}
      </button>

      {open && <ImageLightbox src={src} alt={name} onClose={() => setOpen(false)} />}
    </>
  );
}
```

(`useEffect`·`X` import가 더 이상 안 쓰여 제거됨.)

- [ ] **Step 5: 빌드 + 회귀 확인**

Run: `npx tsc --noEmit && npx eslint src/components/common/image-lightbox.tsx src/components/booth/booth-gallery.tsx src/components/exhibition/poster-viewer.tsx`
Expected: 에러 없음.

Run: `npx vitest run`
Expected: 전체 통과.

- [ ] **Step 6: 수동 확인 (라이트 모드만)**

`npm run dev` 후 부스 상세(작품 이미지 있는 부스)에서 갤러리 썸네일을 눌러 라이트박스가
뜨는지, 전시 홈 포스터 확대보기도 동일하게 동작하는지 — 배경 클릭·Esc·X 버튼 셋 다
닫히는지, 부스 갤러리도 이제 이미지에 그림자가 보이는지(원래 없었던 것 추가됨) 확인.

- [ ] **Step 7: 커밋**

```bash
git add src/components/common/image-lightbox.tsx src/components/booth/booth-gallery.tsx src/components/exhibition/poster-viewer.tsx
git commit -m "refactor(ui): ImageLightbox로 부스 갤러리·포스터 뷰어 오버레이 중복 제거"
```

---

## 최종 검증 (전체 태스크 완료 후)

```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/ui/alert-dialog.tsx src/components/ui/chip.tsx src/components/common/image-lightbox.tsx src/components/admin/event-manager.tsx src/components/admin/booth-manager.tsx src/components/community/community-view.tsx src/lib/i18n/dictionaries.ts src/components/booth/theme-chip.tsx src/components/booth/category-chip.tsx src/components/values/value-chips.tsx src/components/booth/booth-highlights.tsx src/components/booth/booth-gallery.tsx src/components/exhibition/poster-viewer.tsx
```

브라우저로 관리자(`/admin/events`, `/admin/booths`)·커뮤니티·부스 상세·전시 홈을
라이트 모드로 한 번씩 훑어 최종 확인.
