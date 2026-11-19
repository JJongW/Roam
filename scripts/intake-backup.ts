/**
 * 인입 적용 전 백업(읽기 전용). 행사 하나에 brands.v1이나 intake.v1을 올리기 전에 지금 값을 떠 둔다.
 *
 *   npm run intake:backup -- <행사 slug> [--label <이름>]
 *
 * 담는 것: 그 행사 행(없으면 null), 그 행사 부스 전 필드(listBoothsFull), 브랜드 그래프 전체(exhibitor,
 * exhibition_participant, booth_participant, 후보), 브랜드 프로필 칸 전체. brands.v1은 기존 브랜드의 빈 칸과
 * 참가 사실을 쓰고, intake.v1은 그 행사 부스와 연결을 쓰니 이 넷이면 되돌릴 근거가 된다.
 *
 * - **쓰지 않는다.** 저장소 읽기만 부른다. 파일은 `data/intake/_backup/`(gitignore)에 남긴다.
 * - `.env`는 이 체크아웃, 없으면 본 체크아웃에서 읽는다. 값은 출력하지 않는다.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
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
const slug = argv[0];
const labelIdx = argv.indexOf("--label");
const label = labelIdx >= 0 ? argv[labelIdx + 1] : "before";
if (!slug || slug.startsWith("--")) {
  console.error("사용법: npm run intake:backup -- <행사 slug> [--label <이름>]");
  process.exit(1);
}

const { getRepository } = await import("@/lib/repositories");
const { hasSupabase } = await import("@/lib/env");
if (!hasSupabase) {
  console.error("✗ Supabase 자격증명이 없어 mock으로 돌게 돼요. 운영 백업이 아니라 멈춰요");
  process.exit(1);
}
const repo = await getRepository();
const exhibitions = await repo.listExhibitions({ limit: 200 });
const exhibition = exhibitions.data.find((e) => e.slug === slug) ?? null;
const [booths, graph, profileFields] = await Promise.all([
  exhibition ? repo.listBoothsFull(exhibition.id) : Promise.resolve([]),
  repo.loadExhibitorGraph(),
  repo.listProfileFields(),
]);

const at = new Date().toISOString().replace(/[:.]/g, "-");
const out = resolve(`data/intake/_backup/${slug}-${label}-${at}.json`);
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify({ slug, takenAt: new Date().toISOString(), exhibition, booths, graph, profileFields }, null, 1)}\n`);
const g = graph as unknown as Record<string, unknown[]>;
const counts = Object.fromEntries(Object.entries(g).filter(([, v]) => Array.isArray(v)).map(([k, v]) => [k, v.length]));
console.log(`✓ 백업 → ${out}`);
console.log(`  행사 ${exhibition ? exhibition.id : "없음"}, 부스 ${booths.length}, 프로필 칸 ${profileFields.length}, 그래프 ${JSON.stringify(counts)}`);
console.log("운영 DB에는 쓰지 않았어요");
