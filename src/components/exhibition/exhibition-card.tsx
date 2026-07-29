import Link from "next/link";
import { CalendarDays, MapPin, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { Exhibition } from "@/lib/types";

export function ExhibitionCard({
  exhibition,
  recommended = false,
  recommendedLabel = "로미 추천",
}: {
  exhibition: Exhibition;
  /** 로미 추천 전시 — 테두리 강조 + 배지. */
  recommended?: boolean;
  recommendedLabel?: string;
}) {
  const range = `${format(new Date(exhibition.startDate), "M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;
  // 전시 상세(피드 홈)로 착지 — 가치 온보딩·관심 피드가 진입점. 지도는 상세의 부가 진입.
  const href = `/exhibitions/${exhibition.slug}`;
  return (
    <Link
      href={href}
      className={cn(
        "group block overflow-hidden rounded-2xl border bg-card shadow-[var(--shadow-card)] transition-transform active:scale-[0.99]",
        recommended ? "border-primary ring-2 ring-primary/30" : "border-border",
      )}
    >
      {recommended && (
        <div className="flex items-center gap-1 bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
          <Sparkles className="size-3.5" aria-hidden />
          {recommendedLabel}
        </div>
      )}
      <div
        className="relative flex h-36 items-end bg-gradient-to-br from-primary/85 to-[#4338ca] p-4"
        style={
          exhibition.coverImageUrl
            ? {
                backgroundImage: `url(${exhibition.coverImageUrl})`,
                backgroundSize: "cover",
                // 전시 홈 히어로와 같은 위 정렬(page.tsx 참조).
                backgroundPosition: "center top",
              }
            : undefined
        }
      >
        {/* 포스터를 깔면 흰 제목이 밝은 포스터(하늘색·크림) 위에서 사라진다 —
            전시 홈 히어로와 같은 스크림으로 제목의 바닥을 만든다. 위는 비워
            포스터의 로고·크레딧이 가려지지 않게 한다. */}
        {exhibition.coverImageUrl && (
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"
            aria-hidden
          />
        )}
        {/* 기간 필은 걷어냈다 — 아래 본문이 같은 날짜를 이미 말한다(중복). */}
        <h3 className="relative text-xl font-bold leading-tight text-white drop-shadow-sm">
          {exhibition.name}
        </h3>
      </div>
      <div className="space-y-1.5 p-4">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {exhibition.description}
        </p>
        <div className="flex items-center gap-1 pt-1 text-sm font-medium text-foreground">
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{exhibition.venue}</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <CalendarDays className="size-3.5" aria-hidden />
          {range}
        </div>
      </div>
    </Link>
  );
}
