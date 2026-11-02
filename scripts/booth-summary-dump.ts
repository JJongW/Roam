/**
 * 읽기 전용 — 미리 요약을 만들어야 하는 부스(소개글에 실제 내용이 있는 곳)를
 * JSONL로 뽑는다. `summaries.json`을 다시 만들어야 할 때 이 스크립트로 입력을
 * 뽑고, 아직 없는 키만 채운다.
 *
 *   npx vite-node -c worker/vite.config.ts scripts/booth-summary-dump.ts > /tmp/dump.jsonl
 */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";
import { hasRealBlurb } from "@/lib/booth/blurb";
import { boothSummaryKey, prebuiltSummary } from "@/lib/booth/summary-cache";

const repo = await getRepository();
const { data: exhibitions } = await repo.listExhibitions({ limit: 200 });
let total = 0;
let missing = 0;
for (const e of exhibitions) {
  const detail = await repo.getExhibition(e.slug);
  const catName = new Map(detail?.categories.map((c) => [c.id, c.name]) ?? []);
  const booths = await repo.listBoothsFull(e.id);
  for (const b of booths) {
    const blurb = (b.longDescription || b.description || "").trim();
    if (!hasRealBlurb(blurb, { name: b.name, code: b.code, company: b.company }))
      continue;
    total += 1;
    if (prebuiltSummary(b.name, blurb)) continue;
    missing += 1;
    console.log(
      JSON.stringify({
        key: boothSummaryKey(b.name, blurb),
        slug: e.slug,
        name: b.name,
        company: b.company,
        category: catName.get(b.categoryId) ?? "",
        blurb: blurb.replace(/\s+/g, " "),
      }),
    );
  }
}
console.error(`요약 필요 ${total}곳 · 아직 없음 ${missing}곳`);
