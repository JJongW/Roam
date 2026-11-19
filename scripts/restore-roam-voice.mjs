// roam-voice-db.mjs --apply가 남긴 백업으로 운영 DB를 되돌린다. 백업에 적힌 칸(fields)만 되돌린다.
//
//   node scripts/restore-roam-voice.mjs data/intake/_backup/roam-voice-before-<ISO>.json          # 드라이런
//   node scripts/restore-roam-voice.mjs data/intake/_backup/roam-voice-before-<ISO>.json --apply
import { readFileSync } from "node:fs";
import { existsSync as existsSyncEnv } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const file = process.argv[2];
if (!file) {
  console.error("백업 파일 경로를 주세요");
  process.exit(1);
}
const APPLY = process.argv.includes("--apply");

/** worktree에서 돌리면 .env가 없으니 본 체크아웃(git common dir의 부모)의 .env를 쓴다. 값은 읽기만 한다. */
function findEnvPath() {
  const local = fileURLToPath(new URL("../.env", import.meta.url));
  if (existsSyncEnv(local)) return local;
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: fileURLToPath(new URL(".", import.meta.url)),
    encoding: "utf8",
  }).trim();
  const main = join(dirname(common), ".env");
  if (existsSyncEnv(main)) return main;
  throw new Error(".env를 찾지 못했어요(이 체크아웃과 본 체크아웃 모두)");
}

function loadSupabaseCreds() {
  const text = readFileSync(findEnvPath(), "utf8");
  const get = (name) =>
    text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const key = get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error(".env에 Supabase URL 또는 서비스 키가 없어요");
  return { url, key };
}

const backup = JSON.parse(readFileSync(file, "utf8"));
console.log(`백업 ${backup.createdAt}, ${backup.entries.length}행`);
if (!APPLY) {
  const fields = backup.entries.reduce((n, e) => n + e.fields.length, 0);
  console.log(`드라이런이에요. ${fields}칸을 되돌려요. 적용하려면 --apply`);
  process.exit(0);
}

const { url, key } = loadSupabaseCreds();
const sb = createClient(url, key, { auth: { persistSession: false } });
let failed = 0;
for (const e of backup.entries) {
  const patch = Object.fromEntries(e.fields.map((f) => [f, e.row[f]]));
  const { data, error } = await sb.from(e.table).update(patch).eq(e.keyCol, e.key).select(e.keyCol);
  if (error || !data || data.length !== 1) {
    failed += 1;
    console.error(`실패 ${e.table} ${e.key}: ${error?.message ?? `갱신 ${data?.length ?? 0}행`}`);
  }
}
console.log(`되돌림 ${backup.entries.length - failed}/${backup.entries.length}행`);
process.exit(failed ? 1 : 0);
