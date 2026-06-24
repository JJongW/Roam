import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { NotesView } from "@/components/booth/notes-view";

export const metadata = { title: "내 메모장" };

type Props = { params: Promise<{ slug: string }> };

export default async function NotesPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);

  return (
    <NotesView slug={slug} booths={booths} categories={detail.categories} />
  );
}
