import type { MetadataRoute } from "next";
import { getRepository } from "@/lib/repositories";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repo = await getRepository();
  const { data: all } = await repo.listExhibitions({ limit: 100 });
  // 지도에 놓인 부스가 없는 박람회는 열 수 없으니 검색엔진에도 알리지 않는다.
  const openIds = await repo.openExhibitionIds(all.map((ex) => ex.id));
  const exhibitions = all.filter((ex) => openIds.has(ex.id));

  // 박람회 주소(/exhibitions/<slug>)는 지도로 넘겨 주기만 한다(지도 먼저, 브랜드 규칙 §4).
  // 넘겨 주는 주소는 사이트맵에 올리지 않고 도착하는 지도만 올린다.
  const exhibitionUrls = exhibitions.map((ex) => ({
    url: `${base}/exhibitions/${ex.slug}/map`,
    changeFrequency: "daily" as const,
    priority: 0.8,
  }));

  return [
    { url: base, changeFrequency: "daily", priority: 1 },
    ...exhibitionUrls,
    { url: `${base}/privacy`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${base}/terms`, changeFrequency: "yearly", priority: 0.3 },
  ];
}
