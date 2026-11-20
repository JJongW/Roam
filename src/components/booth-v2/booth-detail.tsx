"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AtSign,
  Check,
  ChevronRight,
  Globe,
  MapPin,
  ShoppingBag,
} from "lucide-react";
import { clsx } from "clsx";
import { BackButton } from "@/components/v2/back-button";
import { HeartButton } from "@/components/v2/heart-button";
import { Snackbar } from "@/components/v2/snackbar";
import { useBoothSignals } from "@/components/booth-v2/booth-actions";
import { LeftSection } from "@/components/booth-v2/left-section";
import { VerdictBand } from "@/components/booth-v2/verdict-band";
import { BrandRow } from "@/components/booth-v2/brand-row";
import { PhotoViewer } from "@/components/booth-v2/photo-viewer";
import {
  AliasesSection,
  AppearancesSection,
  EventsSection,
  WelcomeKitSection,
  type Appearance,
} from "@/components/booth-v2/booth-extras";
import { label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import type { Booth, BoothEvent, Category, WelcomeKit } from "@/lib/types";

export interface BoothDetailV2Props {
  booth: Pick<
    Booth,
    "id" | "name" | "code" | "images" | "instagramUrl" | "websiteUrl"
  > & {
    goods: string[];
  };
  category?: Pick<Category, "name">;
  hallName?: string;
  exhibitionSlug?: string;
  /** 소개 글. 브랜드 공식 소개 > 부스 저작 요약 > 부스 원문 순서로 서버가 고른다(lib/brands/intro.ts). */
  intro?: string;
  introSource?: "brand" | "summary" | "original";
  events?: BoothEvent[];
  welcomeKit?: WelcomeKit;
  appearances?: Appearance[];
  aliases?: string[];
  /** 박람회가 끝났으면 위에 "어떠셨어요?" 띠(6-09). 여는 날엔 평가를 묻지 않는다. */
  fairEnded?: boolean;
  /** UI 19-A1 브랜드 줄. 부스에 대표 브랜드가 이어져 있을 때만. 이름은 브랜드 이름, 없으면 부스 이름. */
  brand?: { exhibitorId: string; name: string };
  /** 여는 날이고 배치도가 있으면 아래 바에 "길 안내"(4-02). 누르면 지도로 돌아가 그 부스로 길 안내(UI 9)를 시작한다. */
  canRoute?: boolean;
}

/**
 * UI 4-02 부스 상세(Figma 3015:1288). 위에서 아래로: 뒤로 → 사진 줄 → 이름과 위치 → 분류 배지
 * → 브랜드 소개 상자 → 브랜드 줄(UI 19-A1) → 정보 줄(위치, 파는 것, 인스타그램, 브랜드 사이트) → 아래 고정 바(하트, 다녀왔어요).
 *
 * - 정보가 비면 EM-1A: 이름이 1순위, 소개 상자 대신 "지금은 부스 이름과 위치만 나와 있어요."(11-15).
 * - 화살표는 갈 곳이 있는 줄에만(11-15).
 * - 브랜드가 직접 쓴 소개 원문은 고치지 않는다(브랜드 규칙 §1 예외, 11-09).
 * - 사진을 누르면 4-03 사진 크게 보기(옆으로 넘김, 알약 "2 / 5").
 * - 4-07 "지도에서 보기"는 상세를 쌓지 않고 지도로 바꿔 연다(뒤로 가기가 길어지지 않는다, 11-13).
 * - 아래 바 "길 안내"(4-02, 4-04, 4-05, 11-20 Ted): 상세를 닫고 지도로 바꿔 열어 그 부스로 길 안내(UI 9)를 시작한다
 *   (`/map?booth=<id>&route=1`). 지도 카드와 같은 조건(여는 날, 배치도)일 때만 보인다.
 * - W2: 남기신 것(6-05, 6-07, 6-08), 끝난 박람회의 어떠셨어요 띠(6-09), v1에서 옮긴 이벤트, 웰컴 키트,
 *   다른 행사에서도, 함께 입점한 곳. AI 요약과 후기는 옮기지 않았다(docs/decisions/2026-11-18_웹-디자인-v2-이전-계획.md W2).
 */
export function BoothDetailV2({
  booth,
  category,
  hallName,
  exhibitionSlug,
  intro,
  introSource,
  events = [],
  welcomeKit,
  appearances = [],
  aliases,
  fairEnded,
  brand,
  canRoute,
}: BoothDetailV2Props) {
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
      props: {
        photo_count: booth.images.length,
        intro_source: introSource ?? "none",
      },
    });
  }, [booth.id, booth.images.length, exhibitionSlug, introSource]);

  const router = useRouter();
  const [viewer, setViewer] = useState<number | null>(null);
  const where = label.hallNumber(hallName, booth.code);
  const mapHref = exhibitionSlug
    ? `/exhibitions/${exhibitionSlug}/map?booth=${booth.id}`
    : undefined;
  const sparse =
    !intro &&
    booth.goods.length === 0 &&
    !booth.instagramUrl &&
    !booth.websiteUrl;

  return (
    <div className="min-h-dvh bg-v2-bg-layer-default font-v2-ui text-v2-fg-neutral">
      <div className="mx-auto flex min-h-dvh w-full flex-col pb-v2-x28">
        <div className="flex items-center px-v2-x1-5 pt-safe">
          <BackButton fallbackHref={mapHref ?? "/"} />
        </div>

        {fairEnded && (
          <VerdictBand
            boothId={booth.id}
            name={booth.name}
            screen={SCREEN.boothDetail}
            exhibitionSlug={exhibitionSlug}
          />
        )}

        {booth.images.length > 0 && (
          <ul
            aria-label={label.photo}
            className="flex gap-v2-x2 overflow-x-auto px-v2-x4 pt-v2-x2"
          >
            {booth.images.map((src, i) => (
              <li key={src + i} className="w-2/5 shrink-0">
                <button
                  type="button"
                  onClick={() => setViewer(i)}
                  className="block w-full rounded-v2-r3 active:opacity-80"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- 브랜드 사진은 외부 주소가 제각각이라 next/image 도메인 목록에 다 넣을 수 없다 */}
                  <img
                    src={src}
                    alt={`${booth.name} ${label.photo} ${i + 1}`}
                    loading={i < 2 ? "eager" : "lazy"}
                    className="aspect-3/4 w-full rounded-v2-r3 bg-v2-bg-neutral-weak object-cover"
                  />
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col gap-v2-x3 px-v2-x4 pt-v2-x5">
          <div className="flex flex-col gap-v2-x1">
            <h1 className="text-v2-t7 font-v2-bold tracking-v2-card-title">
              {booth.name}
            </h1>
            {where && (
              <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                {where}
              </p>
            )}
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
              <h2 className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                {label.brandIntro}
              </h2>
              <p className="whitespace-pre-line text-v2-t5 font-v2-regular leading-[var(--roam-v2-line-height-t6-5)] tracking-v2-body">
                {intro}
              </p>
            </section>
          ) : (
            sparse && (
              <p className="text-v2-t4 text-v2-fg-neutral-muted">
                {system.nameAndLocationOnly}
              </p>
            )
          )}
        </div>

        {brand && (
          <div className="px-v2-x4 pt-v2-x4">
            <BrandRow
              exhibitorId={brand.exhibitorId}
              name={brand.name}
              exhibitionSlug={exhibitionSlug}
              show={s.show}
            />
          </div>
        )}

        <ul className="flex flex-col pb-v2-x2 pt-v2-x4">
          {where && (
            <InfoRow
              icon={MapPin}
              title={label.location}
              sub={where}
              action={mapHref ? label.showOnMap : undefined}
              href={mapHref}
              onClick={(e) => {
                track("booth_show_on_map", {
                  screen: SCREEN.boothDetail,
                  exhibitionSlug,
                  boothId: booth.id,
                });
                // 4-07: 상세를 닫고 그 자리에 지도를 연다(화면을 쌓지 않는다). 새 탭으로 여는 누름은 그대로 둔다.
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
                e.preventDefault();
                router.replace(mapHref!);
              }}
            />
          )}
          {booth.goods.length > 0 && (
            <InfoRow
              icon={ShoppingBag}
              title={label.goods}
              sub={booth.goods.join(", ")}
            />
          )}
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

        <LeftSection
          boothId={booth.id}
          name={booth.name}
          screen={SCREEN.boothDetail}
          exhibitionSlug={exhibitionSlug}
          show={s.show}
        />
        <EventsSection events={events} show={s.show} />
        <WelcomeKitSection kit={welcomeKit} />
        <AppearancesSection items={appearances} />
        <AliasesSection names={aliases} />
      </div>

      {viewer !== null && (
        <PhotoViewer
          images={booth.images}
          start={viewer}
          name={booth.name}
          boothId={booth.id}
          exhibitionSlug={exhibitionSlug}
          onClose={() => setViewer(null)}
        />
      )}

      {/* 아래 고정 바 */}
      <div className="fixed inset-x-0 bottom-0 z-20 mx-auto w-full max-w-[var(--roam-v2-size-content-max-width)]">
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
                "flex min-h-v2-x12 items-center justify-center gap-v2-x1-5 rounded-[var(--roam-v2-trial-radius-control-1)] border text-v2-t4 font-v2-bold",
                // 길 안내가 있으면 다녀왔어요는 글자만큼, 길 안내가 남은 폭을 쓴다(Figma 4-02).
                canRoute && mapHref ? "shrink-0 px-v2-x4" : "flex-1",
                s.visited
                  ? "border-v2-bg-brand-solid bg-v2-bg-brand-solid text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
                  : "border-v2-stroke-neutral-muted bg-v2-bg-layer-floating text-v2-fg-neutral active:bg-v2-bg-layer-floating-pressed",
              )}
            >
              {s.visited && (
                <Check
                  aria-hidden
                  className="size-[var(--roam-v2-icon-size-sm)]"
                />
              )}
              {label.visited}
            </button>
            {canRoute && mapHref && (
              <button
                type="button"
                onClick={() => router.replace(`${mapHref}&route=1`)}
                className="flex min-h-v2-x12 flex-1 items-center justify-center rounded-[var(--roam-v2-trial-radius-control-1)] bg-v2-bg-brand-solid text-v2-t4 font-v2-bold text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
              >
                {label.route}
              </button>
            )}
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
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
}) {
  const body = (
    <>
      <Icon
        aria-hidden
        className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral"
      />
      <span className="flex min-w-0 flex-1 flex-col gap-v2-x0-5">
        <span className="text-v2-t5 font-v2-medium text-v2-fg-neutral">
          {title}
        </span>
        {sub && (
          <span className="break-words text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
            {sub}
          </span>
        )}
      </span>
      {href && (
        <span className="flex shrink-0 items-center text-v2-t4 font-v2-medium text-v2-fg-neutral-muted">
          {action}
          <ChevronRight
            aria-hidden
            className="size-[var(--roam-v2-icon-size-md)]"
          />
        </span>
      )}
    </>
  );
  const row = "flex w-full items-center gap-v2-x3 px-v2-x4 py-v2-x3 text-left";
  if (!href) return <li className={row}>{body}</li>;
  return (
    <li>
      {external ? (
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className={clsx(row, "active:bg-v2-bg-layer-default-pressed")}
        >
          {body}
        </a>
      ) : (
        <Link
          href={href}
          onClick={onClick}
          className={clsx(row, "active:bg-v2-bg-layer-default-pressed")}
        >
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
