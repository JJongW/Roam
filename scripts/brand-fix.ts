/**
 * 브랜드 고치기(brand-fix.v1) — Ted가 손으로 돌린다. 자동으로 돌지 않는다(워커, cron에 넣지 않는다).
 *
 *   npm run brand-fix -- --manifest data/brand-fixes/<파일>.json            # 드라이런(기본, 쓰지 않음)
 *   npm run brand-fix -- --manifest data/brand-fixes/<파일>.json --apply    # 운영에 씀(행사 slug 입력 확인)
 *   echo <행사 slug> | npm run brand-fix -- --manifest <파일> --apply       # 확인을 파이프로
 *
 * 순서
 *   1. 운영 읽기: 브랜드, 이 행사 참가 사실, 프로필 칸, 지울 참가 사실에 딸린 행 수
 *   2. 백업: 읽은 행 전부를 data/intake/_backup/에 뜬다(드라이런도 뜬다, gitignore)
 *   3. 계획 출력: 작업마다 write / same / conflict / blocked 와 옛 값 → 새 값
 *   4. --apply일 때만, slug를 그대로 입력하면 write만 쓴다. 칸은 읽은 뒤 바뀌었으면 쓰지 않는다(compare-and-set)
 * 끝나면 --apply 없이 다시 돌려 전부 same인지 본다.
 *
 * 계획은 src/lib/intake/brand-fix.ts(순수). `.env`는 이 체크아웃, 없으면 본 체크아웃에서 읽는다. 값은 출력하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline";
import { config as loadEnv } from "dotenv";

function findEnvPath(): string {
  const local = resolve(".env");
  if (existsSync(local)) return local;
  const common = execFileSync("git", ["rev-parse", "--path-format=absolute", "--git-common-dir"], { encoding: "utf8" }).trim();
  const main = join(dirname(common), ".env");
  if (existsSync(main)) return main;
  throw new Error(".env를 찾지 못했어요(이 체크아웃과 본 체크아웃 모두)");
}
loadEnv({ path: findEnvPath(), quiet: true });
process.env.ROAM_WORKER = "1";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const one = (n: string) => {
  const i = argv.indexOf(n);
  return i >= 0 ? argv[i + 1] : undefined;
};
const manifestPath = one("--manifest");
const apply = argv.includes("--apply");
const actor = one("--actor") ?? "ted:brand-fix";
if (!manifestPath) {
  console.error("사용법: npm run brand-fix -- --manifest <brand-fix.v1.json> [--apply] [--actor <이름>]");
  process.exit(1);
}

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 작업이 아니라 멈춰요");
  process.exit(1);
}
const { createServiceClient } = await import("@/lib/supabase/server");
const { parseFieldValue } = await import("@/lib/brands/profile");
const { brandFixFileSchema, planBrandFix, summarizeFix } = await import("@/lib/intake/brand-fix");
type Row = Record<string, unknown>;

const file = brandFixFileSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));
const repo = await getRepository();
const db = createServiceClient();
const exhibitionId = await repo.getExhibitionIdBySlug(file.exhibitionSlug);
if (!exhibitionId) {
  console.error(`✗ 행사 ${file.exhibitionSlug}가 운영에 없어요`);
  process.exit(1);
}

/** PostgREST는 실패해도 예외를 안 던진다. 읽기 실패를 "0건"으로 보지 않게 여기서 던진다. */
function must<T>(res: { data: T | null; error: { message: string } | null }, what: string): T {
  if (res.error) throw new Error(`${what} 실패: ${res.error.message}`);
  if (res.data == null) throw new Error(`${what} 실패: 결과가 없어요`);
  return res.data;
}
const count = async (table: string, column: string, value: string) =>
  must(await db.from(table).select("id", { count: "exact" }).eq(column, value).limit(1000), `${table} 읽기`).length;
const countPermission = async (participantId: string) =>
  must(await db.from("participant_permission").select("participant_id").eq("participant_id", participantId), "허락 읽기").length;
const countBooth = async (participantId: string) =>
  must(await db.from("booth_participant").select("booth_id").eq("participant_id", participantId), "부스 배정 읽기").length;

// 1. 읽기
const exIds = [...new Set(file.ops.map((o) => o.exhibitorId))];
const exRows = must(await db.from("exhibitor").select("id,canonical_name,aliases").in("id", exIds), "브랜드 읽기") as Row[];
const ptRows = must(
  await db.from("exhibition_participant").select("*").in("exhibitor_id", exIds),
  "참가 사실 읽기",
) as Row[];
const fields = await repo.listProfileFields({ exhibitorIds: exIds });
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : []);
const participants = new Map(
  ptRows
    .filter((r) => r.exhibition_id === exhibitionId)
    .map((r) => [
      String(r.exhibitor_id),
      {
        id: String(r.id),
        exhibitorId: String(r.exhibitor_id),
        displayName: String(r.display_name),
        aliases: strs(r.aliases),
        metadata: (r.metadata ?? {}) as Record<string, unknown>,
      },
    ]),
);
const otherParticipations = new Map<string, number>();
for (const r of ptRows)
  if (r.exhibition_id !== exhibitionId) otherParticipations.set(String(r.exhibitor_id), (otherParticipations.get(String(r.exhibitor_id)) ?? 0) + 1);
const dependents = new Map<string, { permissions: number; boothAssignments: number; linkCandidates: number; participantFields: number; outreachLogs: number }>();
for (const o of file.ops) {
  if (o.op !== "removeParticipation") continue;
  const p = participants.get(o.exhibitorId);
  if (!p) continue;
  dependents.set(p.id, {
    permissions: await countPermission(p.id),
    boothAssignments: await countBooth(p.id),
    linkCandidates: await count("exhibitor_link_candidate", "participant_id", p.id),
    participantFields: await count("brand_profile_field", "participant_id", p.id),
    outreachLogs: await count("brand_outreach_log", "participant_id", p.id),
  });
}
const plans = planBrandFix(file, {
  exhibitionId,
  exhibitors: new Map(exRows.map((r) => [String(r.id), { canonicalName: String(r.canonical_name), aliases: strs(r.aliases) }])),
  participants,
  otherParticipations,
  dependents,
  fields,
});

// 2. 백업
const at = new Date().toISOString().replace(/[:.]/g, "-");
const backup = resolve(`data/intake/_backup/brand-fix-${file.exhibitionSlug}-${apply ? "before-apply" : "dry-run"}-${at}.json`);
mkdirSync(dirname(backup), { recursive: true });
writeFileSync(
  backup,
  `${JSON.stringify({ takenAt: new Date().toISOString(), manifest: manifestPath, exhibitionId, exhibitors: exRows, participants: ptRows, fields, dependents: Object.fromEntries(dependents) }, null, 1)}\n`,
);
console.log(`✓ 백업 → ${backup}`);

// 3. 계획
const show = (v: unknown) => (typeof v === "string" ? (v.length > 60 ? `${JSON.stringify(v.slice(0, 60))}…(${v.length}자)` : JSON.stringify(v)) : JSON.stringify(v));
console.log(`행사 ${file.exhibitionSlug}(${exhibitionId}), ${apply ? "적용" : "드라이런(쓰지 않음)"}`);
for (const p of plans) {
  const label = p.op.op;
  console.log(`${p.action.padEnd(8)} ${p.op.key} ${label} — ${p.message}`);
  if (p.action === "write") for (const c of p.changes) console.log(`           ${c.what}: ${show(c.from)} → ${show(c.to)}`);
}
const s = summarizeFix(plans);
console.log(`brand-fix ${plans.length}건 → 쓸 것 ${s.write}, 같음 ${s.same}, 충돌 ${s.conflict}, 막힘 ${s.blocked}`);

if (!apply) {
  console.log("드라이런이라 운영 DB에 쓰지 않았어요. 적용은 --apply");
  process.exit(0);
}
if (s.write === 0) {
  console.log("쓸 것이 없어요. 아무것도 쓰지 않았어요");
  process.exit(0);
}

// 4. 확인(터미널 입력 또는 파이프 한 줄)
const answer = await new Promise<string>((done) => {
  if (process.stdin.isTTY) process.stdout.write(`운영에 씁니다. 계속하려면 ${file.exhibitionSlug} 를 그대로 입력하세요: `);
  const rl = createInterface({ input: process.stdin, terminal: false });
  let got = false;
  rl.once("line", (line) => {
    got = true;
    rl.close();
    done(line.trim());
  });
  rl.once("close", () => {
    if (!got) done("");
  });
});
if (answer !== file.exhibitionSlug) {
  console.log("멈췄어요. 아무것도 쓰지 않았어요");
  process.exit(1);
}

const now = () => new Date().toISOString();
let written = 0;
for (const p of plans) {
  if (p.action !== "write" || !p.write) continue;
  const w = p.write;
  if (w.kind === "deleteParticipant") {
    const del = must(await db.from("exhibition_participant").delete().eq("id", w.participantId).select("id"), "참가 사실 지우기") as Row[];
    if (del.length !== 1) throw new Error(`${p.op.key}: 참가 사실을 지우지 못했어요(${del.length}행)`);
  } else if (w.kind === "rename") {
    const ex = must(
      await db
        .from("exhibitor")
        .update({ canonical_name: w.exhibitor.canonicalName, aliases: w.exhibitor.aliases, updated_at: now() })
        .eq("id", p.op.exhibitorId)
        .select("id"),
      "브랜드 이름 바꾸기",
    ) as Row[];
    if (ex.length !== 1) throw new Error(`${p.op.key}: 브랜드 이름을 바꾸지 못했어요`);
    if (w.participant) {
      const pt = must(
        await db
          .from("exhibition_participant")
          .update({ display_name: w.participant.displayName, aliases: w.participant.aliases, updated_at: now() })
          .eq("id", w.participant.id)
          .select("id"),
        "표기 이름 바꾸기",
      ) as Row[];
      if (pt.length !== 1) throw new Error(`${p.op.key}: 표기 이름을 바꾸지 못했어요`);
    }
  } else if (w.kind === "participantMetadata") {
    const pt = must(
      await db.from("exhibition_participant").update({ metadata: w.metadata, updated_at: now() }).eq("id", w.participantId).select("id"),
      "분류 바꾸기",
    ) as Row[];
    if (pt.length !== 1) throw new Error(`${p.op.key}: 분류를 바꾸지 못했어요`);
  } else {
    const checked = parseFieldValue({ exhibitorId: p.op.exhibitorId }, w.field, w.value);
    if (!checked.ok) throw new Error(`${p.op.key}: ${w.field} 값이 틀려요(${checked.message})`);
    const res = await repo.upsertProfileFieldIfUnchanged(
      { subject: { exhibitorId: p.op.exhibitorId }, field: w.field, value: checked.value, sources: w.sources, status: "collected", actor },
      w.expected,
    );
    if (!res.ok) {
      console.log(`  ! ${p.op.key} ${w.field}: 읽은 뒤 칸이 바뀌어 쓰지 않았어요(${res.reason})`);
      continue;
    }
  }
  written++;
  console.log(`  ✓ ${p.op.key} ${p.op.op}`);
}
console.log(`끝났어요. ${written}건 씀. 같은 명령을 --apply 없이 다시 돌려 전부 같음이 나오는지 보세요`);
