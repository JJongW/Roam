// Regenerates supabase/migrations/0039_recurring_exhibition_watchlist.sql from
// the canonical TS source (src/lib/exhibition/watchlist.ts) so the two never
// drift. Run after editing watchlist.ts: node scripts/gen-recurring-exhibition-watchlist-sql.mjs
import { build } from "esbuild";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const out = join(mkdtempSync(join(tmpdir(), "watchlist-")), "watchlist.mjs");
await build({
  entryPoints: ["src/lib/exhibition/watchlist.ts"],
  bundle: true,
  format: "esm",
  platform: "node",
  outfile: out,
  logLevel: "error",
});
const { RECURRING_EXHIBITION_WATCHLIST: items } = await import(out);

const q = (v) => (v === undefined || v === null ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const jb = (v) => `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
const n = (v) => (v === undefined || v === null ? "null" : String(v));

const DDL = `-- Recurring exhibition brands Roam should monitor for future COEX / COEX Magok
-- coverage. These are not concrete exhibition runs; once a run is confirmed,
-- it can become a row in the existing exhibition table.

create table if not exists recurring_exhibition_watchlist (
  id text primary key,
  slug text not null unique,
  name text not null,
  category text not null,
  primary_venue text not null check (
    primary_venue in ('coex-samseong', 'coex-magok', 'multi')
  ),
  venues jsonb not null default '[]'::jsonb,
  recurrence text not null default '정기 개최',
  audience_floor int not null default 10000,
  last_verified_attendance int,
  attendance_year int,
  attendance_note text not null default '',
  confidence text not null check (
    confidence in ('confirmed', 'included_by_scale')
  ),
  tracking_status text not null default 'active' check (
    tracking_status in ('active', 'paused', 'archived')
  ),
  source_urls jsonb not null default '[]'::jsonb,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_recurring_exhibition_watchlist_status
  on recurring_exhibition_watchlist (tracking_status, primary_venue, category);

alter table recurring_exhibition_watchlist enable row level security;

drop policy if exists "public read recurring exhibition watchlist"
  on recurring_exhibition_watchlist;
create policy "public read recurring exhibition watchlist"
  on recurring_exhibition_watchlist for select using (true);
`;

const columns = [
  "id",
  "slug",
  "name",
  "category",
  "primary_venue",
  "venues",
  "recurrence",
  "last_verified_attendance",
  "attendance_year",
  "attendance_note",
  "confidence",
  "source_urls",
  "notes",
];

const rows = items.map(
  (i) =>
    `  (${q(i.id)}, ${q(i.slug)}, ${q(i.name)}, ${q(i.category)}, ${q(i.primaryVenue)}, ${jb(i.venues)}, ${q(i.recurrence)}, ${n(i.lastVerifiedAttendance)}, ${n(i.attendanceYear)}, ${q(i.attendanceNote)}, ${q(i.confidence)}, ${jb(i.sourceUrls)}, ${q(i.notes)})`,
);

const sql = [
  DDL,
  `insert into recurring_exhibition_watchlist (\n  ${columns.join(",\n  ")}\n) values`,
  rows.join(",\n"),
  "on conflict (id) do update set",
  columns
    .filter((c) => c !== "id")
    .map((c) => `  ${c} = excluded.${c}`)
    .join(",\n") + ",\n  updated_at = now();",
  "",
].join("\n");

writeFileSync(
  "supabase/migrations/0039_recurring_exhibition_watchlist.sql",
  sql,
);
console.log(`0039_recurring_exhibition_watchlist.sql written: ${items.length} rows`);
