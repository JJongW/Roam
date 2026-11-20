/**
 * 참가 단위 연결 후보 채우기 — Ted가 손으로 돌린다. 워커와 cron에 넣지 않는다.
 *
 * 왜(2026-11-20 Ted): "부스는 별개라니까." 0057 후보가 부스를 필수로 둬서, 브랜드 먼저 인입(brands.v1)으로
 * 들어간 참가의 "이름만 같은 기존 브랜드"는 미리보기에만 보이고 어디에도 쌓이지 않았다. 0073 뒤로는 인입이
 * 바로 후보를 쌓는다. 이 스크립트는 **이미 들어간** 참가를 한 박람회씩 훑어 같은 후보를 쌓는다
 * (예: 새해 준비상점 ny-311 네츄럴굿띵스 ↔ 하우스 아카이브의 exr_xpip468cmupq9q23).
 * 기록: docs/decisions/2026-11-20_브랜드-대조는-참가-단위.md
 *
 *   npm run link-candidates:backfill -- <행사 slug>            # 드라이런(기본, 쓰지 않음)
 *   npm run link-candidates:backfill -- <행사 slug> --apply    # 운영에 씀(행사 slug 입력 확인)
 *   echo <행사 slug> | npm run link-candidates:backfill -- <행사 slug> --apply   # 확인을 파이프로
 *
 * 순서
 *   0. 0073을 먼저 SQL Editor에서 돌린다. 안 돌렸으면 4의 넣기가 not null이나 onConflict 오류로 실패하고
 *      아무것도 쓰지 않는다(REST로는 칸 정의를 못 읽어 미리 확인하지 않는다)
 *   1. 운영 읽기: 브랜드 그래프 전체, 모든 박람회 부스(신원 키), 이 박람회
 *   2. 백업: 이 박람회 참가와 후보 전부를 data/intake/_backup/에 뜬다(드라이런도 뜬다, gitignore)
 *   3. 계획 출력: 참가 → 기존 브랜드, 맞은 이름. 이미 낸 짝은 건너뛴다(멱등)
 *   4. --apply일 때만, slug를 그대로 입력하면 후보를 넣는다(같은 짝은 unique로 다시 안 생김)
 *   5. 다시 읽어 새로 생긴 수를 확인한다. 끝나면 --apply 없이 다시 돌려 0건인지 본다
 * 되돌리기: 백업의 candidateIdsBefore에 없는 이 박람회 후보 중 pending만 지우면 된다(파일 끝에 쿼리를 찍는다).
 *
 * 계획은 src/lib/exhibitor/participant-candidates.ts(순수). `.env`는 이 체크아웃, 없으면 본 체크아웃에서
 * 읽는다. 값은 출력하지 않는다.
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
const slug = argv.find((a) => !a.startsWith("--"));
const apply = argv.includes("--apply");
if (!slug) {
  console.error("사용법: npm run link-candidates:backfill -- <행사 slug> [--apply]");
  process.exit(1);
}

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 작업이 아니라 멈춰요");
  process.exit(1);
}
const { createServiceClient } = await import("@/lib/supabase/server");
const { existingExhibitors } = await import("@/lib/exhibitor/service");
const { candidateKeys } = await import("@/lib/exhibitor/plan");
const { planParticipantNameCandidates } = await import("@/lib/exhibitor/participant-candidates");

const repo = await getRepository();
const db = createServiceClient();

// 1. 읽기
const exhibitions = await repo.listExhibitions({ limit: 500 });
const exhibition = exhibitions.data.find((e) => e.slug === slug);
if (!exhibition) {
  console.error(`✗ 행사를 찾을 수 없어요: ${slug}`);
  process.exit(1);
}
const [graph, ...perExhibition] = await Promise.all([
  repo.loadExhibitorGraph(),
  ...exhibitions.data.map((e) => repo.listBoothsFull(e.id)),
]);
const existing = existingExhibitors(graph, perExhibition.flat());
const plan = planParticipantNameCandidates({
  exhibitionId: exhibition.id,
  graph,
  existing,
  decidedCandidates: candidateKeys(graph.candidates),
});

// 2. 백업
const participants = graph.participants.filter((p) => p.exhibitionId === exhibition.id);
const pIds = new Set(participants.map((p) => p.id));
const candRows: Record<string, unknown>[] = [];
for (let from = 0; ; from += 1000) {
  const { data, error } = await db.from("exhibitor_link_candidate").select("*").order("id").range(from, from + 999);
  // PostgREST는 실패해도 예외를 안 던진다. 0건으로 위장되지 않게 직접 본다.
  if (error || !data) {
    console.error(`✗ 연결 후보를 읽지 못했어요: ${error?.message ?? "data 없음"}`);
    process.exit(1);
  }
  candRows.push(...(data as Record<string, unknown>[]));
  if (data.length < 1000) break;
}
const at = new Date().toISOString().replace(/[:.]/g, "-");
const out = resolve(`data/intake/_backup/link-candidates-${slug}-before-${at}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(
  out,
  `${JSON.stringify(
    {
      slug,
      exhibitionId: exhibition.id,
      takenAt: new Date().toISOString(),
      participants,
      candidates: candRows,
      candidateIdsBefore: candRows.map((r) => r.id as string),
      planned: plan.candidates,
    },
    null,
    1,
  )}\n`,
);
console.log(`✓ 백업 → ${out}`);

// 3. 계획
const already = candRows.filter((r) => typeof r.participant_id === "string" && pIds.has(r.participant_id)).length;
console.log(`${slug}: 참가 ${participants.length}곳, 이 박람회의 기존 후보 ${already}건 → 새로 올릴 후보 ${plan.candidates.length}건`);
for (const c of plan.candidates)
  console.log(`  ${c.participantName} (${c.participantId}, 지금 브랜드 ${c.fromExhibitorId}) → ${c.exhibitorName} (${c.exhibitorId}), ${c.reason}`);

if (!apply) {
  console.log("드라이런이라 운영 DB에 쓰지 않았어요. 적용은 --apply");
  process.exit(0);
}
if (plan.candidates.length === 0) {
  console.log("올릴 것이 없어요. 아무것도 쓰지 않았어요");
  process.exit(0);
}

// 4. 확인(터미널 입력 또는 파이프 한 줄)
const answer = await new Promise<string>((done) => {
  if (process.stdin.isTTY) process.stdout.write(`운영에 씁니다. 계속하려면 ${slug} 를 그대로 입력하세요: `);
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
if (answer !== slug) {
  console.log("멈췄어요. 아무것도 쓰지 않았어요");
  process.exit(1);
}

// 저장소의 applyExhibitorPlan이 onConflict participant_id,exhibitor_id(0073)로 넣는다. 0073 전이면 여기서 실패한다.
const applied = await repo.applyExhibitorPlan(plan.exhibitorPlan);
console.log(`✓ 후보 ${applied.candidates}건 넣었어요`);

// 5. 다시 읽어 확인
const after = await repo.loadExhibitorGraph();
const again = planParticipantNameCandidates({
  exhibitionId: exhibition.id,
  graph: after,
  existing: existingExhibitors(after, perExhibition.flat()),
  decidedCandidates: candidateKeys(after.candidates),
});
console.log(`다시 세면 새로 올릴 후보 ${again.candidates.length}건이에요(0이어야 해요). /admin/brands/links에서 보세요`);
console.log(
  `되돌리기(SQL Editor): delete from exhibitor_link_candidate where status = 'pending' and booth_id is null and participant_id in (select id from exhibition_participant where exhibition_id = '${exhibition.id}') and id not in (백업 candidateIdsBefore);`,
);
