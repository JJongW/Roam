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

/**
 * UI 4-01 부스 카드(Figma 3-02 아래 카드, 3008:1032).
 * - 카드는 정보만이고, 자세한 건 "자세히"로 상세(11-10).
 * - 윗선 가운데 로미(동행자, 곁에 있다), 오른쪽 다녀왔어요 알약(V4).
 * - 하트는 이름 줄 오른쪽. 하트와 다녀왔어요는 따로다.
 * - 길 안내(UI 9)는 웹에 아직 없어 버튼을 두지 않는다. 없는 기능을 약속하지 않는다(브랜드 규칙 §4).
 * - 둥글기는 카드 시험값 1(16). iOS V2Radius.card와 같다(Ted 확정 전, 미정).
 */
export function BoothCardV2({
  booth,
  hallName,
  categories,
  exhibitionSlug,
  className,
}: {
  booth: BoothListItem;
  hallName?: string;
  categories: Category[];
  exhibitionSlug: string;
  className?: string;
}) {
  const s = useBoothSignals({
    boothId: booth.id,
    name: booth.name,
    surface: "card",
    screen: SCREEN.boothCard,
    exhibitionSlug,
  });
  const where = label.hallNumber(hallName, booth.code);
  return (
    <div className={clsx("pointer-events-none flex flex-col gap-v2-x2", className)}>
      <Snackbar state={s.snack} onClose={s.closeSnack} />
      <section
        aria-label={booth.name}
        className="pointer-events-auto relative mt-v2-x5 flex flex-col gap-v2-x3 rounded-[var(--roam-v2-trial-radius-card-1)] border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating p-v2-x4 pt-v2-x6 shadow-v2-s2"
      >
        <RomiAvatar size="md" className="absolute left-1/2 top-0 -translate-x-1/2 -translate-y-1/2" />
        <VisitedPill
          on={s.visited}
          onToggle={s.toggleVisited}
          className="absolute right-v2-x4 top-0 -translate-y-1/2"
        />
        <div className="flex items-start gap-v2-x2">
          <div className="flex min-w-0 flex-1 flex-col gap-v2-x1">
            <h2 className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">{booth.name}</h2>
            {where && (
              <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                {hallName && <span>{hallName} </span>}
                {booth.code && <span className="text-v2-fg-neutral">{booth.code}</span>}
              </p>
            )}
          </div>
          <HeartButton on={s.hearted} onToggle={s.toggleHeart} className="-mr-v2-x2 -mt-v2-x2" />
        </div>
        {categories.length > 0 && (
          <div className="flex flex-wrap gap-v2-between-chips">
            {categories.map((c) => (
              <CategoryChip key={c.id} category={c} />
            ))}
          </div>
        )}
        <div className="flex justify-end">
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
