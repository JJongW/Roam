import { notFound } from "next/navigation";
import { FairHeartList } from "@/components/me/heart-list";
import { listMeFairs } from "@/lib/me/fairs";
import { todayISO } from "@/lib/exhibition/current";

/** UI 14-05 한 박람회의 하트 남긴 곳. 로그인 없이 연다. */
export default async function FairHeartsPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const fairs = await listMeFairs();
  const fair = fairs.find((f) => f.slug === slug);
  if (!fair) notFound();
  return <FairHeartList fair={fair} fairs={fairs} today={todayISO()} />;
}
