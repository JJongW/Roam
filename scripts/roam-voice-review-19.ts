/**
 * 해요체 백필(`roam-voice-db-backfill.ts`)이 규칙으로 못 바꾸고 review로 남긴 19칸을, Ted가 승인한
 * 문장으로 바꾼다(2026-11-19). 문장은 `scripts/roam-voice-review-19.json`에 칸마다 before와 after로
 * 적어 두었다. 이 스크립트는 문장을 만들지 않는다.
 *
 * - 행사 안내(exhibition.tips) 3건: 합니다체 끝과 가운뎃점만 고침
 * - 마곡리빙마켓, 시웨 마곡 추천 이유 7건: 명령형('~봐', '~줘') 등을 해요체로, [cite] 찌꺼기 제거
 * - DDP A9 로미 한 줄: '~만드는구나' → '~만드는 곳이에요'
 * - 카페쇼 로미 한 줄 8건: 못 찾았다는 문장이라 비움(null). 컬럼은 nullable text이고, 웹은 null을
 *   undefined로 읽어 한 줄을 안 보여 주며, iOS는 이 칸을 읽지 않는다.
 *
 * 안전장치: 운영 값이 표의 before와 같을 때만 바꾼다(jsonb 키 순서 무시). 이미 after면 건너뛰고,
 * 둘 다 아니면(그새 누가 고쳤으면) 그 칸은 손대지 않고 실패로 끝낸다.
 *
 *   # 드라이런(기본): 운영은 읽기만 하고 diff를 쓴다
 *   npx vite-node -c worker/vite.config.ts scripts/roam-voice-review-19.ts
 *   # 적용: 전체 행 백업 → before와 같은 칸만 갱신 → 다시 읽어 확인
 *   npx vite-node -c worker/vite.config.ts scripts/roam-voice-review-19.ts -- --apply
 *   # diff 위치 바꾸기
 *   ... -- --diff <경로>
 *
 * 되돌리기: node scripts/restore-roam-voice.mjs data/intake/_backup/roam-voice-review-19-before-<ISO>.json [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { loadSupabaseCreds, sameValue, voiceProblems } from "./roam-voice-db-helpers";

const APPLY = process.argv.includes("--apply");
const diffArg = process.argv.indexOf("--diff");
const DEFAULT_DIFF = "/Users/sinjong-won/.claude/jobs/1b54bc24/tmp/db-voice-diff-4.json";
const DIFF_PATH = diffArg > 0 ? process.argv[diffArg + 1] : DEFAULT_DIFF;
const ROOT = fileURLToPath(new URL("..", import.meta.url));

type Row = Record<string, unknown>;
interface Entry {
  table: "exhibition" | "booth_enrichment";
  keyCol: "id" | "booth_id";
  key: string;
  slug: string;
  code: string | null;
  field: string;
  before: unknown;
  after: unknown;
}
type Status = "ready" | "already" | "drift" | "missing";

const entries = JSON.parse(readFileSync(join(ROOT, "scripts/roam-voice-review-19.json"), "utf8")) as Entry[];

const { url, key } = loadSupabaseCreds(ROOT);
const sb = createClient(url, key, { auth: { persistSession: false } });

async function readRow(e: Pick<Entry, "table" | "keyCol" | "key">): Promise<Row | null> {
  const { data, error } = await sb.from(e.table).select("*").eq(e.keyCol, e.key).limit(1);
  // PostgREST는 실패해도 예외를 안 던진다. 0건으로 위장되지 않게 직접 본다.
  if (error || !data) throw new Error(`${e.table} ${e.key} 읽기 실패: ${error?.message ?? "data 없음"}`);
  return (data[0] as Row | undefined) ?? null;
}

const rows = new Map<string, Row | null>();
const rowId = (e: Entry) => `${e.table}:${e.key}`;
for (const e of entries) if (!rows.has(rowId(e))) rows.set(rowId(e), await readRow(e));

const checked = entries.map((e) => {
  const row = rows.get(rowId(e));
  const current = row ? row[e.field] : undefined;
  const status: Status = !row
    ? "missing"
    : sameValue(current, e.before)
      ? "ready"
      : sameValue(current, e.after)
        ? "already"
        : "drift";
  return { ...e, status, current };
});

const count = (s: Status) => checked.filter((c) => c.status === s).length;
writeFileSync(
  DIFF_PATH,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      counts: { ready: count("ready"), already: count("already"), drift: count("drift"), missing: count("missing") },
      diffs: checked.map((c) => ({
        table: c.table,
        id: c.key,
        slug: c.slug,
        code: c.code,
        field: c.field,
        status: c.status,
        before: c.before,
        after: c.after,
        // 표와 다를 때만 운영 값을 같이 적어 무엇이 달라졌는지 본다.
        ...(c.status === "drift" ? { current: c.current } : {}),
      })),
    },
    null,
    1,
  ),
);
console.log("diff:", DIFF_PATH);
console.log(
  `바꿀 칸 ${count("ready")}, 이미 바뀜 ${count("already")}, 운영 값이 표와 다름 ${count("drift")}, 행 없음 ${count("missing")}`,
);
for (const c of checked.filter((c) => c.status === "drift" || c.status === "missing"))
  console.log(` - ${c.status} ${c.slug} ${c.code ?? ""} ${c.table}.${c.field}`);

if (!APPLY) {
  console.log("드라이런이에요. 적용하려면 --apply");
  process.exit(count("drift") || count("missing") ? 1 : 0);
}

// ── 백업 → 적용 → 확인 ────────────────────────────────────────────────────
const ready = checked.filter((c) => c.status === "ready");
const byRow = new Map<string, { table: Entry["table"]; keyCol: Entry["keyCol"]; key: string; row: Row; fields: string[] }>();
for (const c of ready) {
  const g = byRow.get(rowId(c)) ?? { table: c.table, keyCol: c.keyCol, key: c.key, row: rows.get(rowId(c))!, fields: [] };
  g.fields.push(c.field);
  byRow.set(rowId(c), g);
}

const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(join(ROOT, "data/intake/_backup"), { recursive: true });
const backupPath = `data/intake/_backup/roam-voice-review-19-before-${stamp}.json`;
// restore-roam-voice.mjs가 읽는 형식 그대로: 행 전체를 뜨고, 되돌릴 칸은 fields에.
writeFileSync(
  join(ROOT, backupPath),
  JSON.stringify({ createdAt: new Date().toISOString(), entries: [...byRow.values()] }, null, 1),
);
console.log("backup:", backupPath);

let failed = 0;
for (const g of byRow.values()) {
  const patch = Object.fromEntries(
    g.fields.map((f) => [f, ready.find((c) => rowId(c) === `${g.table}:${g.key}` && c.field === f)!.after]),
  );
  const { data, error } = await sb.from(g.table).update(patch).eq(g.keyCol, g.key).select(g.keyCol);
  // PostgREST는 실패해도 예외를 안 던진다. 에러와 갱신 행 수를 직접 본다.
  if (error || !data || data.length !== 1) {
    failed += 1;
    console.error(`실패 ${g.table} ${g.key}: ${error?.message ?? `갱신 ${data?.length ?? 0}행`}`);
  }
}

// 다시 읽어 확인: 바꾼 칸은 after와 같고 가운뎃점, 반말, 합니다체, [cite]가 없다. 손대지 않은 칸은 백업과 같다.
const problems: string[] = [];
for (const g of byRow.values()) {
  const now = await readRow(g);
  if (!now) {
    problems.push(`${g.table} ${g.key}: 다시 읽기 실패`);
    continue;
  }
  for (const f of g.fields) {
    const after = ready.find((c) => rowId(c) === `${g.table}:${g.key}` && c.field === f)!.after;
    if (!sameValue(now[f], after)) problems.push(`${g.table} ${g.key}.${f}: 기대값과 다름`);
    for (const p of voiceProblems(now[f])) problems.push(`${g.table} ${g.key}.${f}: ${p}`);
  }
  for (const [f, v] of Object.entries(g.row)) {
    if (g.fields.includes(f) || f === "updated_at") continue;
    if (!sameValue(now[f], v)) problems.push(`${g.table} ${g.key}.${f}: 손대지 않은 칸이 바뀜`);
  }
}
console.log(`적용 ${byRow.size - failed}/${byRow.size}행(${ready.length}칸), 확인 문제 ${problems.length}건`);
for (const x of problems) console.log(" -", x);
process.exit(failed || problems.length || count("drift") || count("missing") ? 1 : 0);
