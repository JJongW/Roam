import { notFound } from "next/navigation";
import { Ticket, ExternalLink, Globe } from "lucide-react";
import { getRepository } from "@/lib/repositories";
import { AppBar } from "@/components/common/app-bar";
import { BookmarkButton } from "@/components/booth/bookmark-button";
import { BoothPersonalPanel } from "@/components/booth/booth-personal-panel";
import { BoothPosts } from "@/components/booth/booth-posts";
import { CartButton } from "@/components/booth/cart-button";
import { CategoryChip } from "@/components/booth/category-chip";
import { WaitingBadge } from "@/components/booth/waiting-badge";
import { ReviewSection } from "@/components/booth/review-section";
import { LiveWaitingCard } from "@/components/booth/live-waiting-card";
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

  const {
    booth,
    category,
    waiting,
    welcomeKit,
    events,
    reviews,
    reviewSummary,
  } = detail;

  return (
    <>
      <AnalyticsTracker
        type="view"
        boothId={booth.id}
        x={booth.x}
        y={booth.y}
      />
      <AppBar
        title={booth.name}
        right={<BookmarkButton targetType="booth" targetId={booth.id} />}
      />
      <main className="flex-1 pb-10">
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
                <span className="text-xs text-muted-foreground">리뷰 없음</span>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6 px-5 py-2">
          <div className="flex flex-wrap items-center gap-2">
            <CategoryChip category={category} />
            <WaitingBadge waiting={waiting} showQueue />
          </div>

          <CartButton boothId={booth.id} className="w-full" />

          {/* waiting (live) */}
          <LiveWaitingCard boothId={booth.id} initial={waiting} />

          {/* description */}
          <section className="space-y-1.5">
            <h2 className="text-base font-bold">소개</h2>
            <p className="text-[15px] leading-relaxed text-foreground/90">
              {booth.longDescription}
            </p>
          </section>

          {/* outbound links (Instagram / website) */}
          {(booth.instagramUrl || booth.websiteUrl) && (
            <section className="flex flex-wrap gap-2">
              {booth.instagramUrl && (
                <a
                  href={booth.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold active:scale-[0.98]"
                >
                  <ExternalLink className="size-4 text-[#e1306c]" /> 인스타그램
                </a>
              )}
              {booth.websiteUrl && (
                <a
                  href={booth.websiteUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-2 text-sm font-semibold active:scale-[0.98]"
                >
                  <Globe className="size-4 text-primary" /> 웹사이트
                </a>
              )}
            </section>
          )}

          {/* personal records: visited / save-for-later / memo */}
          <BoothPersonalPanel boothId={booth.id} />

          {/* events */}
          {events.length > 0 && (
            <section className="space-y-2.5">
              <h2 className="text-base font-bold">이벤트</h2>
              <EventList events={events} />
            </section>
          )}

          {/* welcome kit */}
          {welcomeKit?.enabled && (
            <section className="space-y-2.5">
              <h2 className="text-base font-bold">웰컴 키트</h2>
              <div className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-accent/50 p-4">
                <div className="flex size-11 items-center justify-center rounded-xl bg-primary/15">
                  <Ticket className="size-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-bold">{welcomeKit.name}</p>
                  <p className="text-sm text-muted-foreground">
                    {welcomeKit.description}
                  </p>
                </div>
                <span className="shrink-0 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-bold tabular text-primary">
                  {welcomeKit.remainingCount}개 남음
                </span>
              </div>
            </section>
          )}

          <ReviewSection
            boothId={booth.id}
            initialReviews={reviews}
            initialSummary={reviewSummary}
          />

          <BoothPosts boothId={booth.id} />
        </div>
      </main>
    </>
  );
}
