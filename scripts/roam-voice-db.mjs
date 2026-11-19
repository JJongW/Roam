// 운영 DB의 Roam 문구를 PR #176과 같게 맞춘다: 가운뎃점(·) 제거, 마곡 Roam summary 59건 해요체.
//
//   node scripts/roam-voice-db.mjs                 # 드라이런: 바꿀 칸만 계산해 diff 파일로 쓴다
//   node scripts/roam-voice-db.mjs --apply         # 백업 → 적용 → 다시 읽어 확인
//   node scripts/roam-voice-db.mjs --diff <경로>    # diff 파일 위치(기본 /tmp/db-voice-diff.json)
//
// 2026-11-18 Ted 결정. 브랜드나 주최 원문은 건드리지 않는다(브랜드 규칙 §1):
// - booth_enrichment.summary는 SIBF(Roam 저작)와 마곡 Roam 59건만. 하우스 아카이브와
//   마곡 디렉터리 원문 summary, 인입 description 계열은 손대지 않는다.
// - booth.description / long_description은 시드가 합성한 틀과 **정확히 같은 값**만 바꾼다.
// - exhibition은 Roam이 소개를 쓴 네 행사(SIBF, SIF, 하우스 아카이브, 마곡)만.
// - 행사 프로그램(booth_event)은 주최 원문이라, 관심 행사 메모(watchlist)는 관리 화면용이라 뺀다.
//
// 되돌리기: node scripts/restore-roam-voice.mjs data/intake/_backup/roam-voice-before-<ISO>.json
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { existsSync as existsSyncEnv } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const APPLY = process.argv.includes("--apply");
const diffArg = process.argv.indexOf("--diff");
const DIFF_PATH = diffArg > 0 ? process.argv[diffArg + 1] : "/tmp/db-voice-diff.json";

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

/** 이 스크립트는 node로 직접 돌아 Next.js의 .env 자동 로드를 못 받는다. 값은 출력하지 않는다. */
function loadSupabaseCreds() {
  const text = readFileSync(findEnvPath(), "utf8");
  const get = (name) =>
    text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const key = get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error(".env에 Supabase URL 또는 서비스 키가 없어요");
  return { url, key };
}

// ── 바꾸는 규칙 (레포의 변경과 같다) ─────────────────────────────────────────
/** 쉼표가 어색해 "와/과"로 쓴 곳. 레포 시드와 같은 문장. */
const SPECIAL = [
  ["유·무선", "유무선"],
  ["무·논알코올", "무알코올, 논알코올"],
  ["코엑스 A·B1홀", "코엑스 A홀, B1홀"],
  ["A·B1홀은", "A홀, B1홀은"],
  ["실제 위치·크기로", "실제 위치와 크기로"],
  ["9/10(목)·9/11(금)", "9/10(목)과 9/11(금)"],
  ["9/12(토)·9/13(일)", "9/12(토)와 9/13(일)"],
];
function undot(s) {
  if (typeof s !== "string" || !s.includes("·")) return s;
  let t = s;
  for (const [a, b] of SPECIAL) t = t.split(a).join(b);
  return t.replace(/[ \t]*·[ \t]*/g, ", ");
}
/** 문자열, 배열, 객체(jsonb) 안 문자열을 모두 undot. */
function undotDeep(v) {
  if (typeof v === "string") return undot(v);
  if (Array.isArray(v)) return v.map(undotDeep);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, undotDeep(x)]));
  return v;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const HAMNIDA = /(습니다|입니다|합니다|됩니다)(?=[.!?,\s]|$)/;

/** 행사별로 손대는 enrichment Roam 칸. */
const ROAM_ENRICHMENT = [
  "roam_interpretation",
  "tips",
  "recommendation_reasons",
  "things_to_do",
  "timing",
  "memory_hooks",
  "conversation_prompts",
  "goods_keywords",
];
const ENRICHMENT_SCOPE = {
  "sibf-2026": [...ROAM_ENRICHMENT, "summary"],
  "sif-2026": ["goods_keywords"],
  "house-archive-2026": ["roam_interpretation"],
  "magok-livingmarket-2026": ROAM_ENRICHMENT, // summary는 아래 59건 표로만
};
const EXHIBITION_SCOPE = new Set(["sibf-2026", "sif-2026", "house-archive-2026", "magok-livingmarket-2026"]);
const SIBF_CATEGORY = { "아동·그림책": "아동, 그림책", "인문·사회": "인문, 사회", "예술·디자인": "예술, 디자인", "과학·기술": "과학, 기술" };
const MAGOK_59 = JSON.parse(readFileSync(new URL("./roam-voice-magok-59.json", import.meta.url), "utf8"));

async function all(sb, table, cols, filter) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let q = sb.from(table).select(cols).range(from, from + 999);
    if (filter) q = filter(q);
    const { data, error } = await q;
    if (error) throw new Error(`${table} 읽기 실패: ${error.message}`);
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

/** 바꿀 칸 계산. 결과: [{table, key, keyCol, row(전체), changes:{field:{before,after}}}] */
async function plan(sb) {
  const plans = [];
  const skipped = [];
  const push = (table, keyCol, row, changes) => {
    if (Object.keys(changes).length) plans.push({ table, keyCol, key: row[keyCol], row, changes });
  };

  const exhibitions = await all(sb, "exhibition", "*");
  const slugOf = Object.fromEntries(exhibitions.map((e) => [e.id, e.slug]));

  // 1) exhibition — Roam이 쓴 네 행사의 소개, 장소, 안내(jsonb tips)
  for (const e of exhibitions) {
    if (!EXHIBITION_SCOPE.has(e.slug)) continue;
    const ch = {};
    for (const f of ["description", "venue", "tips"]) {
      const after = undotDeep(e[f]);
      if (!same(after, e[f])) ch[f] = { before: e[f], after };
    }
    push("exhibition", "id", e, ch);
  }

  // 2) category — SIBF 분류 이름 넷(레포 시드와 같은 값일 때만)
  const cats = await all(sb, "category", "*");
  for (const c of cats) {
    if (slugOf[c.exhibition_id] !== "sibf-2026" || !(c.name in SIBF_CATEGORY)) continue;
    push("category", "id", c, { name: { before: c.name, after: SIBF_CATEGORY[c.name] } });
  }

  // 3) booth — 시드가 합성한 틀과 정확히 같은 값만
  const booths = await all(sb, "booth", "*");
  const boothById = Object.fromEntries(booths.map((b) => [b.id, b]));
  for (const b of booths) {
    const ch = {};
    if (b.description === `${b.name} · 부스 ${b.code}`)
      ch.description = { before: b.description, after: `${b.name} 부스 ${b.code}` };
    const facility = `${b.name} · ${b.code}. 참가사 부스가 아닌 행사장 부대 공간이에요.`;
    if (b.long_description === facility)
      ch.long_description = { before: b.long_description, after: `${b.name} ${b.code}. 참가사 부스가 아닌 행사장 부대 공간이에요.` };
    push("booth", "id", b, ch);
  }

  // 4) booth_enrichment — 행사별 Roam 칸
  const enrich = await all(sb, "booth_enrichment", "*");
  for (const e of enrich) {
    const booth = boothById[e.booth_id];
    const slug = booth && slugOf[booth.exhibition_id];
    const fields = ENRICHMENT_SCOPE[slug];
    if (!fields) continue;
    const ch = {};
    for (const f of fields) {
      const after = undotDeep(e[f]);
      if (!same(after, e[f])) ch[f] = { before: e[f], after };
    }
    if (slug === "magok-livingmarket-2026" && MAGOK_59[booth.code]) {
      const { before, after } = MAGOK_59[booth.code];
      // 레포에서 바꾸기 전 값(가운뎃점 그대로든 뺀 뒤든)과 같을 때만. 다르면 누가 고친 값이라 둔다.
      if (e.summary === before || e.summary === undot(before)) ch.summary = { before: e.summary, after };
      else if (e.summary !== after) skipped.push({ table: "booth_enrichment", key: e.booth_id, code: booth.code, reason: "summary가 레포의 바꾸기 전 값과 달라 둠", db: e.summary });
    }
    push("booth_enrichment", "booth_id", e, ch);
  }
  return { plans, skipped };
}

function summarize(plans) {
  const s = {};
  for (const p of plans) {
    s[p.table] ??= { rows: 0, fields: 0 };
    s[p.table].rows += 1;
    s[p.table].fields += Object.keys(p.changes).length;
  }
  return s;
}

const { url, key } = loadSupabaseCreds();
const sb = createClient(url, key, { auth: { persistSession: false } });
const { plans, skipped } = await plan(sb);
const counts = summarize(plans);
writeFileSync(
  DIFF_PATH,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      counts,
      skipped,
      diffs: plans.flatMap((p) =>
        Object.entries(p.changes).map(([field, { before, after }]) => ({ table: p.table, id: p.key, field, before, after })),
      ),
    },
    null,
    1,
  ),
);
console.log("diff:", DIFF_PATH);
console.log("counts:", JSON.stringify(counts));
console.log("skipped:", skipped.length);

if (!APPLY) {
  console.log("드라이런이에요. 적용하려면 --apply");
  process.exit(0);
}

// ── 백업 → 적용 → 확인 ────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(new URL("../data/intake/_backup/", import.meta.url), { recursive: true });
const backupPath = `data/intake/_backup/roam-voice-before-${stamp}.json`;
writeFileSync(
  new URL(`../${backupPath}`, import.meta.url),
  JSON.stringify(
    { createdAt: new Date().toISOString(), entries: plans.map((p) => ({ table: p.table, keyCol: p.keyCol, key: p.key, fields: Object.keys(p.changes), row: p.row })) },
    null,
    1,
  ),
);
console.log("backup:", backupPath);

let failed = 0;
for (const p of plans) {
  const patch = Object.fromEntries(Object.entries(p.changes).map(([f, { after }]) => [f, after]));
  const { data, error } = await sb.from(p.table).update(patch).eq(p.keyCol, p.key).select(p.keyCol);
  // PostgREST는 실패해도 예외를 안 던진다 — 에러와 갱신 행 수를 직접 본다.
  if (error || !data || data.length !== 1) {
    failed += 1;
    console.error(`실패 ${p.table} ${p.key}: ${error?.message ?? `갱신 ${data?.length ?? 0}행`}`);
  }
}

// 다시 읽어 확인: 바꾼 칸에 가운뎃점, 합니다체가 없고, 손대지 않은 칸은 백업과 같다.
const problems = [];
for (const p of plans) {
  const { data, error } = await sb.from(p.table).select("*").eq(p.keyCol, p.key).limit(1);
  if (error || !data?.length) {
    problems.push(`${p.table} ${p.key}: 다시 읽기 실패`);
    continue;
  }
  const now = data[0];
  for (const [f, { after }] of Object.entries(p.changes)) {
    if (!same(now[f], after)) problems.push(`${p.table} ${p.key}.${f}: 기대값과 다름`);
    const text = JSON.stringify(now[f]);
    if (text.includes("·")) problems.push(`${p.table} ${p.key}.${f}: 가운뎃점 남음`);
    if (p.table === "booth_enrichment" && f === "summary" && HAMNIDA.test(now[f] ?? "")) problems.push(`${p.table} ${p.key}.summary: 합니다체 남음`);
  }
  for (const [f, v] of Object.entries(p.row)) {
    if (f in p.changes || f === "updated_at") continue;
    if (!same(now[f], v)) problems.push(`${p.table} ${p.key}.${f}: 손대지 않은 칸이 바뀜`);
  }
}
console.log(`적용 ${plans.length - failed}/${plans.length}행, 확인 문제 ${problems.length}건`);
for (const x of problems.slice(0, 50)) console.log(" -", x);
process.exit(failed || problems.length ? 1 : 0);
