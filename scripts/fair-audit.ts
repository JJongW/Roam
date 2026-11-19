/**
 * 박람회 운영 데이터 점검(읽기 전용). 행사 행, 참가, 부스, 도면 등록, brands.v1 파일 브랜드의 운영 상태를 센다.
 *
 *   npm run fair:audit -- --match moongu --match 문구전 --brands data/brands/moongu-artists-2026-winter.json [--json <보고서.json>]
 *
 * - **쓰지 않는다.** 저장소 읽기만 부른다(intake:dry-run, intake:backup과 같은 길).
 * - `.env`는 이 체크아웃, 없으면 본 체크아웃(git common dir의 부모)에서 읽는다. 값은 출력하지 않는다.
 * - 허락(participant_permission)은 그 테이블이 운영에 있을 때만 읽는다(hasParticipantOutreach).
 */
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
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
const all = (name: string) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const match = all("--match");
const brandsPath = all("--brands")[0];
const jsonOut = all("--json")[0];
if (!match.length || !brandsPath) {
  console.error("사용법: npm run fair:audit -- --match <slug나 이름 조각> [--match …] --brands <brands.v1.json> [--json <보고서.json>]");
  process.exit(1);
}

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 점검이 아니라 멈춰요");
  process.exit(1);
}
const { brandsFileSchema } = await import("@/lib/intake/brands-schema");
const { auditFair } = await import("@/lib/intake/fair-audit");
const { FLOORPLANS } = await import("@/lib/floorplans");

const repo = await getRepository();
const brands = brandsFileSchema.parse(JSON.parse(readFileSync(brandsPath, "utf8")));
const exhibitions = (await repo.listExhibitions({ limit: 500 })).data;
const needles = match.map((m) => m.toLowerCase());
const candidates = exhibitions.filter((e) => needles.some((n) => e.slug.toLowerCase().includes(n) || e.name.toLowerCase().includes(n)));
const [graph, fields, boothLists, outreach] = await Promise.all([
  repo.loadExhibitorGraph(),
  repo.listProfileFields(),
  Promise.all(candidates.map(async (e) => [e.id, (await repo.listBoothsByExhibitionId(e.id)).length] as const)),
  repo.hasParticipantOutreach(),
]);
const permissions: Record<string, { status: string; allowedUse: string[] }> = {};
if (outreach)
  for (const e of candidates)
    for (const p of await repo.listParticipantPermissions(e.id)) permissions[p.participantId] = { status: p.status, allowedUse: p.allowedUse };

const report = auditFair({
  exhibitions,
  match,
  graph,
  fields,
  boothCounts: Object.fromEntries(boothLists),
  floorplanSlugs: Object.keys(FLOORPLANS),
  brands,
  permissions,
});

console.log(`운영 행사 slug: ${exhibitions.map((e) => e.slug).join(", ")}`);
console.log(`운영 행사 ${exhibitions.length}개 중 "${match.join(", ")}" 후보 ${report.fairs.length}개`);
for (const f of report.fairs)
  console.log(`  ${f.slug} ${f.name} ${f.startDate}~${f.endDate} ${f.venue} | 참가 ${f.participants}, 브랜드 ${f.brands}, 부스 ${f.booths}, 도면 ${f.floorplan ? "있음" : "없음"}`);
console.log(`참가 허락 테이블(participant_permission): ${outreach ? "있음" : "없음(옛 brand_contact 길)"}`);
const s = report.summary;
console.log(
  `파일 브랜드 ${s.fileBrands}곳 → 운영에 있음 ${s.found}, 없음 ${s.missing.length}, 중복 ${s.duplicated.length}, 이름만 같음 ${s.nameOnly.length}, 후보 행사에 이어짐 ${s.linkedToFair}`,
);
for (const b of report.brands)
  console.log(
    `  ${b.key} ${b.name}: 브랜드 ${b.exhibitorIds.join(",") || "없음"}(${b.matchedBy.join("+") || "-"})` +
      `${b.nameOnly.length ? `, 이름만 같음 ${b.nameOnly.join(",")}` : ""}` +
      `, 이어진 행사 ${b.linkedFairs.join(",") || "없음"}(전체 참가 ${b.allFairs.join(",") || "없음"})` +
      `, 칸 ${Object.entries(b.fields).map(([k, v]) => `${k}:${v}`).join(" ") || "없음"}` +
      `, 사진 ${b.photoCount}장, 허락 ${Object.values(b.permissions).map((p) => `${p.status}/${p.allowedUse.join("+")}`).join(",") || "없음"}`,
  );
if (jsonOut) {
  writeFileSync(jsonOut, `${JSON.stringify({ takenAt: new Date().toISOString(), match, brandsFile: brandsPath, permissionTable: outreach, ...report }, null, 2)}\n`);
  console.log(`  보고서 → ${jsonOut}`);
}
console.log("운영 DB에는 쓰지 않았어요");
