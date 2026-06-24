import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { MapView } from "@/components/map/map-view";

export const metadata = { title: "지도" };

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ booth?: string }>;
};

export default async function MapPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { booth } = await searchParams;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);

  return <MapView detail={detail} booths={booths} initialFocusId={booth} />;
}
