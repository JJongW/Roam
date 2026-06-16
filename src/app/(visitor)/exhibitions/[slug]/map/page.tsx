import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { MapView } from "@/components/map/map-view";
import type { Waiting } from "@/lib/types";

export const metadata = { title: "지도" };

type Props = { params: Promise<{ slug: string }> };

export default async function MapPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
  const waitings: Record<string, Waiting> = {};
  for (const w of await repo.listWaitings(detail.exhibition.id))
    waitings[w.boothId] = w;

  return <MapView detail={detail} booths={booths} waitings={waitings} />;
}
