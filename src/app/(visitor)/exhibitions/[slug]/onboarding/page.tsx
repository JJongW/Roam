import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { AICompanionOnboarding } from "@/components/onboarding/ai-companion-onboarding";

export const metadata = { title: "맞춤 추천" };

type Props = { params: Promise<{ slug: string }> };

export default async function OnboardingPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  // 부스 picker(이미 갈 부스 정한 분기)용 — 실제 출품 부스만, 가벼운 형태로.
  const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
  const pickable = booths
    .filter((b) => b.kind !== "facility")
    .map((b) => ({
      id: b.id,
      name: b.name,
      code: b.code,
      company: b.company,
    }));

  return (
    <AICompanionOnboarding
      slug={slug}
      categories={detail.categories}
      booths={pickable}
      startDate={detail.exhibition.startDate}
      endDate={detail.exhibition.endDate}
    />
  );
}
