import { notFound } from "next/navigation";
import { Ticket, ExternalLink, Globe } from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { AppBar } from "@/components/common/app-bar";
import { BookmarkButton } from "@/components/booth/bookmark-button";
import { BoothAiSummary } from "@/components/booth/booth-ai-summary";
import { BoothPersonalPanel } from "@/components/booth/booth-personal-panel";
import { BoothHighlights } from "@/components/booth/booth-highlights";
import { BoothTabs } from "@/components/booth/booth-tabs";
import { BoothPosts } from "@/components/booth/booth-posts";
import { CartButton } from "@/components/booth/cart-button";
import { CategoryChip } from "@/components/booth/category-chip";
import { ReviewSection } from "@/components/booth/review-section";
import { EventList } from "@/components/booth/event-list";
import { AnalyticsTracker } from "@/components/common/analytics-tracker";
import { Rating } from "@/components/common/rating";
import { Icon } from "@/components/common/icon";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const { id } = await params;
  const repo = await getRepository();
  const detail = await repo.getBoothDetail(id);
  if (!detail) return { title: "부스" };
  return {
    title: `${detail.booth.name} · ${detail.booth.company}`,
    description: detail.booth.description,
  };
}

export default async function BoothDetailPage({ params }: Props) {
  const { id } = await params;
  const repo = await getRepository();
  const detail = await repo.getBoothDetail(id);
  if (!detail) notFound();

  const { booth, category, welcomeKit, events, reviews, reviewSummary } =
    detail;

  return (
    <div className="contents landscape:fixed landscape:inset-0 landscape:z-30 landscape:flex landscape:flex-col landscape:overflow-hidden landscape:bg-background">
      <AnalyticsTracker
        type="view"
        boothId={booth.id}
        x={booth.x}
        y={booth.y}
      />
      <AppBar
        title={booth.name}
        right={
          <div className="flex items-center gap-1">
            {/* 동선에 담기 — lives in the title bar so it's reachable without
                scrolling past the intro. */}
            <CartButton boothId={booth.id} variant="icon" />
            <BookmarkButton targetType="booth" targetId={booth.id} />
          </div>
        }
      />
      <main className="flex-1 pb-10 landscape:flex landscape:min-h-0 landscape:flex-1 landscape:flex-row landscape:pb-0">
        {/* Landscape: identity column (hero + 정보 + AI 요약) on the left. */}
        <div className="contents landscape:flex landscape:w-[360px] landscape:shrink-0 landscape:flex-col landscape:overflow-y-auto landscape:border-r landscape:border-border">
          {/* hero */}
          <div
            className="flex items-center gap-4 p-5"
            style={{
              background: `linear-gradient(135deg, ${category.color}22, transparent)`,
            }}
          >
            <div
              className="flex size-16 items-center justify-center rounded-2xl"
              style={{
                backgroundColor: `${category.color}26`,
                color: category.color,
              }}
            >
              <Icon name={category.icon} className="size-8" />
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-xl font-extrabold">{booth.name}</h1>
              <p className="truncate text-sm text-muted-foreground">
                {booth.company}
              </p>
              <div className="mt-1.5 flex items-center gap-2">
                {reviewSummary.count > 0 ? (
                  <Rating value={reviewSummary.avg} size={14} showValue />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    리뷰 없음
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="px-5 py-2">
            {/* At-a-glance 정보 + AI 요약 stay above the tabs (always visible). */}
            <div className="flex flex-wrap items-center gap-2">
              {booth.code && (
                <span className="rounded-full border border-border bg-card px-3 py-1 text-sm font-bold tabular">
                  부스 {booth.code}
                </span>
              )}
              <CategoryChip category={category} />
            </div>

            <div className="mt-4">
              <BoothAiSummary boothId={booth.id} />
            </div>
          </div>
        </div>

        {/* Right pane (landscape) / continues below (portrait): the tabs. */}
        <div className="contents landscape:flex landscape:flex-1 landscape:flex-col landscape:overflow-y-auto">
          <div className="px-5 py-2 landscape:py-4">
            <BoothTabs
              intro={
                <div className="space-y-6">
                  {events.length > 0 && (
                    <section className="space-y-2.5">
                      <h2 className="text-base font-bold">이벤트</h2>
                      <EventList events={events} />
                    </section>
                  )}

                  {welcomeKit?.enabled && (
                    <section className="space-y-2.5">
                      <h2 className="text-base font-bold">웰컴 키트</h2>
                      <div className="flex items-center gap-3 rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
                        <div className="flex size-11 items-center justify-center rounded-xl bg-primary/10">
                          <Ticket className="size-5 text-primary" />
                        </div>
                        <div className="flex-1">
                          <p className="font-bold">{welcomeKit.name}</p>
                          <p className="text-sm text-muted-foreground">
                            {welcomeKit.description}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-secondary px-2.5 py-1 text-xs font-bold tabular text-secondary-foreground">
                          {welcomeKit.remainingCount}개 남음
                        </span>
                      </div>
                    </section>
                  )}

                  <section className="space-y-1.5">
                    <h2 className="text-base font-bold">소개</h2>
                    <div className="space-y-1.5 text-[15px] leading-relaxed text-foreground/90">
                      {booth.longDescription
                        .split(/(?<=[.!?])\s+/)
                        .map((s) => s.trim())
                        .filter(Boolean)
                        .map((s, i) => (
                          <p key={i}>{s}</p>
                        ))}
                    </div>
                  </section>

                  {/* AI-extracted 신간·굿즈 (renders only when found). */}
                  <BoothHighlights boothId={booth.id} />

                  {booth.aliases && booth.aliases.length > 0 && (
                    <section className="space-y-2">
                      <h2 className="text-base font-bold">
                        함께 입점한 곳 {booth.aliases.length}곳
                      </h2>
                      <div className="flex flex-wrap gap-1.5">
                        {booth.aliases.map((nm) => (
                          <span
                            key={nm}
                            className="rounded-full border border-border bg-card px-3 py-1 text-sm font-medium text-foreground/90"
                          >
                            {nm}
                          </span>
                        ))}
                      </div>
                    </section>
                  )}

                  {(booth.instagramUrl || booth.websiteUrl) && (
                    <section className="flex flex-wrap gap-2">
                      {booth.instagramUrl && (
                        <a
                          href={booth.instagramUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold active:scale-[0.98]"
                        >
                          <ExternalLink className="size-4 text-[#e1306c]" />{" "}
                          인스타그램
                        </a>
                      )}
                      {booth.websiteUrl && (
                        <a
                          href={booth.websiteUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold active:scale-[0.98]"
                        >
                          <Globe className="size-4 text-muted-foreground" />{" "}
                          웹사이트
                        </a>
                      )}
                    </section>
                  )}
                </div>
              }
              record={<BoothPersonalPanel boothId={booth.id} />}
              reviews={
                <ReviewSection
                  boothId={booth.id}
                  initialReviews={reviews}
                  initialSummary={reviewSummary}
                  previewCount={2}
                />
              }
              posts={<BoothPosts boothId={booth.id} previewCount={2} />}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
