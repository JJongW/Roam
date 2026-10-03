"use client";

import Link from "next/link";
import { CalendarDays, ChevronRight, MapPin, Sparkles } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import type { Exhibition } from "@/lib/types";
import type { ExhibitionStatusKind } from "@/lib/exhibition/status";
import type { ExhibitionSignals } from "@/lib/exhibition/signals";

/**
 * 전시 카드 — **상태가 형태를 정한다.**
 *
 * 예전엔 상태를 아예 안 받아서 진행 중·예정·종료가 전부 같은 카드였다.
 * 상태를 말하는 건 섹션 제목(작은 회색 글씨) 하나뿐이라, 스크롤로 그걸
 * 지나치면 끝난 전시가 지금 갈 수 있는 전시와 똑같이 보였다.
 * 색이나 작은 라벨만으로 상태를 나르면 색을 구분하기 어려운 사용자에게는
 * 아예 전달되지 않는다(WCAG 1.4.1) — 포스터 유무·카드/행으로 가른다.
 *
 * 예정에 포스터를 채우지 않는 이유: 부스 데이터가 아직 얇은데 포스터가
 * 꽉 차면 지금 들어갈 수 있는 것처럼 보인다.
 */
export function ExhibitionCard({
  exhibition,
  status,
  recommended = false,
  recommendedLabel = "로미 추천",
  signals,
}: {
  exhibition: Exhibition;
  status: ExhibitionStatusKind;
  /** 로미 추천 전시 — 진행 중에만 유효하다. */
  recommended?: boolean;
  recommendedLabel?: string;
  /** 결정 근거 — 진행 중 카드에서만 그린다(행에는 자리가 없다). */
  signals?: ExhibitionSignals;
}) {
  const t = useT();
  const range = `${format(new Date(exhibition.startDate), "M.d")} – ${format(new Date(exhibition.endDate), "M.d")}`;
  // TODO(별도 플랜): 끝난 전시는 목적지가 달라야 한다 — 지금은 진행 중과 같은
  // 화면으로 가서 온보딩·피드·"오늘 관람 마치기"가 그대로 뜬다. 읽기 전용
  // 기록 화면(`/exhibitions/[slug]/record`)은 이 플랜 범위 밖이라 라우트가
  // 없다. 없는 경로로 보내면 404가 되므로 지금은 같은 경로를 쓴다.
  const href = `/exhibitions/${exhibition.slug}`;
  const cta =
    status === "ongoing"
      ? t("home.enter")
      : status === "upcoming"
        ? t("home.browse")
        : t("home.viewRecord");

  // 진행 중만 꽉 찬 카드. 나머지는 행 — 결정 대상이 아니다.
  if (status !== "ongoing") {
    return (
      <Link
        href={href}
        className="flex min-h-11 items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 active:scale-[0.99]"
      >
        <span className="w-12 shrink-0 text-xs font-semibold tabular text-muted-foreground">
          {format(new Date(exhibition.startDate), "M.d")}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-bold">{exhibition.name}</span>
          <span className="block truncate text-xs text-muted-foreground">
            {exhibition.venue}
          </span>
        </span>
        <span className="shrink-0 text-xs font-semibold text-muted-foreground">
          {cta}
        </span>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground"
          aria-hidden
        />
      </Link>
    );
  }

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
        data-testid="exhibition-poster"
        className="relative flex h-28 items-end bg-gradient-to-br from-primary/85 to-[#4338ca] p-4"
        style={
          exhibition.coverImageUrl
            ? {
                backgroundImage: `url(${exhibition.coverImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center top",
              }
            : undefined
        }
      >
        {exhibition.coverImageUrl && (
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/15 to-transparent"
            aria-hidden
          />
        )}
        <h3 className="relative text-xl font-bold leading-tight text-white drop-shadow-sm">
          {exhibition.name}
        </h3>
      </div>
      <div className="space-y-1.5 p-4">
        {signals && (
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-medium text-foreground">
            <span className="tabular">
              {t("home.signalBooths", { n: signals.boothCount })}
            </span>
            {signals.daysLeft !== null && (
              <>
                <span aria-hidden>·</span>
                <span className="font-bold text-primary">
                  {signals.daysLeft === 1
                    ? t("home.signalLastDay")
                    : t("home.signalDaysLeft", { n: signals.daysLeft })}
                </span>
              </>
            )}
            {signals.groundedCount > 0 && (
              <>
                <span aria-hidden>·</span>
                <span className="tabular text-muted-foreground">
                  {t("home.signalGrounded", { n: signals.groundedCount })}
                </span>
              </>
            )}
          </p>
        )}
        <p className="type-body line-clamp-3 text-muted-foreground">
          {exhibition.description}
        </p>
        <div className="flex items-center gap-1 pt-1 text-sm font-medium text-foreground">
          <MapPin className="size-4 text-muted-foreground" aria-hidden />
          <span className="truncate">{exhibition.venue}</span>
          <span aria-hidden>·</span>
          <CalendarDays className="size-3.5" aria-hidden />
          <span className="tabular">{range}</span>
        </div>
        <p className="pt-1 text-sm font-bold text-primary">{cta}</p>
      </div>
    </Link>
  );
}
