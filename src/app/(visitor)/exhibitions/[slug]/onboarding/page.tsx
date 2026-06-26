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
  return (
    <AICompanionOnboarding
      slug={slug}
      categories={detail.categories}
      startDate={detail.exhibition.startDate}
      endDate={detail.exhibition.endDate}
    />
  );
}
