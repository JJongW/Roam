/**
 * 서울일러스트레이션페어 공식 참가자 명단(TSV) → brands.v1 파일.
 *
 *   npm run brands:sif -- --dir <명단 폴더> --slug <행사 slug> --out <파일.json>
 *     [--participants <파일명>] [--profile-check <파일명>] [--name-matches <dry-run 보고서.json>] [--held <보류 목록.tsv>]
 *
 *   --dir: Roam-design `docs/content/engine/runs/sif-2026-v22`. 기본 파일 이름
 *          official-participants-2026-11-20.tsv(명단), compare-with-v21.tsv(V.21 이름 대조),
 *          profile-check-2026-11-20.tsv(오크레오 프로필 대조, 있으면 읽는다).
 *   --name-matches: `npm run intake:dry-run -- <out> --brands-only-if-missing --json <보고서>`의 보고서.
 *          지난 회차와 같다고 본 곳 중 이름 일치로만 남은 곳에, 기존 브랜드가 하나뿐이면 exhibitorId를 적는다.
 *   --held: 판정을 기다리느라 파일에서 뺀 곳을 TSV로 적는다.
 *
 * 명단은 오크레오 공식 페이지(https://www.ocreo.kr/fair/sif22)를 사람이 브라우저로 넘기며 뽑은 것이다. 이 스크립트는
 * 네트워크를 타지 않는다. V.21 인스타, 웹, 소개는 src/lib/booth/links-sif-2026.json(V.21 오크레오 프로필 이관본)에서 온다.
 * 변환은 src/lib/intake/sif-official.ts(순수, 테스트 있음).
 *
 * **파일만 만든다.** 운영 DB에 쓰지 않는다. 적용은 사람이 /admin/intake 미리보기를 보고 한다.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import links from "@/lib/booth/links-sif-2026.json";
import {
  buildSifBrandsFile,
  parseCompare,
  parseParticipants,
  parseProfileCheck,
  pinFromNameMatches,
  type SifV21Link,
} from "@/lib/intake/sif-official";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const opt = (n: string) => (argv.includes(n) ? argv[argv.indexOf(n) + 1] : undefined);
const dir = opt("--dir");
const slug = opt("--slug");
const out = opt("--out");
if (!dir || !slug || !out) {
  console.error(
    "사용법: npm run brands:sif -- --dir <명단 폴더> --slug <행사 slug> --out <파일.json> [--participants <파일명>] [--profile-check <파일명>] [--name-matches <보고서.json>] [--held <보류.tsv>]",
  );
  process.exit(1);
}
const participantsPath = join(dir, opt("--participants") ?? "official-participants-2026-11-20.tsv");
const comparePath = join(dir, "compare-with-v21.tsv");
const checkPath = join(dir, opt("--profile-check") ?? "profile-check-2026-11-20.tsv");
const collectedAt = /(\d{4}-\d{2}-\d{2})/.exec(participantsPath)?.[1] ?? new Date().toISOString().slice(0, 10);

const profileCheck = existsSync(checkPath) ? parseProfileCheck(readFileSync(checkPath, "utf8")) : undefined;
console.log(profileCheck ? `프로필 대조 ${profileCheck.size}곳을 읽었어요 (${checkPath})` : `프로필 대조 파일이 없어요. 확인 필요한 곳은 빼 둬요 (${checkPath})`);

const res = buildSifBrandsFile({
  participants: parseParticipants(readFileSync(participantsPath, "utf8")),
  compare: parseCompare(readFileSync(comparePath, "utf8")),
  profileCheck,
  v21Links: links as Record<string, SifV21Link>,
  exhibitionSlug: slug,
  sourceUrl: "https://www.ocreo.kr/fair/sif22",
  collectedAt,
  v21IntroSource: "오크레오 V.21 참가자 프로필(Roam src/lib/booth/links-sif-2026.json)",
  note: `서울일러스트레이션페어V.22 오크레오 공식 참가자 목록(${collectedAt}, 분류와 이름). 부스 번호와 배치도는 아직 공개 전이에요. 지난 회차(V.21, sif-2026)와 같은 이름이면 V.21 인스타, 웹, 소개를 이어 적었어요`,
});
let file = res.file;

const nmPath = opt("--name-matches");
if (nmPath) {
  const report = JSON.parse(readFileSync(nmPath, "utf8")) as { nameMatches?: { key: string; name: string; existing: { id: string; name: string }[] }[] };
  const pin = pinFromNameMatches(file, res.carried, report.nameMatches ?? []);
  file = pin.file;
  console.log(`이름 일치로 기존 브랜드에 적은 곳 ${pin.pinned.length}, 후보가 여럿이라 그대로 둔 곳 ${pin.ambiguous.length}`);
  for (const p of pin.pinned) console.log(`  적음 ${p.key} → ${p.name}(${p.id})`);
  for (const a of pin.ambiguous) console.log(`  여럿 ${a.key} ↔ ${a.existing.map((e) => `${e.name}(${e.id})`).join(", ")}`);
}

mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, `${JSON.stringify(file, null, 2)}\n`);
const heldPath = opt("--held");
if (heldPath) {
  mkdirSync(dirname(heldPath), { recursive: true });
  const rows = res.held.map((h) => [h.type, h.name, h.match, h.v21Code ?? "", h.v21Name ?? "", h.reason].join("\t"));
  writeFileSync(heldPath, `${["분류", "V22이름", "대조", "V21부스", "V21이름", "보류 이유"].join("\t")}\n${rows.join("\n")}\n`);
}

const c = res.counts;
console.log(
  `✓ brands.v1 ${file.brands.length}곳 → ${out}\n` +
    `  대조: 새 참가 ${c["새 참가"]}, 같은 이름 ${c["같은 이름"]}, 짧아서 확인 ${c["같은 이름(짧아서 확인 필요)"]}, 비슷한 이름 ${c["비슷한 이름(확인 필요)"]}\n` +
    `  V.21 이어 적음 ${res.carried.length}(링크 있음 ${res.carried.filter((x) => x.withLinks).length}), 보류 ${res.held.length}, 명단 중복 줄 ${res.duplicateRows.length}` +
    (res.duplicateRows.length ? ` (${res.duplicateRows.map((d) => d.name).join(", ")})` : ""),
);
console.log("  운영 DB에는 쓰지 않았어요. /admin/intake에 올려 미리보기를 보고 적용해 주세요");
