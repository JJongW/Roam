import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CalendarDays,
  MapPin,
  Map as MapIcon,
  NotebookPen,
  ChevronRight,
} from "lucide-react";
import { format } from "date-fns";
import { getExhibitionCached } from "@/lib/repositories/cached";
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
import { getRepository } from "@/lib/repositories";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ rhythm?: string }>;
};

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  // 페이지 본문과 같은 요청 캐시를 타서 전시 조회가 한 번만 나간다.
  const detail = await getExhibitionCached(slug);
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
  // 전시·로케일·로그인은 서로 독립이라 같이 기다린다(감사 P1-3).
  const [detail, { locale, t }, user] = await Promise.all([
    getExhibitionCached(slug),
    getI18n(),
    getCurrentUser(),
  ]);
  if (!detail) notFound();

  const { exhibition } = detail;
  const range = `${format(new Date(exhibition.startDate), "yyyy.M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;

  // 브레인은 한 번만 읽고 피드 큐레이션에 그대로 넘긴다(예전엔 여기서 한 번, curateFeed
  // 안에서 또 한 번 읽었다).
  const brain = user ? await readBrain(user.id) : null;
  // 관심 피드: 로그인 사용자의 브레인 + 오늘의 리듬으로 큐레이션(빈 브레인=인기순).
  const feedItems =
    user && brain
      ? await curateFeed(slug, user.id, rhythm, locale, brain)
      : [];
  // 기억 발화: 브레인 상위 관심 가치로 인사(로케일 라벨). VALUE_SLUGS면 t로 번역.
  const topValues = (brain?.interests ?? [])
    .filter((n) => n.confidence >= 0.25)
    .slice(0, 2)
    .map((n) => (VALUE_SLUGS.includes(n.key) ? t(`values.${n.key}`) : n.label));
  const memoryLine = topValues.length
    ? t("feed.memoryLine", { values: topValues.join("·") })
    : undefined;
  // 취향 정확도 — 브레인 파생이 아니라 booth_note 직접 집계(브레인이 아니라
  // "반응이 로미의 예측을 맞혔는가"로 잰다). 예전 tasteProgress(접촉량 기반)는
  // 삭제됐다.
  const taste = user
    ? await (await getRepository()).getTasteAccuracy(
        user.id,
        detail.exhibition.id,
      )
    : { judgedCount: 0, pct: null };
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
                  // 위 정렬 — 포스터는 위부터 읽히게 만든다(로고·타이틀이 상단).
                  // 가운데 정렬은 세로 긴 포스터에서 본문 덩어리(참가자 목록 같은
                  // 잔글씨)만 잘라 보여준다. 이름은 아래 h1이 이미 말한다.
                  // ponytail: 포스터별로 초점이 달라지면 그때 cover_position 컬럼.
                  backgroundPosition: "center top",
                }
              : undefined
          }
        >
          <div
            className={cn(
              "absolute inset-0",
              exhibition.coverImageUrl
                ? "bg-gradient-to-t from-black/40 to-transparent"
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
          {/* 이름은 위 AppBar가 이미 h1으로 말한다 — 여기 또 h1을 두면 한 페이지에
              h1이 둘이 되고, 포스터에 박힌 전시명 위에 같은 글자가 겹쳐 찍힌다.
              포스터가 있으면 포스터가 제목이고, 없으면 그라디언트 위에 이름을 쓴다. */}
          {!exhibition.coverImageUrl && (
            <p className="relative text-2xl font-extrabold leading-tight text-white drop-shadow-sm">
              {exhibition.name}
            </p>
          )}
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
              tasteJudged={taste.judgedCount}
              tastePct={taste.pct}
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
              hasChosenValues={topValues.length > 0}
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

            {/* 메모장 — 예전엔 지도 상단바에서 열었는데, 지도는 현장에서 방향을 잡는
                화면이라 chrome을 걷어냈다(ux-writing §379). 진입점을 여기로 옮긴다. */}
            {user && (
              <Link
                href={`/exhibitions/${slug}/notes`}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] active:scale-[0.99]"
              >
                <div className="flex size-11 items-center justify-center rounded-xl bg-secondary">
                  <NotebookPen className="size-5 text-foreground" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold">{t("booth.notesCard")}</p>
                  <p className="text-sm text-muted-foreground">
                    {t("booth.notesCardDesc")}
                  </p>
                </div>
                <ChevronRight className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            )}
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
