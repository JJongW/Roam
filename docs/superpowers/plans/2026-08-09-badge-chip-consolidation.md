# Badge/Chip Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete `Badge` (`src/components/ui/badge.tsx`) by absorbing its one real usage into `Chip` (`src/components/ui/chip.tsx`), so the codebase has one pill-shaped label primitive instead of two near-identical ones.

**Architecture:** No new component, no new variant. `Chip` already supports arbitrary background/text color via `className` (merged with `tailwind-merge`, confirmed in `src/lib/utils.ts:6-8` — later classes win over the component's own defaults). The single `Badge` call site (`event-list.tsx:98`, `variant="destructive"`) gets rewritten as a `Chip` with an overriding `className` that reproduces the exact visual output, then `badge.tsx` is deleted.

**Tech Stack:** React 19, Tailwind v4, `class-variance-authority`, `tailwind-merge` (already in use, no new deps).

## Global Constraints

- Only known usage of `Badge` in the entire repo is `src/components/booth/event-list.tsx:98` (verified via `grep -rn "<Badge" src`) — no other call site to migrate.
- Do not add a new `Chip` variant (e.g. a `destructive` cva variant) for a single call site — YAGNI. Use `className` override, matching how `ThemeChip`/`CategoryChip` already customize `Chip` via `className`/`color` props (`src/components/booth/theme-chip.tsx:12`, `src/components/booth/category-chip.tsx:7`).
- No test files exist today for `badge.tsx` or `chip.tsx` (both are pure presentational, no branching logic) — this plan does not add one, consistent with existing convention.
- Roam is light-mode only (`roam-light-mode-only` memory) — no dark-mode variant to check.
- Verification commands per `CLAUDE.md`: `npx tsc --noEmit`, `npx vitest run`, `npx eslint <changed paths>`.

---

### Task 1: Replace the `Badge` call site with `Chip`, then delete `Badge`

**Files:**
- Modify: `src/components/booth/event-list.tsx:16` (import), `src/components/booth/event-list.tsx:98-100` (JSX)
- Delete: `src/components/ui/badge.tsx`

**Interfaces:**
- Consumes: `Chip` from `src/components/ui/chip.tsx` — `export function Chip({ variant, size, color, icon, className, style, children, ...props })`. Default `variant="tint"`, `size="sm"`.
- Produces: nothing new — this is the last task, no downstream consumers.

- [ ] **Step 1: Confirm there is exactly one `Badge` usage left to migrate**

Run: `grep -rn "<Badge\|from \"@/components/ui/badge\"" src`
Expected output (exactly these two lines, nothing else):
```
src/components/booth/event-list.tsx:16:import { Badge } from "@/components/ui/badge";
src/components/booth/event-list.tsx:98:                          <Badge variant="destructive">
```
If any other file appears, stop and add it to this task before continuing — this plan only accounts for the one call site above.

- [ ] **Step 2: Swap the import**

In `src/components/booth/event-list.tsx`, change line 16 from:
```tsx
import { Badge } from "@/components/ui/badge";
```
to:
```tsx
import { Chip } from "@/components/ui/chip";
```

- [ ] **Step 3: Replace the JSX usage**

In `src/components/booth/event-list.tsx`, change lines 98-100 from:
```tsx
                          <Badge variant="destructive">
                            {t("event.inProgress")}
                          </Badge>
```
to:
```tsx
                          <Chip className="min-h-0 py-0.5 bg-destructive/12 text-destructive">
                            {t("event.inProgress")}
                          </Chip>
```

This reproduces `Badge`'s exact rendered output: `Chip`'s `tint`/`sm` defaults already give `inline-flex items-center gap-1 rounded-full px-2.5 text-xs font-semibold` (identical to `Badge`'s base classes at those properties); the `className` override cancels `Chip`'s `min-h-8` (→ `min-h-0`, matching `Badge` having no min-height) and its default tint color (`bg-primary/10 text-primary` → `bg-destructive/12 text-destructive`, matching `Badge`'s `destructive` variant), and adds `py-0.5` (matching `Badge`'s vertical padding, which `Chip`'s `sm` size doesn't set). `tailwind-merge` (`src/lib/utils.ts:6-8`) resolves the conflicting utility classes by keeping the ones from `className` since it's passed last into `cn(...)`.

- [ ] **Step 4: Delete the now-unused `Badge` component**

Run: `rm src/components/ui/badge.tsx`

- [ ] **Step 5: Verify no dangling references**

Run: `grep -rn "components/ui/badge\|badgeVariants" src`
Expected: no output.

- [ ] **Step 6: Type-check, test, lint**

Run:
```bash
npx tsc --noEmit
npx vitest run
npx eslint src/components/booth/event-list.tsx
```
Expected: all three pass with no errors (deleting `badge.tsx` removes its only consumer, so `tsc` should not report an unresolved import; `vitest` has no existing suite touching these files, so it should simply pass whatever else it already covers; `eslint` should be clean on the one changed file).

- [ ] **Step 7: Visual check**

Start the dev server (mock mode is fine — this is a static label, not data-dependent):
```bash
NEXT_PUBLIC_SUPABASE_URL= NEXT_PUBLIC_SUPABASE_ANON_KEY= SUPABASE_SERVICE_ROLE_KEY= npx next dev
```
Log in, open any booth detail page with a currently-live event (or temporarily widen `isLiveNow` / pick a seed event whose time window covers "now" if none is live), and confirm the "진행 중" pill next to the live event still renders as a small red pill with red text on a light-red background — pixel-equivalent to before the change. Stop the dev server after confirming.

- [ ] **Step 8: Commit**

```bash
git add src/components/booth/event-list.tsx
git rm src/components/ui/badge.tsx
git commit -m "refactor(ui): absorb Badge into Chip, drop duplicate primitive"
```
