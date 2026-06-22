import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Map as MapIcon,
  Route as RouteIcon,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { format } from "date-fns";
import { getRepository } from "@/lib/repositories";
import { cn } from "@/lib/utils";
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
    title: `${detail.exhibition.name} (가로)`,
    description: detail.exhibition.description,
  };
}

/**
 * Landscape landing — same data as the portrait page, laid out as two columns
 * for wide screens: the fair poster fills the left, all info + actions scroll on
 * the right. Falls back to a single column on narrow widths.
 */
export default async function LandscapeExhibitionPage({ params }: Props) {
  const { slug } = await params;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const { exhibition, categories } = detail;
  const range = `${format(new Date(exhibition.startDate), "yyyy.M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;

  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      {/* Left: the fair poster (coverImageUrl) — same data-driven hero as portrait. */}
      <div
        className="relative flex h-56 items-end p-6 md:h-auto md:w-[42%] md:shrink-0"
        style={
          exhibition.coverImageUrl
            ? {
                backgroundImage: `url(${exhibition.coverImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
      >
        <div
          className={cn(
            "absolute inset-0",
            exhibition.coverImageUrl
              ? "bg-gradient-to-t from-black/55 via-black/10 to-transparent md:bg-gradient-to-r md:from-black/10 md:to-transparent"
              : "bg-gradient-to-br from-primary/85 to-[#4338ca]",
          )}
          aria-hidden
        />
        <div className="relative text-white drop-shadow-sm md:hidden">
          <h1 className="text-2xl font-extrabold leading-tight">
            {exhibition.name}
          </h1>
        </div>
      </div>

      {/* Right: info + actions, scrollable. */}
      <div className="flex min-h-dvh flex-1 flex-col">
        <header className="sticky top-0 z-40 flex items-center justify-between gap-2 border-b border-border bg-background/80 px-6 py-3 backdrop-blur-xl">
          <h1 className="truncate text-lg font-extrabold">{exhibition.name}</h1>
          <AccountButton />
        </header>

        <main className="flex-1 overflow-y-auto px-6 py-5">
          <div className="mx-auto grid max-w-3xl gap-6 lg:grid-cols-2">
            <section className="space-y-2.5">
              <div className="flex items-center gap-2 text-sm font-medium">
                <MapPin className="size-4 text-muted-foreground" aria-hidden />
                {exhibition.venue}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CalendarDays className="size-4" aria-hidden />
                {range}
              </div>
              <p className="text-[15px] leading-relaxed text-foreground/90">
                {exhibition.description}
              </p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {categories.map((c) => (
                  <CategoryChip key={c.id} category={c} />
                ))}
              </div>
            </section>

            <div className="space-y-3">
              <Link
                href={`/exhibitions/${slug}/onboarding`}
                className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-accent/40 p-4 shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                  <Sparkles className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">동선 추천받기</p>
                  <p className="text-sm text-muted-foreground">
                    관심사·시간에 맞춰 맞춤 관람 코스를 짜드려요
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>

              <Link
                href={`/exhibitions/${slug}/routes`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-secondary">
                  <RouteIcon className="size-5 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">다른 사람 동선 둘러보기</p>
                  <p className="text-sm text-muted-foreground">
                    방문객이 공유한 추천 코스를 따라가 보세요
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </div>

            <section className="space-y-2.5 lg:col-span-2">
              <h2 className="text-base font-bold">방문 팁</h2>
              <Tips tips={exhibition.tips} />
            </section>
          </div>
        </main>

        <footer className="sticky bottom-0 z-40 border-t border-border bg-background/90 px-6 py-4 backdrop-blur-xl">
          <Button asChild size="lg" className="w-full md:w-auto">
            <Link href={`/exhibitions/${slug}/map`}>
              <MapIcon className="size-5" /> 지도 보기 · 부스 담기
            </Link>
          </Button>
        </footer>
      </div>
    </div>
  );
}
