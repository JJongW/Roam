# Roam — Exhibition Navigator

Mobile-first platform that helps exhibition visitors discover booths, avoid congestion, and
follow a personalized route — **without creating an account**. Includes an organizer admin
console with live operations and analytics.

Built with **Next.js 16 (App Router) · React 19 · TypeScript · Tailwind v4 · shadcn/ui ·
Supabase**. Design follows Apple HIG + Toss principles: clean, minimal, responsive, light/dark.

## Quick start

```bash
npm install
npm run dev          # http://localhost:3000
```

No environment variables are required: with no Supabase credentials the app runs on an
in-memory **MockRepository** seeded with a full demo exhibition (TechWorld Expo 2026). To use a
real database, copy `.env.example` → `.env.local` and fill the Supabase keys; the app switches
to Postgres automatically (`GET /api/health` reports the active `mode`).

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Dev server |
| `npm run build` / `npm start` | Production build / serve |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest (engine, repository, components) |
| `npm run test:watch` | Vitest watch mode |
| `npm run lint` | ESLint |

## Architecture

- **Data layer** — `src/lib/repositories`: a `Repository` interface with two implementations
  (`MockRepository`, `SupabaseRepository`) selected at runtime by `getRepository()`. UI, APIs,
  validation and tests all work with zero infra and flip to Postgres via env.
- **Engine** — `src/lib/engine`: pure, deterministic recommendation scoring + route planning +
  turn-by-turn navigation. Fully unit-tested, no I/O.
- **API** — `src/app/api/*` Route Handlers, every input validated with Zod
  (`src/lib/schemas`), consistent `{ data } | { error }` envelope.
- **State** — server owns truth (RSC + Route Handlers); Zustand holds ephemeral client state
  (onboarding draft, route progress, map viewport).
- **DB** — `supabase/migrations/0001_init.sql` + `supabase/seed.sql` mirror the mock seed.

Design docs live in `.claude/plans/`: `architecture.md`, `erd.md`, `api-spec.md`.

## Visitor flow (MVP success criteria)

Open exhibition → onboarding (purpose · interests · time · movement · companion) → personalized
route → interactive map → turn-by-turn navigation → booth details (reviews, events, live
waiting, welcome kit) → finish — all anonymous.

## Admin

`/admin` — organizer console: exhibition / booth / event / waiting management and an analytics
dashboard (heatmap, popular booths, visitor flow, conversion funnel).
