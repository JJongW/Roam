import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { NavigateView } from "@/components/navigation/navigate-view";

export const metadata = { title: "내비게이션" };

type Props = { params: Promise<{ slug: string }> };

export default async function NavigatePage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();
  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
  return (
    <NavigateView
      slug={slug}
      exhibition={detail.exhibition}
      booths={booths}
      categories={detail.categories}
      halls={detail.halls}
    />
  );
}
