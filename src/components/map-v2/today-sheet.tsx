"use client";

import { useEffect, useState } from "react";
import { Pencil } from "lucide-react";
import { ChoiceChip } from "@/components/v2/choice-chip";
import { LineInput } from "@/components/v2/line-input";
import { chooseVerdict, saveMemo } from "@/components/booth-v2/booth-actions";
import { useVisitStore, type VerdictValue } from "@/lib/stores/visit";
import { label } from "@/lib/copy/v1";
import { SCREEN } from "@/lib/analytics/app-track";
import type { SnackbarState } from "@/components/v2/snackbar";
import type { BoothListItem } from "@/lib/types";

const VERDICTS: VerdictValue[] = ["good", "ok", "bad"];

/** visitedAt이 오늘(이 기기 날짜)인지. "오늘"을 가르려면 방문 시각이 있어야 한다(설계서 D-2). */
export function isToday(iso?: string): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  const n = new Date();
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  );
}

/**
 * UI 6-04 "오늘 다녀온 곳" 시트(Figma 3003:7583). 이 박람회에서 오늘 다녀온 부스마다 평가 칩 셋과
 * 메모 한 줄. 기억나는 곳만 고르면 되고 안 골라도 된다. 평가하지 않은 곳을 세거나 재촉하지 않는다.
 * 입구는 오늘 다녀온 곳이 있을 때만 보인다(호출부).
 */
export function TodaySheet({
  booths,
  exhibitionSlug,
  onClose,
  show,
}: {
  booths: BoothListItem[];
  exhibitionSlug: string;
  onClose: () => void;
  show: (s: Omit<SnackbarState, "key">) => void;
}) {
  const records = useVisitStore((s) => s.records);
  const [editing, setEditing] = useState<string | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const ctx = { screen: SCREEN.todayVisited, exhibitionSlug };
  return (
    <div
      className="fixed inset-0 z-40 flex items-end pt-v2-x28"
      role="dialog"
      aria-modal
      aria-label={label.todayVisited}
    >
      <button
        type="button"
        aria-label={label.close}
        onClick={onClose}
        className="absolute inset-0 bg-v2-bg-overlay"
      />
      <section className="relative flex max-h-full w-full max-w-[var(--roam-v2-size-content-max-width)] flex-col gap-v2-x4 overflow-y-auto rounded-t-v2-sheet bg-v2-bg-layer-floating px-v2-x4 pb-safe pt-v2-x3">
        <div className="flex justify-center">
          <span className="h-v2-x1 w-v2-x9 rounded-v2-full bg-v2-stroke-neutral-subtle" />
        </div>
        <h2 className="text-v2-t7 font-v2-bold tracking-v2-card-title text-v2-fg-neutral">
          {label.todayVisited}
        </h2>
        {booths.map((b) => {
          const r = records[b.id];
          const memo = r?.memo?.trim() ?? "";
          const open = editing === b.id || !!memo;
          return (
            <div key={b.id} className="flex flex-col gap-v2-x3 pb-v2-x2">
              <div className="flex items-center gap-v2-x1-5">
                <span className="text-v2-t5 font-v2-medium text-v2-fg-neutral">
                  {b.name}
                </span>
                {b.code && (
                  <span className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                    {b.code}
                  </span>
                )}
                <span className="flex-1" />
                <button
                  type="button"
                  aria-label={label.memoEdit}
                  onClick={() => setEditing(b.id)}
                  className="-mr-v2-x3 flex size-v2-x11 items-center justify-center rounded-v2-full text-v2-fg-neutral active:bg-v2-bg-transparent-pressed"
                >
                  <Pencil
                    aria-hidden
                    className="size-[var(--roam-v2-icon-size-md)]"
                  />
                </button>
              </div>
              <div className="flex flex-wrap gap-v2-x2">
                {VERDICTS.map((v) => (
                  <ChoiceChip
                    key={v}
                    on={r?.verdict === v}
                    onClick={() => chooseVerdict(b.id, v, "today_sheet", ctx)}
                  >
                    {label.verdict[v]}
                  </ChoiceChip>
                ))}
              </div>
              {open && (
                <LineInput
                  key={`${b.id}-${editing === b.id}`}
                  autoFocus={editing === b.id}
                  initial={memo}
                  onSave={(text) => {
                    saveMemo(b.id, b.name, text, { ...ctx, show });
                    if (editing === b.id) setEditing(null);
                  }}
                />
              )}
            </div>
          );
        })}
      </section>
    </div>
  );
}
