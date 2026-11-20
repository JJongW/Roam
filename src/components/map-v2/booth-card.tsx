"use client";

import Link from "next/link";
import { clsx } from "clsx";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { HeartButton } from "@/components/v2/heart-button";
import { VisitedPill } from "@/components/v2/visited-pill";
import { CategoryChip } from "@/components/v2/category-chip";
import { Snackbar } from "@/components/v2/snackbar";
import { useBoothSignals } from "@/components/booth-v2/booth-actions";
import { label } from "@/lib/copy/v1";
import { SCREEN } from "@/lib/analytics/app-track";
import type { BoothListItem, Category } from "@/lib/types";
import type { BoothRecord } from "@/lib/stores/visit";

/**
 * UI 4-01 부스 카드(Figma 3-02 아래 카드, 3008:1032).
 * - 카드는 정보만이고, 자세한 건 "자세히"로 상세(11-10).
 * - 윗선 가운데 로미(동행자, 곁에 있다), 오른쪽 다녀왔어요 알약(V4).
 * - 하트는 이름 줄 오른쪽. 하트와 다녀왔어요는 따로다.
 * - 길 안내(UI 9): 열린 날이고 배치도가 있을 때만 "길 안내" 버튼(`onRoute`). 원할 때만 쓰는 도구다(§4).
 * - 9-06 도착하면 위치 줄 아래 "A홀 A13 도착했어요, 천천히 둘러보세요"(`arrivedLine`). 다녀왔어요는 켜지 않는다.
 * - 둥글기는 카드 시험값 1(16). iOS V2Radius.card와 같다(Ted 확정 전, 미정).
 */
export function BoothCardV2({
  booth,
  hallName,
  categories,
  exhibitionSlug,
  className,
  onVisitMarked,
  onRoute,
  arrivedLine,
  beforeOpen,
}: {
  booth: BoothListItem;
  hallName?: string;
  categories: Category[];
  exhibitionSlug: string;
  className?: string;
  /** 알약으로 다녀왔어요를 켠 직후. 지도 화면이 카드를 내리고 로미 줄(6-03)을 띄운다. */
  onVisitMarked?: (before: BoothRecord | undefined) => void;
  onRoute?: () => void;
  arrivedLine?: string;
  /** 10-02 열리기 전: 아직 다녀올 수 없으니 다녀왔어요 알약을 두지 않는다. 하트는 미리 남길 수 있다. */
  beforeOpen?: boolean;
}) {
  const s = useBoothSignals({
    boothId: booth.id,
    name: booth.name,
    surface: "card",
    screen: SCREEN.boothCard,
    exhibitionSlug,
    onVisitMarked,
  });
  const where = label.hallNumber(hallName, booth.code);
  return (
    <div
      className={clsx("pointer-events-none flex flex-col gap-v2-x2", className)}
    >
      <Snackbar state={s.snack} onClose={s.closeSnack} />
      <section
        aria-label={booth.name}
        className="pointer-events-auto relative mt-v2-x5 flex flex-col gap-v2-x3 rounded-[var(--roam-v2-trial-radius-card-1)] border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating p-v2-x4 pt-v2-x6 shadow-v2-s2"
      >
        <RomiAvatar
          size="md"
          className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2"
        />
        {!beforeOpen && (
          <VisitedPill
            on={s.visited}
            onToggle={s.toggleVisited}
            className="absolute right-v2-x4 top-0 -translate-y-1/2"
          />
        )}
        <div className="flex items-start gap-v2-x2">
          <div className="flex min-w-0 flex-1 flex-col gap-v2-x1">
            <h2 className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">
              {booth.name}
            </h2>
            {where && (
              <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                {hallName && <span>{hallName} </span>}
                {booth.code && (
                  <span className="text-v2-fg-neutral">{booth.code}</span>
                )}
                {s.visited && (
                  <span className="text-v2-fg-brand"> {label.visited}</span>
                )}
              </p>
            )}
            {arrivedLine && (
              <p className="text-v2-t3 font-v2-medium text-v2-fg-brand">
                {arrivedLine}
              </p>
            )}
          </div>
          <HeartButton
            on={s.hearted}
            onToggle={s.toggleHeart}
            className="-mr-v2-x2 -mt-v2-x2"
          />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-v2-between-chips">
            {categories.map((c) => (
              <CategoryChip key={c.id} category={c} />
            ))}
          </div>
        )}
        <div className="flex items-center justify-end gap-v2-x2">
          {onRoute && (
            <button
              type="button"
              onClick={onRoute}
              className="mr-auto flex min-h-v2-x9 items-center rounded-v2-pill border border-v2-stroke-neutral-weak px-v2-x3-5 py-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
            >
              {label.route}
            </button>
          )}
          <Link
            href={`/booths/${booth.id}`}
            className="flex min-h-v2-x9 items-center rounded-v2-r2 px-v2-x3-5 py-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
          >
            {label.detail}
          </Link>
        </div>
      </section>
    </div>
  );
}
