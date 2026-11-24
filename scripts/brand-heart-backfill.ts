/**
 * 이미 남은 부스 하트로 브랜드 하트 채우기(UI 23, 2026-11-24) — Ted가 손으로 돌린다. 워커와 cron에 넣지 않는다.
 *
 * 왜: UI 23부터 부스 하트가 그 부스의 브랜드 하트도 남긴다(PUT /api/me/notes/[boothId], src/lib/brands/follow.ts).
 * 그 전에 남긴 부스 하트에는 브랜드 하트가 없어, 다음 박람회 참가 알림을 받지 못한다. 이 스크립트가 그 줄을 채운다.
 * 기록: docs/decisions/2026-11-24_부스-하트가-브랜드도.md
 *
 *   npm run brand-heart:backfill                 # 드라이런(기본, 쓰지 않음)
 *   npm run brand-heart:backfill -- --apply      # 운영에 씀(확인 입력 backfill)
 *
 * 순서
 *   0. 0074를 먼저 SQL Editor에서 돌린다. 안 돌렸으면 source 칸이 없어 넣기가 실패하고 아무것도 쓰지 않는다
 *      (드라이런이 먼저 source 칸을 읽어 보고 없으면 멈춘다).
 *   1. 운영 읽기: 하트인 booth_note(hearted_at 있음 또는 interest must, curious), 부스 대표 브랜드, 기존 brand_heart.
 *   2. 계획 출력: (사용자, 브랜드) 새 줄 수. 사용자 id는 앞 8자만 찍는다. 이미 있는 줄은 건너뛴다(멱등).
 *   3. --apply일 때만, "backfill"을 입력하면 source='booth'로 넣는다(PK가 같은 줄은 다시 안 생김).
 *   4. 끝나면 --apply 없이 다시 돌려 0건인지 본다.
 * 되돌리기: 찍어 둔 목록 파일(data/intake/_backup/brand-heart-backfill-*.json)의 줄만 지우면 된다.
 *   source='booth'이고 created_at이 적용 시각인 줄이다.
 *
 * `.env`는 이 체크아웃, 없으면 본 체크아웃에서 읽는다. 값은 출력하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
const apply = argv.includes("--apply");

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 작업이 아니라 멈춰요");
  process.exit(1);
}
const { createServiceClient } = await import("@/lib/supabase/server");
const { planBrandHeartBackfill } = await import("@/lib/brands/follow");

const repo = await getRepository();
const db = createServiceClient();
type Row = Record<string, unknown>;

async function readAll(table: string, columns: string, filter?: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let from = 0; ; from += 1000) {
    let q = db.from(table).select(columns).range(from, from + 999);
    if (filter) q = q.or(filter);
    const { data, error } = await q;
    // PostgREST는 실패해도 예외를 안 던진다. 0건으로 위장되지 않게 직접 본다.
    if (error || !data) {
      console.error(`✗ ${table}를 읽지 못했어요: ${error?.message ?? "data 없음"}`);
      process.exit(1);
    }
    out.push(...(data as unknown as Row[]));
    if (data.length < 1000) break;
  }
  return out;
}

// 0. 0074 확인
{
  const { error } = await db.from("brand_heart").select("source").limit(1);
  if (error) {
    console.error(`✗ brand_heart.source를 읽지 못했어요(0074 적용 전?): ${error.message}`);
    process.exit(1);
  }
}

// 1. 읽기
const notes = await readAll("booth_note", "user_id, booth_id", "hearted_at.not.is.null,interest.in.(must,curious)");
const existing = await readAll("brand_heart", "user_id, exhibitor_id");
const heartedNotes = notes.map((r) => ({ userId: String(r.user_id), boothId: String(r.booth_id) }));
const links = await repo.listPrimaryBrandLinks([...new Set(heartedNotes.map((n) => n.boothId))]);

// 2. 계획
const plan = planBrandHeartBackfill({
  heartedNotes,
  links,
  existing: existing.map((r) => ({ userId: String(r.user_id), exhibitorId: String(r.exhibitor_id) })),
});
const linked = heartedNotes.filter((n) => links[n.boothId]).length;
console.log(
  `하트인 부스 노트 ${heartedNotes.length}건(대표 브랜드 있는 것 ${linked}건), 기존 브랜드 하트 ${existing.length}줄 → 새로 넣을 브랜드 하트 ${plan.length}줄`,
);
const users = new Set(plan.map((p) => p.userId));
console.log(`  사용자 ${users.size}명, 브랜드 ${new Set(plan.map((p) => p.exhibitorId)).size}곳`);
for (const p of plan.slice(0, 30)) console.log(`  ${p.userId.slice(0, 8)}… → ${p.exhibitorId} (부스 ${p.boothIds.join(", ")})`);
if (plan.length > 30) console.log(`  …외 ${plan.length - 30}줄`);

if (!apply) {
  console.log("드라이런이라 운영 DB에 쓰지 않았어요. 적용은 --apply");
  process.exit(0);
}
if (plan.length === 0) {
  console.log("넣을 것이 없어요. 아무것도 쓰지 않았어요");
  process.exit(0);
}

// 3. 확인
const answer = await new Promise<string>((done) => {
  if (process.stdin.isTTY) process.stdout.write("운영에 씁니다. 계속하려면 backfill 을 그대로 입력하세요: ");
  const rl = createInterface({ input: process.stdin, terminal: false });
  rl.once("line", (line) => {
    rl.close();
    done(line.trim());
  });
  rl.once("close", () => done(""));
});
if (answer !== "backfill") {
  console.log("입력이 달라 멈췄어요. 아무것도 쓰지 않았어요");
  process.exit(1);
}

const at = new Date().toISOString();
const out = resolve(`data/intake/_backup/brand-heart-backfill-${at.replace(/[:.]/g, "-")}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ appliedAt: at, rows: plan }, null, 1)}\n`);
console.log(`✓ 넣을 목록 → ${out}`);

let inserted = 0;
for (let i = 0; i < plan.length; i += 500) {
  const slice = plan.slice(i, i + 500);
  const { data, error } = await db
    .from("brand_heart")
    .upsert(
      slice.map((p) => ({ user_id: p.userId, exhibitor_id: p.exhibitorId, created_at: at, source: "booth" })),
      { onConflict: "user_id,exhibitor_id", ignoreDuplicates: true },
    )
    .select("user_id");
  if (error) {
    console.error(`✗ 넣기 실패(${inserted}줄까지 들어감): ${error.message}`);
    process.exit(1);
  }
  inserted += data?.length ?? 0;
}
console.log(`✓ 브랜드 하트 ${inserted}줄을 넣었어요. --apply 없이 다시 돌려 0줄인지 확인하세요`);
