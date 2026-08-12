"use client";

import { useState } from "react";
import { ExhibitionCard } from "@/components/exhibition/exhibition-card";
import { useT } from "@/lib/i18n/provider";
import type { Exhibition } from "@/lib/types";

const VISIBLE_CAP = 3;

/**
 * 상태별 전시 섹션 — 최대 3개만 보여주고 나머지는 "더보기"로 같은 자리에서
 * 펼친다(새 페이지·API 호출 없음, 이미 서버가 다 내려준 목록 중 일부만
 * 숨겼다 보여주는 것뿐이다). 이 섹션에 전시가 하나도 없으면 렌더하지 않는다.
 */
export function ExhibitionStatusSection({
  title,
  exhibitions,
  recommendedSlug,
  recommendedLabel,
  recommendedReason,
}: {
  title: string;
  exhibitions: Exhibition[];
  recommendedSlug?: string;
  recommendedLabel?: string;
  recommendedReason?: string | null;
}) {
  const t = useT();
  const [expanded, setExpanded] = useState(false);

  if (exhibitions.length === 0) return null;

  const visible = expanded ? exhibitions : exhibitions.slice(0, VISIBLE_CAP);
  const hiddenCount = exhibitions.length - visible.length;

  return (
    <div className="space-y-2">
      <h2 className="px-1 text-sm font-bold text-muted-foreground">{title}</h2>
      <div className="space-y-3">
        {visible.map((ex) => (
          <div key={ex.id} className="space-y-1.5">
            <ExhibitionCard
              exhibition={ex}
              recommended={ex.slug === recommendedSlug}
              recommendedLabel={recommendedLabel}
            />
            {ex.slug === recommendedSlug && recommendedReason && (
              <p className="px-1 text-xs leading-relaxed text-muted-foreground">
                {recommendedReason}
              </p>
            )}
          </div>
        ))}
      </div>
      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="w-full py-2 text-center text-sm font-semibold text-primary active:opacity-70"
        >
          {t("home.showMore", { n: hiddenCount })}
        </button>
      )}
    </div>
  );
}
