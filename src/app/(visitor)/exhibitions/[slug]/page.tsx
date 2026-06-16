import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Sparkles,
  Map as MapIcon,
  MessagesSquare,
  Route as RouteIcon,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { getRepository } from "@/lib/repositories";
import { AppBar } from "@/components/common/app-bar";
import { AccountButton } from "@/components/auth/account-button";
import { Tips } from "@/components/exhibition/tips";
import { CategoryChip } from "@/components/booth/category-chip";
import { Button } from "@/components/ui/button";

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) return { title: "전시" };
  return {
    title: detail.exhibition.name,
    description: detail.exhibition.description,
  };
}

export default async function ExhibitionDetailPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const { exhibition, categories } = detail;
  const booths = await repo.listBoothsByExhibitionId(exhibition.id);
  const range = `${format(new Date(exhibition.startDate), "yyyy.M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;

  return (
    <>
      <AppBar title={exhibition.name} right={<AccountButton />} />
      <main className="flex-1 pb-32">
        <div className="relative flex h-44 items-end bg-gradient-to-br from-primary/85 to-[#1b64da] p-5">
          <div className="text-white">
            <h1 className="text-2xl font-extrabold leading-tight drop-shadow-sm">
              {exhibition.name}
            </h1>
          </div>
        </div>

        <div className="space-y-6 px-5 py-5">
          <section className="space-y-2.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4 text-primary" aria-hidden />
              {exhibition.venue}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              {range}
            </div>
            <p className="text-[15px] leading-relaxed text-foreground/90">
              {exhibition.description}
            </p>
          </section>

          <section className="space-y-2">
            <h2 className="text-sm font-bold text-muted-foreground">
              카테고리 · 부스 {booths.length}개
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {categories.map((c) => (
                <CategoryChip key={c.id} category={c} />
              ))}
            </div>
          </section>

          <Link
            href={`/exhibitions/${slug}/community`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] active:scale-[0.99]"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/12">
              <MessagesSquare className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">실시간 커뮤니티</p>
              <p className="text-sm text-muted-foreground">
                현장 소식·대기 정보를 방문객과 나눠보세요
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>

          <Link
            href={`/exhibitions/${slug}/routes`}
            className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] active:scale-[0.99]"
          >
            <div className="flex size-11 items-center justify-center rounded-xl bg-primary/12">
              <RouteIcon className="size-5 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="font-bold">다른 사람 동선 둘러보기</p>
              <p className="text-sm text-muted-foreground">
                방문객이 공유한 추천 코스를 따라가 보세요
              </p>
            </div>
            <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
          </Link>

          <section className="space-y-2.5">
            <h2 className="text-base font-bold">방문 팁</h2>
            <Tips tips={exhibition.tips} />
          </section>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-40 mx-auto flex w-full max-w-md gap-2 border-t border-border bg-background/90 p-4 pb-safe backdrop-blur-xl">
        <Button asChild variant="secondary" size="lg" className="flex-1">
          <Link href={`/exhibitions/${slug}/map`}>
            <MapIcon className="size-5" /> 지도
          </Link>
        </Button>
        <Button asChild size="lg" className="flex-[2]">
          <Link href={`/exhibitions/${slug}/onboarding`}>
            <Sparkles className="size-5" /> 맞춤 추천 받기
          </Link>
        </Button>
      </div>
    </>
  );
}
