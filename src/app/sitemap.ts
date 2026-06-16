import type { MetadataRoute } from "next";
import { getRepository } from "@/lib/repositories";

const base = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });

  const exhibitionUrls = exhibitions.flatMap((ex) => [
    { url: `${base}/exhibitions/${ex.slug}`, changeFrequency: "daily" as const, priority: 0.8 },
    { url: `${base}/exhibitions/${ex.slug}/map`, changeFrequency: "weekly" as const, priority: 0.5 },
  ]);

  return [{ url: base, changeFrequency: "daily", priority: 1 }, ...exhibitionUrls];
}
