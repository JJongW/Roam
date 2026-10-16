/** 읽기 전용 — hasRealBlurb가 전시별로 몇 곳을 "합성"으로 가르는지 센다. */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";
import { hasRealBlurb, blurbResidue } from "@/lib/booth/blurb";

const repo = await getRepository();
const { data: exhibitions } = await repo.listExhibitions({ limit: 200 });

let tBlurb = 0, tReal = 0;
console.log("전시 | 소개있음 | 실질내용 | 합성(=호출 안 함)");
for (const e of exhibitions) {
  const booths = await repo.listBoothsFull(e.id);
  const withBlurb = booths.filter((b) => (b.longDescription || b.description || "").trim());
  if (!withBlurb.length) continue;
  const own = (b: (typeof booths)[number]) => ({ name: b.name, code: b.code, company: b.company });
  const real = withBlurb.filter((b) => hasRealBlurb(b.longDescription || b.description, own(b)));
  tBlurb += withBlurb.length; tReal += real.length;
  console.log(`${e.slug} | ${withBlurb.length} | ${real.length} | ${withBlurb.length - real.length}`);

  // 경계를 눈으로 본다 — 판정이 과하면 실제 정보를 버린다.
  const realSet = new Set(real);
  const synth = withBlurb.filter((b) => !realSet.has(b));
  for (const b of synth.slice(0, 2)) {
    const r = blurbResidue(b.longDescription || b.description || "", own(b));
    console.log(`    버림: ${b.code} ${b.name} → 잔여 "${r}" (${r.length}자)`);
  }
  const low = real
    .map((b) => ({ b, n: blurbResidue(b.longDescription || b.description || "", own(b)).length }))
    .sort((x, y) => x.n - y.n)
    .slice(0, 2);
  for (const { b, n } of low) console.log(`    남김(최소): ${b.code} ${b.name} (잔여 ${n}자)`);
}
console.log(`\n합계 | ${tBlurb} | ${tReal} | ${tBlurb - tReal}`);
console.log(`런타임 Gemini 호출 대상이 ${tBlurb} → ${tReal}곳으로 줄어든다 (${Math.round(((tBlurb - tReal) / tBlurb) * 100)}% 감소).`);
