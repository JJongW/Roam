/**
 * 읽기 전용 — `/api/ai/booth-summary`가 런타임에 Gemini를 부르는 부스가 몇 곳이고,
 * 그 중 몇 곳이 이미 `booth_enrichment.summary`로 덮여 있는지 센다.
 *
 * 라우트는 소개글(longDescription || description)이 있을 때만 모델을 부른다.
 * 그래서 "소개 있음"이 곧 런타임 호출 모집단이다.
 *
 * 함께 세는 것: 소개 탭은 `enrichment.summary`를 "작가가 직접 쓴 소개"로 인용한다
 * (`booth/about.ts` meaningfulQuote). 그 요약이 초안기가 쓴 것이면 출처가 틀린다.
 */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";
import { boothAbout } from "@/lib/booth/about";

const repo = await getRepository();
const { data: exhibitions } = await repo.listExhibitions({ limit: 200 });

let tAll = 0, tBlurb = 0, tDup = 0, tOnly = 0, tGoods = 0, tQuoted = 0, tMisQuoted = 0;

console.log("전시 | 부스 | 소개있음(=호출대상) | enrichment요약도 있음 | 요약 없음 | 굿즈키워드 | 인용됨 | 그중 초안기작");
for (const e of exhibitions) {
  const booths = await repo.listBoothsFull(e.id);
  if (!booths.length) continue;

  // 초안기가 승인시킨 부스 — 그 요약은 작가 글이 아니다.
  const cands = await repo.listEnrichmentCandidates({ exhibitionId: e.id, limit: 5000 });
  const drafted = new Set(cands.filter((c) => c.status === "approved").map((c) => c.boothId));

  const blurb = booths.filter((b) => (b.longDescription || b.description || "").trim());
  const dup = blurb.filter((b) => b.enrichment?.summary?.trim());
  const goods = booths.filter((b) => (b.enrichment?.goodsKeywords ?? []).length > 0);
  const quoted = booths.filter((b) => boothAbout(b).quote);
  const misQuoted = quoted.filter((b) => drafted.has(b.id));

  tAll += booths.length; tBlurb += blurb.length; tDup += dup.length;
  tOnly += blurb.length - dup.length; tGoods += goods.length;
  tQuoted += quoted.length; tMisQuoted += misQuoted.length;
  console.log(
    `${e.slug} | ${booths.length} | ${blurb.length} | ${dup.length} | ${blurb.length - dup.length}` +
    ` | ${goods.length} | ${quoted.length} | ${misQuoted.length}`,
  );
}
console.log(`\n합계 | ${tAll} | ${tBlurb} | ${tDup} | ${tOnly} | ${tGoods} | ${tQuoted} | ${tMisQuoted}`);
console.log(
  `\n소개 있는 ${tBlurb}곳이 상세 조회마다 Gemini 호출 대상.` +
  ` 그중 ${tDup}곳(${Math.round((tDup / Math.max(tBlurb, 1)) * 100)}%)은 이미 enrichment 요약이 있다.`,
);
console.log(
  `"작가가 직접 쓴 소개"로 인용되는 ${tQuoted}곳 중 ${tMisQuoted}곳은 초안기가 쓴 글이다` +
  ` (${Math.round((tMisQuoted / Math.max(tQuoted, 1)) * 100)}%).`,
);
