import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { hasGemini } from "@/lib/env";
import { RouteView } from "@/components/route/route-view";
import type { Waiting } from "@/lib/types";

export const metadata = { title: "추천 동선" };

type Props = { params: Promise<{ slug: string }> };

export default async function RoutePage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
  const waitings: Record<string, Waiting> = {};
  for (const w of await repo.listWaitings(detail.exhibition.id))
    waitings[w.boothId] = w;

  return (
    <RouteView
      slug={slug}
      exhibition={detail.exhibition}
      booths={booths}
      categories={detail.categories}
      halls={detail.halls}
      waitings={waitings}
      aiEnabled={hasGemini}
    />
  );
}
