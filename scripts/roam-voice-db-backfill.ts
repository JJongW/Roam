/**
 * 운영 DB에 남은 워커 초안의 반말, 한다체, 합니다체 문장 끝을 해요체로 바꾼다(모든 행사).
 *
 * 왜: PR #176, #177과 `roam-voice-db.mjs`는 레포에 원천이 있는 행사만 고쳤다. 워커 초안기가
 * 만든 추천 이유("~할 수 있어.", "~할 수 있다.")는 레포에 원천이 없어 운영에만 976칸 남았다
 * (카페쇼 552, 시웨 마곡 182, DDP 디자인페어 94, 서울가구쇼 94, 마곡리빙마켓 47 등, 2026-11-19).
 * 이 칸들은 웹 행사 홈 관심 피드에 그대로 나간다. 브랜드 규칙 §5(2026-11-18 Ted 결정): Roam이 쓰는
 * 사용자 문구는 전부 해요체.
 *
 * 바꾸는 규칙은 `src/lib/booth/roam-voice.ts` 하나다(초안기의 말투 문과 같은 함수). 문장 끝 낱말만
 * 바꾸고, 모르는 끝이 하나라도 있거나 내용 문제(못 찾았다는 문장, [cite] 찌꺼기, 호칭)가 걸린 칸은
 * **바꾸지 않고 review 목록**에 남긴다. LLM은 부르지 않는다.
 *
 * 범위(Roam이 쓴 칸만, 브랜드 규칙 §1):
 * - booth_enrichment: roam_interpretation, recommendation_reasons, timing, things_to_do,
 *   conversation_prompts, tips
 * - exhibition: tips(행사 안내)
 * 안 건드리는 것: booth_enrichment.summary(주최 디렉터리 원문이 섞여 있다), booth의 소개,
 * brand_profile_field(브랜드 원문), booth_event(주최 프로그램), exhibition.description.
 *
 *   # 드라이런(기본): 운영은 읽기만, 바꿀 칸과 review를 diff 파일로 쓴다
 *   npx vite-node -c worker/vite.config.ts scripts/roam-voice-db-backfill.ts
 *   # 적용: 전체 행 백업 → 바뀐 칸만 갱신 → 다시 읽어 확인
 *   npx vite-node -c worker/vite.config.ts scripts/roam-voice-db-backfill.ts -- --apply
 *   # diff 위치 바꾸기
 *   ... -- --diff <경로>
 *
 * 되돌리기: node scripts/restore-roam-voice.mjs data/intake/_backup/roam-voice-backfill-before-<ISO>.json [--apply]
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { toHaeyoValue } from "@/lib/booth/roam-voice";

const APPLY = process.argv.includes("--apply");
const diffArg = process.argv.indexOf("--diff");
const DEFAULT_DIFF = "/Users/sinjong-won/.claude/jobs/1b54bc24/tmp/db-voice-diff-3.json";
const DIFF_PATH = diffArg > 0 ? process.argv[diffArg + 1] : DEFAULT_DIFF;
const ROOT = fileURLToPath(new URL("..", import.meta.url));

/** worktree에서 돌리면 .env가 없으니 본 체크아웃(git common dir의 부모)의 .env를 쓴다. 값은 읽기만 한다. */
function findEnvPath(): string {
  const local = join(ROOT, ".env");
  if (existsSync(local)) return local;
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  const main = join(dirname(common), ".env");
  if (existsSync(main)) return main;
  throw new Error(".env를 찾지 못했어요(이 체크아웃과 본 체크아웃 모두)");
}

/** vite-node로 돌아 Next.js의 .env 자동 로드를 못 받는다. 값은 출력하지 않는다. */
function loadSupabaseCreds(): { url: string; key: string } {
  const text = readFileSync(findEnvPath(), "utf8");
  const get = (name: string) =>
    text.match(new RegExp(`^${name}=(.*)$`, "m"))?.[1]?.trim().replace(/^["']|["']$/g, "");
  const url = get("NEXT_PUBLIC_SUPABASE_URL");
  const key = get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error(".env에 Supabase URL 또는 서비스 키가 없어요");
  return { url, key };
}

/** jsonb는 객체 키 순서를 바꿔 돌려준다. 키를 정렬해 비교한다(배열 순서는 본다). */
const canon = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(canon)
    : v && typeof v === "object"
      ? Object.fromEntries(
          Object.keys(v)
            .sort()
            .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
        )
      : v;
const sameValue = (a: unknown, b: unknown) => JSON.stringify(canon(a ?? null)) === JSON.stringify(canon(b ?? null));

const ENRICHMENT_FIELDS = [
  "roam_interpretation",
  "recommendation_reasons",
  "timing",
  "things_to_do",
  "conversation_prompts",
  "tips",
] as const;
const EXHIBITION_FIELDS = ["tips"] as const;

type Row = Record<string, unknown>;
interface Plan {
  table: "exhibition" | "booth_enrichment";
  keyCol: "id" | "booth_id";
  key: string;
  slug: string | null;
  code: string | null;
  row: Row;
  changes: Record<string, { before: unknown; after: unknown }>;
}
interface Review {
  table: string;
  key: string;
  slug: string | null;
  code: string | null;
  field: string;
  unsure: string[];
  flags: string[];
  before: unknown;
  /** 규칙으로 바꿀 수 있는 데까지 바꾼 값. 참고용이고 적용하지 않는다. */
  partial: unknown;
}

async function all(sb: SupabaseClient, table: string, cols: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from(table).select(cols).range(from, from + 999);
    // PostgREST는 실패해도 예외를 안 던진다. 0건으로 위장되지 않게 직접 본다.
    if (error || !data) throw new Error(`${table} 읽기 실패: ${error?.message ?? "data 없음"}`);
    out.push(...(data as unknown as Row[]));
    if (data.length < 1000) return out;
  }
}

async function plan(sb: SupabaseClient) {
  const plans: Plan[] = [];
  const review: Review[] = [];
  const consider = (
    base: Omit<Plan, "changes">,
    fields: readonly string[],
  ) => {
    const changes: Plan["changes"] = {};
    for (const f of fields) {
      const before = base.row[f];
      if (before == null) continue;
      const r = toHaeyoValue(before);
      if (!r.changed && !r.unsure.length) continue; // 이미 해요체이거나 명사로 끝난 메모
      if (r.unsure.length || r.flags.length) {
        review.push({ table: base.table, key: base.key, slug: base.slug, code: base.code, field: f, unsure: r.unsure, flags: r.flags, before, partial: r.value });
        continue;
      }
      changes[f] = { before, after: r.value };
    }
    if (Object.keys(changes).length) plans.push({ ...base, changes });
  };

  const exhibitions = await all(sb, "exhibition", "*");
  const slugOf = new Map(exhibitions.map((e) => [e.id as string, e.slug as string]));
  for (const e of exhibitions)
    consider({ table: "exhibition", keyCol: "id", key: e.id as string, slug: e.slug as string, code: null, row: e }, EXHIBITION_FIELDS);

  const booths = await all(sb, "booth", "id,code,exhibition_id");
  const boothById = new Map(booths.map((b) => [b.id as string, b]));
  const enrich = await all(sb, "booth_enrichment", "*");
  for (const e of enrich) {
    const b = boothById.get(e.booth_id as string);
    consider(
      {
        table: "booth_enrichment",
        keyCol: "booth_id",
        key: e.booth_id as string,
        slug: b ? (slugOf.get(b.exhibition_id as string) ?? null) : null,
        code: (b?.code as string | undefined) ?? null,
        row: e,
      },
      ENRICHMENT_FIELDS,
    );
  }
  return { plans, review };
}

function tally(plans: Plan[], review: Review[]) {
  const byField: Record<string, number> = {};
  const bySlug: Record<string, { auto: number; review: number }> = {};
  for (const p of plans)
    for (const f of Object.keys(p.changes)) {
      byField[`${p.table}.${f}`] = (byField[`${p.table}.${f}`] ?? 0) + 1;
      const s = (bySlug[p.slug ?? "?"] ??= { auto: 0, review: 0 });
      s.auto += 1;
    }
  for (const r of review) (bySlug[r.slug ?? "?"] ??= { auto: 0, review: 0 }).review += 1;
  const fields = Object.values(byField).reduce((a, b) => a + b, 0);
  return { rows: plans.length, fields, review: review.length, byField, bySlug };
}

const { url, key } = loadSupabaseCreds();
const sb = createClient(url, key, { auth: { persistSession: false } });
const { plans, review } = await plan(sb);
const counts = tally(plans, review);
writeFileSync(
  DIFF_PATH,
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      counts,
      review,
      diffs: plans.flatMap((p) =>
        Object.entries(p.changes).map(([field, { before, after }]) => ({
          table: p.table,
          id: p.key,
          slug: p.slug,
          code: p.code,
          field,
          before,
          after,
        })),
      ),
    },
    null,
    1,
  ),
);
console.log("diff:", DIFF_PATH);
console.log("바꿀 칸:", counts.fields, "행:", counts.rows, "review(안 바꿈):", counts.review);
console.log("byField:", JSON.stringify(counts.byField));
console.log("bySlug:", JSON.stringify(counts.bySlug));

if (!APPLY) {
  console.log("드라이런이에요. 적용하려면 --apply");
  process.exit(0);
}

// ── 백업 → 적용 → 확인 ────────────────────────────────────────────────────
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
mkdirSync(join(ROOT, "data/intake/_backup"), { recursive: true });
const backupPath = `data/intake/_backup/roam-voice-backfill-before-${stamp}.json`;
// restore-roam-voice.mjs가 읽는 형식 그대로: 행 전체를 뜨고, 되돌릴 칸은 fields에.
writeFileSync(
  join(ROOT, backupPath),
  JSON.stringify(
    {
      createdAt: new Date().toISOString(),
      entries: plans.map((p) => ({ table: p.table, keyCol: p.keyCol, key: p.key, fields: Object.keys(p.changes), row: p.row })),
    },
    null,
    1,
  ),
);
console.log("backup:", backupPath);

let failed = 0;
for (const p of plans) {
  const patch = Object.fromEntries(Object.entries(p.changes).map(([f, { after }]) => [f, after]));
  const { data, error } = await sb.from(p.table).update(patch).eq(p.keyCol, p.key).select(p.keyCol);
  // PostgREST는 실패해도 예외를 안 던진다. 에러와 갱신 행 수를 직접 본다.
  if (error || !data || data.length !== 1) {
    failed += 1;
    console.error(`실패 ${p.table} ${p.key}: ${error?.message ?? `갱신 ${data?.length ?? 0}행`}`);
  }
}

// 다시 읽어 확인: 바꾼 칸은 기대값과 같고 반말, 합니다체가 없다. 손대지 않은 칸은 백업과 같다.
const problems: string[] = [];
for (const p of plans) {
  const { data, error } = await sb.from(p.table).select("*").eq(p.keyCol, p.key).limit(1);
  if (error || !data?.length) {
    problems.push(`${p.table} ${p.key}: 다시 읽기 실패`);
    continue;
  }
  const now = data[0] as Row;
  for (const [f, { after }] of Object.entries(p.changes)) {
    if (!sameValue(now[f], after)) problems.push(`${p.table} ${p.key}.${f}: 기대값과 다름`);
    // unsure에는 고친 뒤에도 남은 반말, 합니다체(voiceIssues)가 들어 있다.
    const left = toHaeyoValue(now[f]).unsure;
    if (left.length) problems.push(`${p.table} ${p.key}.${f}: 말투 남음 ${left.join(", ")}`);
  }
  for (const [f, v] of Object.entries(p.row)) {
    if (f in p.changes || f === "updated_at") continue;
    if (!sameValue(now[f], v)) problems.push(`${p.table} ${p.key}.${f}: 손대지 않은 칸이 바뀜`);
  }
}
console.log(`적용 ${plans.length - failed}/${plans.length}행, 확인 문제 ${problems.length}건`);
for (const x of problems.slice(0, 50)) console.log(" -", x);
process.exit(failed || problems.length ? 1 : 0);
