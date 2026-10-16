/** 읽기 전용 — 전시별 미결 검수 건수를 센다. */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";
import { reviewPolicy } from "@/lib/enrichment/review-policy";

const repo = await getRepository();
const { data: exhibitions } = await repo.listExhibitions({ limit: 200 });
console.log(`전시 ${exhibitions.length}개 / 오늘 ${new Date().toISOString().slice(0, 10)}\n`);

for (const e of exhibitions) {
  const all = await repo.listEnrichmentCandidates({ exhibitionId: e.id, limit: 5000 });
  if (!all.length) {
    console.log(`· ${e.name} (${e.slug}) ${e.startDate}~${e.endDate} — 초안 0`);
    continue;
  }
  const pending = all.filter((c) => c.status === "pending");
  const auto = pending.filter((c) => reviewPolicy(c.confidence, c.issues).wouldAutoPass).length;
  const redraft = pending.filter((c) => reviewPolicy(c.confidence, c.issues).decision === "redraft").length;
  const byStatus: Record<string, number> = {};
  for (const c of all) byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
  console.log(
    `· ${e.name} (${e.slug}) ${e.startDate}~${e.endDate}\n` +
    `    초안 ${all.length} ${JSON.stringify(byStatus)}\n` +
    `    대기 ${pending.length} → 자동통과 ${auto} · 재초안 ${redraft} · 사람판단 ${pending.length - auto - redraft}`,
  );
}

const links = await repo.listExhibitorLinkCandidates("pending");
console.log(`\n브랜드 연결 대기: ${links.length}건`);
