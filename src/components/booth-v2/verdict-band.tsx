"use client";

import { useState } from "react";
import { ChoiceChip } from "@/components/v2/choice-chip";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { chooseVerdict } from "@/components/booth-v2/booth-actions";
import {
  isVisited,
  useVisitStore,
  type VerdictValue,
} from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { label, romi } from "@/lib/copy/v1";
import type { ScreenId } from "@/lib/analytics/app-track";

const VERDICTS: VerdictValue[] = ["good", "ok", "bad"];

/**
 * UI 6-09 "어떠셨어요?" 띠(Figma 3003:9465). 끝난 박람회 상세 위쪽, 다녀온 곳에만.
 * - 같은 칩을 다시 누르면 풀린다. 풀어도 다녀온 기록은 남는다. 스낵바는 없다.
 * - "나중에 할게요"로 이 화면에서 접는다. 재촉하지 않는다(브랜드 규칙 §5).
 * - 현장(여는 날)에는 평가를 묻지 않는다(섹션 8 C) — 호출부가 끝난 박람회일 때만 그린다.
 */
export function VerdictBand({
  boothId,
  name,
  screen,
  exhibitionSlug,
}: {
  boothId: string;
  name: string;
  screen: ScreenId;
  exhibitionSlug?: string;
}) {
  const hydrated = useHydrated();
  const record = useVisitStore((s) => s.records[boothId]);
  const [later, setLater] = useState(false);
  if (!hydrated || later || !isVisited(record)) return null;
  return (
    <section className="flex flex-col items-start gap-v2-x3 bg-v2-bg-brand-weak px-v2-x4 pb-v2-x3 pt-v2-x4">
      <p className="flex items-center gap-v2-x2-5 text-v2-t5 font-v2-medium text-v2-fg-neutral">
        <RomiAvatar size="md" />
        {romi.howWasIt(name)}
      </p>
      <div className="flex flex-wrap gap-v2-x2">
        {VERDICTS.map((v) => (
          <ChoiceChip
            key={v}
            on={record?.verdict === v}
            onClick={() =>
              chooseVerdict(boothId, v, "detail_ended", {
                screen,
                exhibitionSlug,
              })
            }
          >
            {label.verdict[v]}
          </ChoiceChip>
        ))}
      </div>
      <button
        type="button"
        onClick={() => setLater(true)}
        className="flex min-h-v2-x9 items-center rounded-v2-r2 px-v2-x3-5 py-v2-x2 text-v2-t4 font-v2-bold text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
      >
        {label.later}
      </button>
    </section>
  );
}
