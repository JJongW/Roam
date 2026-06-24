import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { MapView } from "@/components/map/map-view";
import { BottomNav } from "@/components/common/bottom-nav";

export const metadata = { title: "지도" };

type Props = { params: Promise<{ slug: string }> };

export default async function MapPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);

  return (
    <>
      <MapView detail={detail} booths={booths} />
      {/* Bottom nav only in portrait — wide/landscape use the side panel. */}
      <div className="md:hidden landscape:hidden">
        <BottomNav slug={slug} />
      </div>
    </>
  );
}
