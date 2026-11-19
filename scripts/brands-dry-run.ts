/**
 * brands.v1 파일의 운영 미리보기(읽기 전용). `/admin/intake` 미리보기와 같은 계획(planBrandsFromRepository)을 세운다.
 *
 *   npm run brands:dry-run -- <brands.v1 파일> [--brands-only-if-missing] [--json <보고서.json>]
 *
 * - **쓰지 않는다.** 저장소의 읽기(list, load)만 부른다. 적용은 사람이 /admin/intake에서 미리보기를 보고 한다.
 * - `.env`는 이 체크아웃, 없으면 본 체크아웃(git common dir의 부모)에서 읽는다. 값은 출력하지 않는다.
 * - `--brands-only-if-missing`: 행사 행이 아직 없으면(배치도 전) 참가 사실 없이 브랜드 판정(새로, 기존에 이음,
 *   이름만 같음)만 본다. 브랜드 키는 파일의 exhibitionSlug 그대로라, 행사가 생긴 뒤 다시 돌려도 같은 브랜드를 찾는다.
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
const path = argv.find((a) => !a.startsWith("--") && argv[argv.indexOf(a) - 1] !== "--json");
const jsonIdx = argv.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : undefined;
const brandsOnly = argv.includes("--brands-only-if-missing");
if (!path) {
  console.error("사용법: npm run brands:dry-run -- <brands.v1 파일> [--brands-only-if-missing] [--json <보고서.json>]");
  process.exit(1);
}

const { brandsFileSchema } = await import("@/lib/intake/brands-schema");
const { planBrandsFromRepository } = await import("@/lib/intake/brands-apply");
const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 미리보기가 아니라 멈춰요");
  process.exit(1);
}

const file = brandsFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
const repo = await getRepository();
const exhibitionId = file.exhibitionSlug ? await repo.getExhibitionIdBySlug(file.exhibitionSlug) : null;
if (file.exhibitionSlug && !exhibitionId)
  console.log(`! 행사 ${file.exhibitionSlug} 행이 운영에 없어요. ${brandsOnly ? "참가 사실 없이 브랜드 판정만 봐요" : "적용 경로는 404예요"}`);
const res = await planBrandsFromRepository(repo, file, { missingExhibition: brandsOnly ? "brands-only" : "error" });
if (!res.ok) {
  console.error(`✗ ${res.message}`);
  process.exit(1);
}
const { plan } = res;
const s = plan.summary;
console.log(
  `brands.v1 ${file.brands.length}곳 → 새 브랜드 ${s.newBrands}, 기존에 이음 ${s.linkedBrands}, 파일 안 묶음 ${s.mergedInFile}, ` +
    `참가 사실 새로 ${s.participantsToCreate}(이미 ${s.participantsExisting}), 채울 칸 ${s.fieldsToFill}`,
);
for (const b of plan.brands.filter((b) => b.matchedBy))
  console.log(`  이음 ${b.key} ${b.name} → ${b.existingName} (${b.matchedBy})${b.kept.length ? `, 이미 있어 둠: ${b.kept.join(",")}` : ""}`);
for (const m of plan.nameMatches) console.log(`  이름만 같음 ${m.key} ${m.name} ↔ ${m.existing.map((e) => `${e.name}(${e.id})`).join(", ")}`);
for (const e of plan.errors) console.log(`  오류 ${e.key}: ${e.message}`);
for (const w of plan.warnings) console.log(`  경고 ${w}`);
if (jsonOut) {
  writeFileSync(
    jsonOut,
    `${JSON.stringify({ file: path, exhibitionFound: !!exhibitionId, summary: s, brands: plan.brands, nameMatches: plan.nameMatches, errors: plan.errors, warnings: plan.warnings }, null, 2)}\n`,
  );
  console.log(`  보고서 → ${jsonOut}`);
}
console.log("운영 DB에는 쓰지 않았어요");
