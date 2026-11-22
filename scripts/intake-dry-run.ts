/**
 * 인입 파일의 운영 미리보기(읽기 전용). `/admin/intake` 미리보기와 같은 계획을 세운다. 파일 모양으로 가른다.
 *
 *   npm run intake:dry-run -- <파일> [--brands-only-if-missing] [--json <보고서.json>]
 *
 * - brands.v1(`version: "brands.v1"`): planBrandsFromRepository. 새 브랜드, 기존에 이음, 이름만 같음, 참가 사실.
 * - intake.v1(`version: 1`): planIntake + FLOORPLANS[slug]. 새 부스, 채울 칸, 충돌, 도면에 없는 번호.
 * - 행사 행(exhibition.v1, version 없이 `slug`로 시작하는 파일): 같은 slug가 운영에 있는지("새로 만들어요"/"이미 있어요").
 *
 * 형식 검사와 파일 종류 판정은 `/admin/intake` 화면과 같은 checkIntakeFile(lib/intake/schema.ts)이다.
 *
 * **쓰지 않는다.** 저장소 읽기만 부른다. 적용은 사람이 /admin/intake에서 미리보기를 보고 한다.
 * `.env`는 이 체크아웃, 없으면 본 체크아웃(git common dir의 부모)에서 읽는다. 값은 출력하지 않는다.
 * `--brands-only-if-missing`: brands.v1인데 행사 행이 아직 없으면 참가 사실 없이 브랜드 판정만 본다.
 * 브랜드 키는 파일의 exhibitionSlug 그대로라, 행사가 생긴 뒤 다시 돌려도 같은 브랜드를 찾는다.
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
const jsonIdx = argv.indexOf("--json");
const jsonOut = jsonIdx >= 0 ? argv[jsonIdx + 1] : undefined;
const path = argv.find((a, i) => !a.startsWith("--") && (jsonIdx < 0 || i !== jsonIdx + 1));
const brandsOnly = argv.includes("--brands-only-if-missing");
if (!path) {
  console.error("사용법: npm run intake:dry-run -- <파일> [--brands-only-if-missing] [--json <보고서.json>]");
  process.exit(1);
}

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 미리보기가 아니라 멈춰요");
  process.exit(1);
}
const repo = await getRepository();
const raw = JSON.parse(readFileSync(path, "utf8")) as unknown;
const { checkIntakeFile, INTAKE_FILE_KIND_LABEL } = await import("@/lib/intake/schema");
const checked = checkIntakeFile(raw);
if (!checked.ok) {
  console.error(`✗ ${checked.kind ? `${INTAKE_FILE_KIND_LABEL[checked.kind]} 형식이 안 맞아요` : "모르는 파일이에요"}`);
  for (const i of checked.issues) console.error(`  ${i.path || "(파일)"}: ${i.message}`);
  process.exit(1);
}
const report = (obj: unknown) => {
  if (!jsonOut) return;
  writeFileSync(jsonOut, `${JSON.stringify(obj, null, 2)}\n`);
  console.log(`  보고서 → ${jsonOut}`);
};

if (checked.kind === "brands") {
  const { planBrandsFromRepository } = await import("@/lib/intake/brands-apply");
  const file = checked.file;
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
      `참가 사실 새로 ${s.participantsToCreate}(이미 ${s.participantsExisting}), 채울 칸 ${s.fieldsToFill}, 연결 확인 새로 ${s.candidates}`,
  );
  for (const b of plan.brands.filter((b) => b.matchedBy))
    console.log(`  이음 ${b.key} ${b.name} → ${b.existingName} (${b.matchedBy})${b.kept.length ? `, 이미 있어 둠: ${b.kept.join(",")}` : ""}`);
  for (const b of plan.brands.filter((b) => b.keys.length > 1)) console.log(`  파일 안 묶음 ${b.keys.join(" + ")} → ${b.name}`);
  for (const m of plan.nameMatches) console.log(`  이름만 같음 ${m.key} ${m.name} ↔ ${m.existing.map((e) => `${e.name}(${e.id})`).join(", ")}`);
  for (const c of plan.exhibitorPlan.candidates) {
    const pt = "new" in c.participantRef ? `새 참가 ${c.participantRef.new}` : `참가 ${c.participantRef.existing}`;
    const to = "existing" in c.target ? c.target.existing : c.target.new;
    console.log(`  연결 확인 ${pt} → ${to} (${c.reason}, 부스 없음)`);
  }
  for (const e of plan.errors) console.log(`  오류 ${e.key}: ${e.message}`);
  for (const w of plan.warnings) console.log(`  경고 ${w}`);
  report({ file: path, kind: "brands", exhibitionFound: !!exhibitionId, summary: s, brands: plan.brands, nameMatches: plan.nameMatches, errors: plan.errors, warnings: plan.warnings });
} else if (checked.kind === "booths") {
  const { planIntake } = await import("@/lib/intake/plan");
  const { FLOORPLANS } = await import("@/lib/floorplans");
  const file = checked.file;
  const floorplan = FLOORPLANS[file.exhibitionSlug];
  if (!floorplan) console.log(`! FLOORPLANS에 ${file.exhibitionSlug}가 없어요. 모든 부스가 0,0에 놓여요. 도면을 먼저 등록해 주세요`);
  const exhibitionId = await repo.getExhibitionIdBySlug(file.exhibitionSlug);
  if (!exhibitionId) {
    console.error(`✗ 행사를 찾을 수 없어요: ${file.exhibitionSlug}`);
    process.exit(1);
  }
  const [booths, halls, categories] = await Promise.all([repo.listBoothsFull(exhibitionId), repo.listHalls(exhibitionId), repo.listCategories(exhibitionId)]);
  const plan = planIntake({ file, booths, halls, categories, floorplanBooths: floorplan?.booths ?? [] });
  const codes = new Set((floorplan?.booths ?? []).map((b) => b.code));
  const offMap = file.booths.filter((b) => !codes.has(b.code)).map((b) => b.code);
  console.log(
    `intake.v1 ${file.booths.length}부스 → 새로 ${plan.creates.length}, 채움 ${plan.fills.length}, 충돌 ${plan.conflicts.length}, 오류 ${plan.errors.length}, ` +
      `바뀔 것 없음 ${plan.unchanged}, 새 홀 ${plan.newHalls.length}, 새 분류 ${plan.newCategories.length}, 도면에 없는 번호 ${offMap.length}`,
  );
  if (offMap.length) console.log(`  도면에 없는 번호: ${offMap.slice(0, 30).join(", ")}${offMap.length > 30 ? " …" : ""}`);
  for (const e of plan.errors) console.log(`  오류 ${JSON.stringify(e)}`);
  for (const w of plan.warnings) console.log(`  경고 ${w}`);
  report({ file: path, kind: "booths", offMap, plan });
} else {
  const { planExhibitionFromRepository } = await import("@/lib/intake/exhibition-file");
  const plan = await planExhibitionFromRepository(repo, checked.file);
  const ex = plan.exhibition;
  console.log(
    `행사 행 ${ex.slug}: 형식 통과, ${
      plan.status === "exists"
        ? `이미 있어요(${plan.existingId}). /admin/intake에서도 만들지 않아요`
        : "새로 만들어요. /admin/intake에 올려 미리보기를 보고 적용해요"
    }`,
  );
  console.log(`  ${ex.name}, ${ex.venue}, ${ex.startDate} ~ ${ex.endDate}, 안내 문구 ${Object.keys(ex.tips).join(", ") || "없음"}`);
  report({ file: path, kind: "exhibition", exists: plan.status === "exists", existingId: plan.existingId, input: ex });
}
console.log("운영 DB에는 쓰지 않았어요");
