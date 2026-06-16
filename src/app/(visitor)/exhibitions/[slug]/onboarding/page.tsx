import { notFound } from "next/navigation";
import { getRepository } from "@/lib/repositories";
import { hasGemini } from "@/lib/env";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata = { title: "맞춤 추천" };

type Props = { params: Promise<{ slug: string }> };

export default async function OnboardingPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();
  return (
    <OnboardingWizard
      slug={slug}
      categories={detail.categories}
      aiEnabled={hasGemini}
    />
  );
}
