/**
 * 쌓인 초안 검수 대기를 전시 단위로 **전부 승인한다**.
 *
 * 화면의 "자동 통과 일괄 반영"(candidates/bulk)은 `wouldAutoPass`만 민다. 근거가
 * 확인되지 않은 글(`no_sources`·`unanchored`)은 점수와 무관하게 거기서 빠지므로,
 * 실제로 쌓인 큐는 그 버튼으로 줄지 않는다. 이 스크립트는 그 나머지를 사람이
 * 한 건씩 보는 대신 통째로 승인하기로 한 결정(2026-10-16)을 실행한다.
 *
 * 되짚을 수 있게 남긴다: 승인 사유에 판정·신뢰도·지적 코드를 적는다. 나중에
 * change_log에서 `일괄 승인`으로 걸러 이때 나간 글만 추려낼 수 있다.
 *
 *   npx vite-node -c worker/vite.config.ts scripts/approve-pending-candidates.ts <slug> [--apply]
 *
 * `--apply` 없이 돌리면 세기만 한다.
 */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";
import { reviewPolicy } from "@/lib/enrichment/review-policy";
import type { BoothEnrichmentPatch } from "@/lib/schemas";

const slug = process.argv[2];
const apply = process.argv.includes("--apply");
if (!slug) throw new Error("전시 slug이 필요하다");

const repo = await getRepository();
const exhibitionId = await repo.getExhibitionIdBySlug(slug);
if (!exhibitionId) throw new Error(`전시를 찾을 수 없다: ${slug}`);

const pending = await repo.listEnrichmentCandidates({
  exhibitionId,
  status: "pending",
  limit: 5000,
});
console.log(`${slug}: 대기 ${pending.length}건${apply ? "" : " (세기만 함 — --apply 없음)"}`);
if (!apply || !pending.length) process.exit(0);

let applied = 0;
const failures: { boothId: string; message: string }[] = [];
for (const c of pending) {
  const policy = reviewPolicy(c.confidence, c.issues);
  const codes = (c.issues ?? []).map((i) => i.code).join("·") || "지적 없음";
  const reason = `일괄 승인(2026-10-16 쌓인 큐 정리) — 판정 ${policy.decision} · 신뢰도 ${c.confidence.toFixed(2)} · ${codes}`;
  try {
    await repo.upsertBoothEnrichment(c.boothId, c.payload as BoothEnrichmentPatch, {
      source: "drafter",
      actor: null,
      reason,
    });
    await repo.setCandidateStatus(c.id, "approved", null, reason);
    applied += 1;
    if (applied % 50 === 0) console.log(`  …${applied}/${pending.length}`);
  } catch (e) {
    failures.push({ boothId: c.boothId, message: e instanceof Error ? e.message : String(e) });
  }
}
console.log(`승인 ${applied}건 · 실패 ${failures.length}건`);
for (const f of failures.slice(0, 10)) console.log(`  ✗ ${f.boothId}: ${f.message}`);
