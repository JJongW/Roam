import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { hasGemini, hasCloudinary } from "@/lib/env";
import { CommunityView } from "@/components/community/community-view";

export const metadata = { title: "실시간 커뮤니티" };

type Props = { params: Promise<{ slug: string }> };

export default async function CommunityPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
  const { data: posts } = await repo.listPosts(detail.exhibition.id);

  return (
    <CommunityView
      slug={slug}
      booths={booths}
      initialPosts={posts}
      aiEnabled={hasGemini}
      mediaEnabled={hasCloudinary}
    />
  );
}
