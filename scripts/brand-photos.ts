/**
 * 허락 받은 브랜드 사진 올리기 — Ted가 손으로 돌린다. 자동으로 돌지 않는다(워커, cron에 넣지 않는다).
 *
 *   npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json            # 드라이런(기본)
 *   npm run brand-photos -- --manifest data/brand-photos/moongu-2026-winter.json --apply    # 운영에 씀
 *
 * 순서(설계 docs/runbooks/moongu-2026-winter-photos.md)
 *   0. 디스크 사진을 다시 재서 manifest 해시와 맞춘다(외장 디스크가 꽂혀 있어야 한다, ._ 파일은 거른다)
 *   1. 운영 백업: 그 브랜드들의 프로필 칸 전부와 그 행사 허락 행을 data/intake/_backup/에 뜬다(드라이런도 뜬다)
 *   2. --apply일 때만: Supabase Storage 공개 버킷(manifest.bucket)에 고른 사진을 올린다(내용 해시 열쇠, 덮지 않음)
 *   3. --apply일 때만: brand_profile_field photos를 reviewed로 쓴다(빈 칸만, 다르면 conflict로 건너뜀)
 *   4. --apply일 때만: participant_permission에 허락을 쓰고 VOC 한 줄을 남긴다(그 행사 참가 사실이 있을 때만)
 *
 * `.env`는 이 체크아웃, 없으면 본 체크아웃에서 읽는다. 값은 출력하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { tmpdir } from "node:os";
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
const one = (name: string) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : undefined;
};
const manifestPath = one("--manifest");
const apply = argv.includes("--apply");
const actor = one("--actor") ?? "ted:brand-photos";
if (!manifestPath) {
  console.error("사용법: npm run brand-photos -- --manifest <brand-photos.v1.json> [--apply] [--actor <이름>]");
  process.exit(1);
}

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 작업이 아니라 멈춰요");
  process.exit(1);
}
const { photoManifestSchema, planPhotoIntake, isPhotoFile, articleReady, RESIZE } = await import("@/lib/brands/photo-intake");
const { parseFieldValue } = await import("@/lib/brands/profile");
const { createClient } = await import("@supabase/supabase-js");

const manifest = photoManifestSchema.parse(JSON.parse(readFileSync(manifestPath, "utf8")));

// 0. 디스크 재기
if (!existsSync(manifest.root)) {
  console.error(`✗ 사진 폴더가 없어요: ${manifest.root} (외장 디스크가 꽂혀 있는지 보세요)`);
  process.exit(1);
}
/** 디스크 이름은 NFD일 수 있어 NFC로 맞춰 찾는다. */
const findIn = (dir: string, name: string) => readdirSync(dir).find((n) => n.normalize("NFC") === name.normalize("NFC"));
const teamDir = (folder: string) => {
  const n = findIn(manifest.root, folder);
  return n ? join(manifest.root, n) : null;
};
const disk = new Map<string, { sha256: string; bytes: number }>();
const extraOnDisk: string[] = [];
const known = new Set(manifest.teams.flatMap((t) => t.photos.map((p) => `${t.folder}/${p.file}`.normalize("NFC"))));
for (const t of manifest.teams) {
  const dir = teamDir(t.folder);
  if (!dir) continue; // 계획이 "디스크에 없어요"로 잡는다
  for (const name of readdirSync(dir).filter(isPhotoFile)) {
    const rel = `${t.folder}/${name}`.normalize("NFC");
    const buf = readFileSync(join(dir, name));
    disk.set(rel, { sha256: createHash("sha256").update(buf).digest("hex"), bytes: statSync(join(dir, name)).size });
    if (!known.has(rel)) extraOnDisk.push(rel);
  }
}

const repo = await getRepository();
const exhibitionId = await repo.getExhibitionIdBySlug(manifest.exhibitionSlug);
const [graph, outreach] = await Promise.all([repo.loadExhibitorGraph(), repo.hasParticipantOutreach()]);
if (!outreach) {
  console.error("✗ participant_permission 테이블이 운영에 없어요(0062 STEP 1). 허락을 쓸 자리가 없어 멈춰요");
  process.exit(1);
}
const exhibitorIds = manifest.teams.map((t) => t.exhibitorId).filter((x): x is string => !!x);
const fields = await repo.listProfileFields({ exhibitorIds });
const permissionRows = exhibitionId ? await repo.listParticipantPermissions(exhibitionId) : [];
const permissions = Object.fromEntries(permissionRows.map((p) => [p.participantId, { status: p.status, allowedUse: p.allowedUse }]));

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const publicUrl = (key: string) => `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/${manifest.bucket}/${key}`;
const plans = planPhotoIntake({ manifest, graph, exhibitionId, fields, permissions, disk, publicUrl, extraOnDisk });

// 1. 백업(읽기만, gitignore 폴더)
const at = new Date().toISOString().replace(/[:.]/g, "-");
const backup = resolve(`data/intake/_backup/brand-photos-${manifest.exhibitionSlug}-${apply ? "before-apply" : "dry-run"}-${at}.json`);
mkdirSync(dirname(backup), { recursive: true });
writeFileSync(backup, `${JSON.stringify({ takenAt: new Date().toISOString(), manifest: manifestPath, exhibitionId, fields, permissionRows }, null, 1)}\n`);
console.log(`✓ 백업 → ${backup}`);

console.log(`행사 ${manifest.exhibitionSlug}: ${exhibitionId ? `있음(${exhibitionId})` : "운영에 없음 → 허락은 못 써요(사진 칸만)"}`);
console.log(`버킷 ${manifest.bucket}, ${apply ? "적용" : "드라이런(쓰지 않음)"}`);
for (const p of plans) {
  const mark = p.errors.length ? "✗" : articleReady(p) ? "✓" : "·";
  console.log(
    `${mark} ${p.name}: 브랜드 ${p.exhibitorId ?? "?"}, 참가 ${p.participantId ?? "없음"}, 올릴 사진 ${p.uploads.length}장, ` +
      `${p.uploads.some((u) => u.resize) ? `(줄여 올림 ${p.uploads.filter((u) => u.resize).length}장) ` : ""}사진 칸 ${p.photosField.action}, 허락 ${p.permission.action}${articleReady(p) ? ", 아티클에 쓸 수 있게 됨" : ""}`,
  );
  for (const e of p.errors) console.log(`    오류 ${e}`);
  for (const w of p.warnings) console.log(`    경고 ${w}`);
}

if (!apply) {
  console.log("드라이런이라 운영 DB와 Storage에 쓰지 않았어요. 적용은 --apply");
  process.exit(0);
}

const rl = createInterface({ input: process.stdin, output: process.stdout });
const answer = (await rl.question(`운영에 씁니다. 계속하려면 ${manifest.exhibitionSlug} 를 그대로 입력하세요: `)).trim();
rl.close();
if (answer !== manifest.exhibitionSlug) {
  console.log("멈췄어요. 아무것도 쓰지 않았어요");
  process.exit(1);
}

/** 큰 원본을 임시 폴더에 줄여 JPEG로 만든다(macOS sips). 디스크 원본은 건드리지 않는다. */
const shrinkDir = mkdtempSync(join(tmpdir(), "brand-photos-"));
function shrink(src: string): Buffer {
  const outPath = join(shrinkDir, `${createHash("sha256").update(src).digest("hex").slice(0, 12)}.jpg`);
  execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", String(RESIZE.quality), "-Z", String(RESIZE.maxEdge), src, "--out", outPath], { stdio: "ignore" });
  return readFileSync(outPath);
}

const storage = createClient(supabaseUrl, process.env.SUPABASE_SERVICE_ROLE_KEY!).storage;
// 앱과 아티클이 img src로 바로 여는 주소라 공개 버킷이다. 이미 있으면 그대로 쓴다.
const made = await storage.createBucket(manifest.bucket, { public: true });
if (made.error && !/already exists|duplicate/i.test(made.error.message)) throw new Error(`버킷 만들기 실패: ${made.error.message}`);

for (const p of plans) {
  if (p.errors.length || !p.exhibitorId) continue;
  const team = manifest.teams.find((t) => t.key === p.key)!;
  const realDir = teamDir(team.folder)!;
  const writeFields = p.photosField.action === "fill";
  if (writeFields) {
    // 2. 올리기 — 내용 해시 열쇠라 같은 사진이 이미 있으면 그대로 둔다.
    for (const u of p.uploads) {
      const name = findIn(realDir, u.file)!;
      const bytes = u.resize ? shrink(join(realDir, name)) : readFileSync(join(realDir, name));
      const { error } = await storage.from(manifest.bucket).upload(u.key, bytes, { contentType: u.contentType, upsert: false });
      if (error && !/already exists|duplicate/i.test(error.message)) throw new Error(`올리기 실패 ${u.key}: ${error.message}`);
    }
    // 3. 사진 칸
    const value = parseFieldValue({ exhibitorId: p.exhibitorId }, "photos", p.photosField.value);
    if (!value.ok) throw new Error(`${p.name} 사진 칸 값이 틀려요: ${value.message}`);
    const wrote = await repo.upsertProfileField({
      subject: { exhibitorId: p.exhibitorId },
      field: "photos",
      value: value.value,
      sources: [`${manifest.evidence}`, ...(team.boothcutUrl ? [team.boothcutUrl] : [])],
      status: "reviewed",
      actor,
    });
    if (!wrote) throw new Error(`${p.name} 사진 칸을 쓰지 못했어요(브랜드 없음)`);
  }
  // 4. 허락 + VOC
  if (p.permission.action === "write" && p.participantId) {
    const saved = await repo.upsertParticipantPermission(p.participantId, p.permission.patch, actor);
    if (!saved) throw new Error(`${p.name} 허락을 쓰지 못했어요(참가 없음)`);
    await repo.addBrandOutreachLog(
      {
        exhibitorId: p.exhibitorId,
        participantId: p.participantId,
        direction: "inbound",
        kind: "permission",
        channel: "instagram",
        summary: `사진 허락(${p.permission.patch.allowedUse.join(", ")}): ${p.permission.patch.reply}. ${manifest.evidence}에서 옮김`.slice(0, 2000),
        occurredAt: `${p.permission.patch.sentAt}T00:00:00+09:00`,
      },
      actor,
    );
  }
  console.log(`  ✓ ${p.name}: 사진 ${writeFields ? `${p.uploads.length}장 올리고 칸 씀` : "건너뜀"}, 허락 ${p.permission.action === "write" ? "씀" : p.permission.action}`);
}
console.log("끝났어요. 같은 명령을 --apply 없이 다시 돌려 사진 칸 same, 허락 same이 나오는지 보세요");
