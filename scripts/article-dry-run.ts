/**
 * 아티클 초안 드라이런 — 레포 데이터(brands.v1 파일)만으로, 운영 DB 없이 하루치 초안과 슬랙 보고를 만든다.
 *
 *   npm run article:dry-run -- --out <폴더> --brands <brands.v1.json> [--brands …] \
 *     --fair '<행사 JSON>' [--fair …] [--today 2026-11-19] [--days 2]
 *
 *   행사 JSON: {"slug","name","venue","startDate","endDate"} — 공식 출처로 확인한 값만 넣는다.
 *   --days N: N일을 이어 돌린다(종류가 돌아가는지 본다). 날마다 초안 하나와 슬랙 글을 남긴다.
 *   --simulate-photo-permission N: **가짜 허락 시뮬레이션.** 사진 칸이 있는 앞 N곳의 대표 사진 칸을
 *     reviewed로, 그 회차 허락을 granted + account-photo로 목 저장소에만 바꾼다. 사진이 들어간 글 모양을
 *     보려는 것뿐이고 실제 허락이 아니다. 산출 파일 이름이 `sim-`으로 시작한다.
 *
 *   사진 조건(허락 받은 사진만) 때문에 몇 곳이 걸러지는지 `coverage.json`에 센다.
 *
 * **운영에 닿지 않는다.** .env를 읽지 않고 Supabase 변수를 비운 채 목 저장소(MockRepository)로 돈다.
 * LLM도 부르지 않는다(틀 글쓴이만). 승인 링크 서명은 가짜 비밀값("dry-run-secret")이라 운영에서 열리지 않는다.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

for (const k of ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "GEMINI_API_KEY"]) process.env[k] = "";

const argv = process.argv.slice(2).filter((a) => a !== "--");
const all = (name: string) => argv.flatMap((a, i) => (a === name && argv[i + 1] ? [argv[i + 1]] : []));
const one = (name: string) => all(name)[0];

const out = one("--out");
const brandFiles = all("--brands");
const fairs = all("--fair").map((j) => JSON.parse(j) as { slug: string; name: string; venue: string; startDate: string; endDate: string });
const today = one("--today") ?? new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
const days = Number(one("--days") ?? 1);
const simulate = Number(one("--simulate-photo-permission") ?? 0);
if (!out || brandFiles.length === 0) {
  console.error("사용법: npm run article:dry-run -- --out <폴더> --brands <brands.v1.json> --fair '<행사 JSON>' [--today YYYY-MM-DD] [--days N]");
  process.exit(1);
}

async function main() {
  const { getRepository } = await import("@/lib/repositories");
  const { brandsFileSchema } = await import("@/lib/intake/brands-schema");
  const { planBrandsFromRepository, applyBrandsPlan } = await import("@/lib/intake/brands-apply");
  const { exhibitionInputSchema } = await import("@/lib/schemas");
  const { generateDailyArticle, generationNote } = await import("@/lib/articles/generate");
  const { collectBacklog, formatBacklog } = await import("@/lib/admin/backlog");
  const { composeDailyReport, formatArticleSection, heroImage, slackPayload } = await import("@/lib/articles/slack");
  const { loadWorld } = await import("@/lib/articles/generate");
  const { photoCoverage } = await import("@/lib/articles/select");

  const repo = await getRepository();
  if (repo.mode !== "mock") throw new Error("목 저장소가 아니에요. 운영에 닿을 수 있어 멈춰요.");

  for (const f of fairs) if (!(await repo.getExhibitionIdBySlug(f.slug))) await repo.createExhibition(exhibitionInputSchema.parse(f));
  for (const path of brandFiles) {
    const file = brandsFileSchema.parse(JSON.parse(readFileSync(path, "utf8")));
    const planned = await planBrandsFromRepository(repo, file);
    if (!planned.ok) throw new Error(`${path}: ${planned.message}`);
    const r = await applyBrandsPlan(repo, planned.plan, { source: "intake", actor: "dry-run" });
    console.log(`${path}: 브랜드 ${r.createdBrands}, 참가 ${r.createdParticipants}, 칸 ${r.filledFields}, 실패 ${r.failures.length}`);
  }

  mkdirSync(out, { recursive: true });
  const prefix = simulate > 0 ? "sim-" : "";
  const before = photoCoverage(await loadWorld(repo, today));
  console.log("사진 조건 집계(실제 데이터):", JSON.stringify(before));

  if (simulate > 0) {
    // 가짜 허락 — 목 저장소에서만. 운영 저장소면 위에서 이미 멈췄다.
    const photos = (await repo.listProfileFields()).filter((f) => f.field === "photos" && f.exhibitorId);
    const graph = await repo.loadExhibitorGraph();
    for (const f of photos.slice(0, simulate)) {
      await repo.upsertProfileField({ subject: { exhibitorId: f.exhibitorId! }, field: "photos", value: f.value, sources: f.sources, status: "reviewed", actor: "dry-run-simulation" });
      for (const p of graph.participants.filter((x) => x.exhibitorId === f.exhibitorId))
        await repo.upsertParticipantPermission(p.id, { status: "granted", allowedUse: ["account-photo"] }, "dry-run-simulation");
    }
    console.log(`시뮬레이션: 사진 칸 ${Math.min(simulate, photos.length)}곳에 가짜 허락을 붙였어요(목 저장소만).`);
  }
  const coverage = { real: before, ...(simulate > 0 ? { simulated: photoCoverage(await loadWorld(repo, today)) } : {}) };
  writeFileSync(join(out, `${prefix}coverage.json`), JSON.stringify(coverage, null, 2) + "\n");
  const appUrl = "https://roam.ai.kr";
  for (let d = 0; d < days; d++) {
    const day = new Date(Date.parse(today) + d * 86_400_000).toISOString().slice(0, 10);
    const r = await generateDailyArticle(repo, { today: day });
    console.log(`${day}: ${r.status}${r.status === "created" ? ` ${r.article.kind} ${r.article.subjectKey} (후보 ${r.tried}번째)` : ""}`);
    if (r.status === "gate-failed") console.log(JSON.stringify(r.attempts, null, 2));
    const drafts = await repo.listArticles({ status: ["draft"] });
    const backlog = await collectBacklog(repo);
    const text = composeDailyReport(
      formatBacklog(backlog, appUrl),
      formatArticleSection({ drafts, note: generationNote(r) }, { appUrl, linkSecret: "dry-run-secret", now: Date.parse(`${day}T00:30:00Z`) }),
    );
    if (r.status === "created") {
      const a = r.article;
      writeFileSync(join(out, `${prefix}${day}-draft.json`), JSON.stringify(a, null, 2) + "\n");
      writeFileSync(join(out, `${prefix}${day}-draft.md`), toMarkdown(a));
    }
    writeFileSync(join(out, `${prefix}${day}-slack.txt`), (text ?? "(보내지 않음)") + "\n");
    writeFileSync(
      join(out, `${prefix}${day}-slack-payload-buttons.json`),
      JSON.stringify(slackPayload(text ?? "", { buttonsFor: drafts[0] ?? null, image: heroImage(drafts[0], appUrl) }), null, 2) + "\n",
    );
  }
  console.log(`→ ${out}`);
}

type A = Awaited<ReturnType<Awaited<ReturnType<typeof import("@/lib/repositories").getRepository>>["listArticles"]>>[number];
function toMarkdown(a: A): string {
  const n = new Map(a.sources.map((s, i) => [s.id, i + 1]));
  const ref = (ids: string[]) => (ids.length ? ` [${ids.map((id) => n.get(id)).join(", ")}]` : "");
  const lines = [`# ${a.title}`, "", `_${a.kind}, ${a.generatedFor}, 상태 ${a.status}, 글쓴이 ${a.gate.writer}_`, "", `> 미리보기: ${a.excerpt}`, ""];
  const img = (p: A["hero"]) => `![${p.alt}](${p.path}) _${p.credit}, 허락 범위: ${p.scope}_${ref([p.sourceId, p.permissionId])}`;
  lines.splice(2, 0, img(a.hero), "");
  for (const b of a.body) {
    if (b.type === "quote") lines.push(...b.text.split("\n").map((l) => `> ${l}`), `> (인용: ${b.attribution})${ref([b.sourceId])}`, "");
    else if (b.type === "photo") lines.push(img(b.photo), "");
    else if (b.type === "photo-group") lines.push(...b.photos.map(img), "");
    else if (b.type === "brand-card")
      lines.push(`### ${b.name}${b.boothCode ? ` (부스 ${b.boothCode})` : ""}${ref(b.sourceIds)}`, img(b.photo), ...(b.items ? [`품목: ${b.items.join(", ")}`] : []), "");
    else lines.push(`${b.text}${ref(b.sourceIds)}`, "");
  }
  lines.push("## 출처", "", ...a.sources.map((s, i) => `${i + 1}. ${s.label}${s.brandWritten ? " (브랜드가 쓴 글)" : ""}: ${s.origin.join(" ")}`), "");
  lines.push("## 게이트", "", `통과: ${a.gate.ok}, 버린 판본 ${a.gate.rejectedAttempts.length}개`, "");
  return lines.join("\n");
}

void main().catch((e) => {
  console.error(e);
  process.exit(1);
});
