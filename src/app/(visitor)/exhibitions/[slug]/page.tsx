import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Map as MapIcon,
  Route as RouteIcon,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { getRepository } from "@/lib/repositories";
import { cn } from "@/lib/utils";
import { AppBar } from "@/components/common/app-bar";
import { AccountButton } from "@/components/auth/account-button";
import { InterestFeed } from "@/components/feed/interest-feed";
import { ValueOnboarding } from "@/components/onboarding/value-onboarding";
import { getCurrentUser } from "@/lib/api/session";
import { curateFeed } from "@/lib/feed/curate";

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

  const { exhibition } = detail;
  const range = `${format(new Date(exhibition.startDate), "yyyy.M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;

  // 관심 피드: 로그인 사용자의 브레인으로 큐레이션한 부스 top-6(빈 브레인=인기순).
  const user = await getCurrentUser();
  const feedItems = user ? await curateFeed(slug, user.id, 6) : [];
  const categoryById = Object.fromEntries(
    detail.categories.map((c) => [c.id, c]),
  );

  return (
    <div className="contents landscape:fixed landscape:inset-0 landscape:z-30 landscape:flex landscape:flex-col landscape:overflow-hidden landscape:bg-background">
      <AppBar title={exhibition.name} right={<AccountButton />} />
      <main className="flex-1 pb-8 landscape:flex landscape:min-h-0 landscape:flex-1 landscape:flex-row landscape:pb-0">
        {/* Hero = the fair's own poster when set (cover_image_url), else the
            brand gradient. Data-driven, so any added exhibition gets its poster
            here just by setting coverImageUrl — no per-fair code. In landscape
            it becomes the full-height left column. */}
        <div
          className="relative flex h-52 items-end p-5 landscape:h-auto landscape:flex-1"
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
                ? "bg-gradient-to-t from-black/45 via-black/10 to-transparent"
                : "bg-gradient-to-br from-primary/85 to-[#4338ca]",
            )}
            aria-hidden
          />
          <div className="relative text-white">
            <h1 className="text-2xl font-extrabold leading-tight drop-shadow-sm">
              {exhibition.name}
            </h1>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 landscape:w-[420px] landscape:shrink-0 landscape:self-stretch landscape:overflow-y-auto landscape:border-l landscape:border-border">
          <section className="space-y-1.5">
            <div className="flex items-center gap-2 text-sm font-medium">
              <MapPin className="size-4 text-muted-foreground" aria-hidden />
              {exhibition.venue}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <CalendarDays className="size-4" aria-hidden />
              {range}
            </div>
          </section>

          <div className="space-y-2.5">
            <ValueOnboarding slug={slug} />

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

            <Link
              href={`/exhibitions/${slug}/map`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] active:scale-[0.99]"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-secondary">
                <MapIcon className="size-5 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">지도 보기 · 부스 담기</p>
                <p className="text-sm text-muted-foreground">
                  전시장 지도에서 직접 둘러보고 부스를 담아요
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </div>

          <InterestFeed items={feedItems} categoryById={categoryById} />
        </div>
      </main>
    </div>
  );
}
