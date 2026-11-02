/** 읽기 전용 — 특정 전시에서 "실질 내용"으로 남은 소개글 원문을 본다. */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";
import { hasRealBlurb, blurbResidue } from "@/lib/booth/blurb";

const slug = process.argv[2] ?? "sif-2026";
const repo = await getRepository();
const { data: exhibitions } = await repo.listExhibitions({ limit: 200 });
const e = exhibitions.find((x) => x.slug === slug);
if (!e) throw new Error(`전시 없음: ${slug}`);

const booths = await repo.listBoothsFull(e.id);
const own = (b: (typeof booths)[number]) => ({ name: b.name, code: b.code, company: b.company });
const kept = booths.filter(
  (b) => (b.longDescription || b.description || "").trim() &&
    hasRealBlurb(b.longDescription || b.description, own(b)),
);
console.log(`${slug} — 남긴 ${kept.length}곳. 앞 12곳 원문:\n`);
for (const b of kept.slice(0, 12)) {
  const t = (b.longDescription || b.description || "").replace(/\s+/g, " ");
  console.log(`· ${b.code} ${b.name}`);
  console.log(`  원문: ${t.slice(0, 180)}`);
  console.log(`  잔여: "${blurbResidue(t, own(b))}"\n`);
}
