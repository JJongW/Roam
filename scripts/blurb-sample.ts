/** 읽기 전용 — 전시별 소개글 표본. 라우트가 이걸 읽어 한 줄을 만든다. */
import { config as loadEnv } from "dotenv";
loadEnv();
process.env.ROAM_WORKER = "1";
import { getRepository } from "@/lib/repositories";

const repo = await getRepository();
const { data: exhibitions } = await repo.listExhibitions({ limit: 200 });

for (const e of exhibitions) {
  const booths = await repo.listBoothsFull(e.id);
  const withBlurb = booths.filter((b) => (b.longDescription || b.description || "").trim());
  if (!withBlurb.length) continue;

  // 템플릿 판정: 부스명·코드를 지운 뒤 남는 문장이 서로 같은가.
  const skeletons = withBlurb.map((b) =>
    (b.longDescription || b.description || "")
      .replaceAll(b.name, "〈이름〉")
      .replace(/[A-Z]?-?\d{2,4}\b/g, "〈코드〉")
      .trim(),
  );
  const uniq = new Set(skeletons);
  console.log(`\n■ ${e.slug} — 소개 ${withBlurb.length}곳 / 골격 ${uniq.size}종` +
    ` (평균 ${Math.round(withBlurb.reduce((s, b) => s + (b.longDescription || b.description || "").length, 0) / withBlurb.length)}자)`);
  for (const b of withBlurb.slice(0, 2)) {
    const t = (b.longDescription || b.description || "").replace(/\s+/g, " ");
    console.log(`  · ${b.code} ${b.name}: ${t.slice(0, 150)}${t.length > 150 ? "…" : ""}`);
  }
}
