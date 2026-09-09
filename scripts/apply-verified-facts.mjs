// 사람이 확인한 사실을 **찾는 즉시** 부스에 반영한다.
//
//   node scripts/apply-verified-facts.mjs <slug> [--overwrite] [--dry] [--port 3112]
//
// data/verified/<slug>.json 의 booths[code].summary 를 인입 파일의
// enrichment.summary 로 옮기고, /api/admin/intake 에 태운다. 인입을 거치므로
// 규칙(빈 칸만 채운다·충돌은 안 덮는다)이 그대로 적용되고, 변경 이력에도 남는다.
//
// 왜 이게 필요한가: 확인한 걸 파일에만 쌓아두면 반영을 빠뜨린다. 실제로 인스타로
// 56곳을 확인해놓고 하루 종일 DB에 안 넣은 채로 뒀다. 검증은 한 곳(초안 검수
// 화면)에서 한 번에 되어야 한다.
import { readFileSync, writeFileSync } from "node:fs";

const [slug, ...rest] = process.argv.slice(2);
if (!slug) {
  console.error("사용법: node scripts/apply-verified-facts.mjs <slug> [--overwrite] [--dry] [--port N]");
  process.exit(1);
}
const OVERWRITE = rest.includes("--overwrite");
const DRY = rest.includes("--dry");
const PORT = rest.includes("--port") ? rest[rest.indexOf("--port") + 1] : "3112";

const intakePath = `data/intake/${slug}.json`;
const verifiedPath = `data/verified/${slug}.json`;
const intake = JSON.parse(readFileSync(intakePath, "utf8"));
const verified = JSON.parse(readFileSync(verifiedPath, "utf8"));

const byCode = new Map(intake.booths.map((b) => [b.code, b]));
let merged = 0, missing = [];
for (const [code, v] of Object.entries(verified.booths ?? {})) {
  const b = byCode.get(code);
  if (!b) { missing.push(code); continue; }
  // 이미지는 요약과 **독립**이다 — 계정은 찾았는데 아직 글을 못 쓴 부스가 있다.
  // 예전엔 summary가 없으면 통째로 건너뛰어 그런 부스의 사진이 운영에 영영
  // 안 올라갔다(A-03·F-14·F-26·G-20·H-01이 그 상태였다).
  if (v.images?.length) b.images = v.images;
  else if (v.image && !(b.images ?? []).includes(v.image)) b.images = [v.image];
  if (!v.summary?.trim()) { merged++; continue; }
  b.enrichment ??= {};
  b.enrichment.summary = v.summary.slice(0, 300);
  if (v.sourceUrl) b.enrichment.sourceUrl = v.sourceUrl;
  // 저작 6종도 같이 옮긴다 — 확인한 값이 있는 필드만. 빈 값을 실어 보내면
  // 인입이 "빈 칸"으로 세어 운영의 기존 값을 지운다.
  if (v.roamInterpretation?.trim()) b.enrichment.roamInterpretation = v.roamInterpretation.slice(0, 300);
  if (v.valueTags?.length) b.enrichment.valueTags = v.valueTags;
  if (Object.keys(v.recommendationReasons ?? {}).length) b.enrichment.recommendationReasons = v.recommendationReasons;
  if (v.thingsToDo?.length) b.enrichment.thingsToDo = v.thingsToDo;
  if (v.timing?.length) b.enrichment.timing = v.timing;
  if (v.memoryHooks?.length) b.enrichment.memoryHooks = v.memoryHooks;
  merged++;
}
if (missing.length) console.log("도면·인입에 없는 코드:", missing.join(", "));
writeFileSync(intakePath, JSON.stringify(intake, null, 1));
console.log(`인입 파일에 병합: ${merged}곳 → ${intakePath}`);

const code = (readFileSync(".env", "utf8").match(/^ORGANIZER_CODE=(.+)$/m)?.[1] ?? "").trim();
const post = async (apply) => {
  const res = await fetch(`http://localhost:${PORT}/api/admin/intake`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `roam_admin=${code}` },
    body: JSON.stringify({ file: intake, apply, overwrite: OVERWRITE }),
  });
  const j = await res.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  return j.data;
};

const { plan } = await post(false);
console.log(`미리보기 — 채움 ${plan.fills.length} · 충돌 ${plan.conflicts.length} · 오류 ${plan.errors.length}`);
// 충돌은 이미 다른 값이 있는 자리다. --overwrite 없이는 사람이 보게 남긴다.
const sum = plan.conflicts.filter((c) => c.field.startsWith("enrichment."));
if (sum.length && !OVERWRITE) {
  console.log(`저작 필드 충돌 ${sum.length}곳 — 덮지 않았다(--overwrite로 덮을 수 있다):`);
  for (const c of sum.slice(0, 10)) console.log(`   ${c.code}  현재: ${String(c.current).slice(0, 70)}…`);
}
if (DRY) { console.log("--dry: 적용 안 함"); process.exit(0); }
const { applied } = await post(true);
console.log("적용:", JSON.stringify(applied));
