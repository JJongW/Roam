"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AtSign, Check, ChevronRight, Globe, MapPin, ShoppingBag } from "lucide-react";
import { clsx } from "clsx";
import { BackButton } from "@/components/v2/back-button";
import { HeartButton } from "@/components/v2/heart-button";
import { Snackbar } from "@/components/v2/snackbar";
import { useBoothSignals } from "@/components/booth-v2/booth-actions";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { Booth, Category } from "@/lib/types";

export interface BoothDetailV2Props {
  booth: Pick<Booth, "id" | "name" | "code" | "images" | "instagramUrl" | "websiteUrl"> & {
    goods: string[];
  };
  category?: Pick<Category, "name">;
  hallName?: string;
  exhibitionSlug?: string;
  /** 소개 글. 브랜드 공식 소개 > 부스 저작 요약 > 부스 원문 순서로 서버가 고른다(lib/brands/intro.ts). */
  intro?: string;
  introSource?: "brand" | "summary" | "original";
}

/**
 * UI 4-02 부스 상세(Figma 3015:1288). 위에서 아래로: 뒤로 → 사진 줄 → 이름과 위치 → 분류 배지
 * → 브랜드 소개 상자 → 정보 줄(위치, 파는 것, 인스타그램, 브랜드 사이트) → 아래 고정 바(하트, 다녀왔어요).
 *
 * - 정보가 비면 EM-1A: 이름이 1순위, 소개 상자 대신 "지금은 부스 이름과 위치만 나와 있어요."(11-15).
 * - 화살표는 갈 곳이 있는 줄에만(11-15).
 * - 브랜드가 직접 쓴 소개 원문은 고치지 않는다(브랜드 규칙 §1 예외, 11-09).
 * - 길 안내 버튼은 웹에 아직 없다(UI 9). 메모, 평가, 이벤트, 후기는 v1 상세에만 있고 다음 단계에서 옮긴다.
 */
export function BoothDetailV2({ booth, category, hallName, exhibitionSlug, intro, introSource }: BoothDetailV2Props) {
  const s = useBoothSignals({
    boothId: booth.id,
    name: booth.name,
    surface: "detail",
    screen: SCREEN.boothDetail,
    exhibitionSlug,
  });
  useEffect(() => {
    track("screen_view", {
      screen: SCREEN.boothDetail,
      exhibitionSlug,
      boothId: booth.id,
      props: { photo_count: booth.images.length, intro_source: introSource ?? "none" },
    });
  }, [booth.id, booth.images.length, exhibitionSlug, introSource]);

  const where = label.hallNumber(hallName, booth.code);
  const mapHref = exhibitionSlug ? `/exhibitions/${exhibitionSlug}/map?booth=${booth.id}` : undefined;
  const sparse = !intro && booth.goods.length === 0 && !booth.instagramUrl && !booth.websiteUrl;

  return (
    <div className="min-h-dvh bg-v2-bg-layer-default font-v2-ui text-v2-fg-neutral">
      <div className="mx-auto flex min-h-dvh w-full flex-col pb-v2-x28">
        <div className="flex items-center px-v2-x1-5 pt-safe">
          <BackButton fallbackHref={mapHref ?? "/"} />
        </div>

        {booth.images.length > 0 && (
          <ul aria-label={label.photo} className="flex gap-v2-x2 overflow-x-auto px-v2-x4 pt-v2-x2">
            {booth.images.map((src, i) => (
              <li key={src + i} className="w-2/5 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element -- 브랜드 사진은 외부 주소가 제각각이라 next/image 도메인 목록에 다 넣을 수 없다 */}
                <img
                  src={src}
                  alt={`${booth.name} ${label.photo} ${i + 1}`}
                  loading={i < 2 ? "eager" : "lazy"}
                  className="aspect-3/4 w-full rounded-v2-r3 bg-v2-bg-neutral-weak object-cover"
                />
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-v2-x3 px-v2-x4 pt-v2-x5">
          <div className="flex flex-col gap-v2-x1">
            <h1 className="text-v2-t7 font-v2-bold tracking-v2-card-title">{booth.name}</h1>
            {where && <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{where}</p>}
          </div>
          {category && (
            <div className="flex flex-wrap gap-v2-x1-5">
              <span className="flex min-h-v2-x6 items-center rounded-v2-r1-5 bg-v2-bg-neutral-weak px-v2-x2 py-v2-x1 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">
                {category.name}
              </span>
            </div>
          )}
        </div>

        <div className="px-v2-x4 pt-v2-x6">
          {intro ? (
            <section className="flex flex-col gap-v2-x1-5 rounded-v2-r3 bg-v2-bg-neutral-weak p-v2-x4">
              <h2 className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{label.brandIntro}</h2>
              <p className="whitespace-pre-line text-v2-t5 font-v2-regular leading-[var(--roam-v2-line-height-t6-5)] tracking-v2-body">
                {intro}
              </p>
            </section>
          ) : (
            sparse && <p className="text-v2-t4 text-v2-fg-neutral-muted">{system.nameAndLocationOnly}</p>
          )}
        </div>

        <ul className="flex flex-col pb-v2-x2 pt-v2-x4">
          {where && (
            <InfoRow
              icon={MapPin}
              title={label.location}
              sub={where}
              action={mapHref ? label.showOnMap : undefined}
              href={mapHref}
              onClick={() =>
                track("booth_show_on_map", { screen: SCREEN.boothDetail, exhibitionSlug, boothId: booth.id })
              }
            />
          )}
          {booth.goods.length > 0 && <InfoRow icon={ShoppingBag} title={label.goods} sub={booth.goods.join(", ")} />}
          {booth.instagramUrl && (
            <InfoRow
              icon={AtSign}
              title={label.instagram}
              sub={instagramHandle(booth.instagramUrl)}
              action={label.open}
              href={booth.instagramUrl}
              external
            />
          )}
          {booth.websiteUrl && (
            <InfoRow
              icon={Globe}
              title={label.website}
              sub={hostOf(booth.websiteUrl)}
              action={label.open}
              href={booth.websiteUrl}
              external
            />
          )}
        </ul>
      </div>

      {/* 아래 고정 바 */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-md">
        <div className="mx-auto w-full px-v2-x4 pb-v2-x2">
          <Snackbar state={s.snack} onClose={s.closeSnack} />
        </div>
        <div className="border-t border-v2-stroke-neutral-muted bg-v2-bg-layer-floating pb-safe">
          <div className="mx-auto flex w-full items-center gap-v2-x2 px-v2-x4 pt-v2-x3">
            <HeartButton on={s.hearted} onToggle={s.toggleHeart} />
            <button
              type="button"
              aria-pressed={s.visited}
              onClick={s.toggleVisited}
              className={clsx(
                "flex min-h-v2-x12 flex-1 items-center justify-center gap-v2-x1-5 rounded-[var(--roam-v2-trial-radius-control-1)] border text-v2-t4 font-v2-bold",
                s.visited
                  ? "border-v2-bg-brand-solid bg-v2-bg-brand-solid text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
                  : "border-v2-stroke-neutral-muted bg-v2-bg-layer-floating text-v2-fg-neutral active:bg-v2-bg-layer-floating-pressed",
              )}
            >
              {s.visited && <Check aria-hidden className="size-[var(--roam-v2-icon-size-sm)]" />}
              {label.visited}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({
  icon: Icon,
  title,
  sub,
  action,
  href,
  external,
  onClick,
}: {
  icon: typeof MapPin;
  title: string;
  sub?: string;
  action?: string;
  href?: string;
  external?: boolean;
  onClick?: () => void;
}) {
  const body = (
    <>
      <Icon aria-hidden className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral" />
      <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5">
        <span className="text-v2-t5 font-v2-medium text-v2-fg-neutral">{title}</span>
        {sub && <span className="break-words text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{sub}</span>}
      </span>
      {href && (
        <span className="flex shrink-0 items-center text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">
          {action}
          <ChevronRight aria-hidden className="size-[var(--roam-v2-icon-size-md)]" />
        </span>
      )}
    </>
  );
  const row = "flex w-full items-center gap-v2-x3 px-v2-x4 py-v2-x3 text-left";
  if (!href) return <li className={row}>{body}</li>;
  return (
    <li>
      {external ? (
        <a href={href} target="_blank" rel="noopener noreferrer" className={clsx(row, "active:bg-v2-bg-layer-default-pressed")}>
          {body}
        </a>
      ) : (
        <Link href={href} onClick={onClick} className={clsx(row, "active:bg-v2-bg-layer-default-pressed")}>
          {body}
        </Link>
      )}
    </li>
  );
}

function instagramHandle(url: string): string {
  const m = url.match(/instagram\.com\/([^/?#]+)/i);
  return m ? `@${m[1]}` : url;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host.replace(/^www\./, "");
  } catch {
    return url;
  }
}
