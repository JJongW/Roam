import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Map as MapIcon,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { getRepository } from "@/lib/repositories";
import { cn } from "@/lib/utils";
import { AppBar } from "@/components/common/app-bar";
import { AccountButton } from "@/components/auth/account-button";
import { InterestFeed } from "@/components/feed/interest-feed";
import { BoothSearch } from "@/components/feed/booth-search";
import { ValueOnboarding } from "@/components/onboarding/value-onboarding";
import { FinishVisit } from "@/components/companion/finish-visit";
import { PosterViewer } from "@/components/exhibition/poster-viewer";
import { HomeCompanionContextBridge } from "@/components/companion/home-companion-context";
import { DEFAULT_RHYTHM, isRhythm } from "@/lib/feed/rhythm";
import { getI18n } from "@/lib/i18n/server";
import { VALUE_SLUGS } from "@/lib/values";
import { getCurrentUser } from "@/lib/api/session";
import { curateFeed } from "@/lib/feed/curate";
import { readBrain } from "@/lib/memory/service";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rhythm?: string }>;
};

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

export default async function ExhibitionDetailPage({
  params,
  searchParams,
}: Props) {
  const { slug } = await params;
  const { rhythm: rhythmRaw } = await searchParams;
  const rhythm = isRhythm(rhythmRaw) ? rhythmRaw : DEFAULT_RHYTHM;
  const repo = await getRepository();
  const detail = await repo.getExhibition(slug);
  if (!detail) notFound();

  const { exhibition } = detail;
  const range = `${format(new Date(exhibition.startDate), "yyyy.M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;

  const { locale, t } = await getI18n();
  // 관심 피드: 로그인 사용자의 브레인 + 오늘의 리듬으로 큐레이션(빈 브레인=인기순).
  const user = await getCurrentUser();
  const feedItems = user ? await curateFeed(slug, user.id, rhythm, locale) : [];
  // 기억 발화: 브레인 상위 관심 가치로 인사(로케일 라벨). VALUE_SLUGS면 t로 번역.
  const brain = user ? await readBrain(user.id) : null;
  const topValues = (brain?.interests ?? [])
    .filter((n) => n.confidence >= 0.25)
    .slice(0, 2)
    .map((n) => (VALUE_SLUGS.includes(n.key) ? t(`values.${n.key}`) : n.label));
  const memoryLine = topValues.length
    ? t("feed.memoryLine", { values: topValues.join("·") })
    : undefined;
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
          {/* 크롭된 포스터 원본을 요구 시 전체 비율로 — 히어로 임팩트는 유지. */}
          {exhibition.coverImageUrl && (
            <PosterViewer
              src={exhibition.coverImageUrl}
              name={exhibition.name}
            />
          )}
          <div className="relative text-white">
            <h1 className="text-2xl font-extrabold leading-tight drop-shadow-sm">
              {exhibition.name}
            </h1>
          </div>
        </div>

        {/* pb-28: 하단 상주 컴패니언 필이 카드/버튼을 가리지 않도록 여백 확보. */}
        <div className="space-y-4 px-5 pt-5 pb-28 landscape:w-[420px] landscape:shrink-0 landscape:self-stretch landscape:overflow-y-auto landscape:border-l landscape:border-border">
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

          {/* 상단 고정 취향 배너는 걷어냈다 — 로미의 취향 발화는 하단 상주 컴패니언이
              휘발성으로 건넨다(맥락 인사를 화면 상단에 박아두지 않는다). 여기서는
              서버가 계산한 맥락(상위 가치·골라둔 개수)을 컴패니언에 실어줄 뿐. */}
          {user && (
            <HomeCompanionContextBridge
              values={topValues}
              picked={feedItems.length}
            />
          )}

          <div className="space-y-2.5">
            <ValueOnboarding
              slug={slug}
              exhibitionName={exhibition.name}
              hallCount={detail.halls.length}
              themes={detail.categories
                .slice(0, 3)
                .map((c) => c.name)
                .join("·")}
            />

            <Link
              href={`/exhibitions/${slug}/map`}
              className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] active:scale-[0.99]"
            >
              <div className="flex size-11 items-center justify-center rounded-xl bg-secondary">
                <MapIcon className="size-5 text-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold">{t("booth.mapCard")}</p>
                <p className="text-sm text-muted-foreground">
                  {t("booth.mapCardDesc")}
                </p>
              </div>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
            </Link>
          </div>

          {/* 피드 상단 부스 검색 — 추천 몇 개 말고 전체 부스를 이름·작가로 찾기. */}
          {user && <BoothSearch slug={slug} categoryById={categoryById} />}

          <InterestFeed
            items={feedItems}
            categoryById={categoryById}
            memoryLine={memoryLine}
          />

          {feedItems.length > 0 && <FinishVisit slug={slug} />}
        </div>
      </main>
    </div>
  );
}
