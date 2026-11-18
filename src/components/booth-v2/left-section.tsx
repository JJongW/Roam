"use client";

import { useState } from "react";
import { Check, Heart, Pencil } from "lucide-react";
import { LineInput } from "@/components/v2/line-input";
import { saveMemo } from "@/components/booth-v2/booth-actions";
import { isHearted, isVisited, useVisitStore } from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { clockKo, label, system } from "@/lib/copy/v1";
import type { ScreenId } from "@/lib/analytics/app-track";
import type { SnackbarState } from "@/components/v2/snackbar";

/**
 * UI 6-05 "남기신 것"(Figma 3003:8964). 줄마다 아이콘 20, 글 시작점을 같게(UI/남긴 것 줄 3002:4544).
 * - 하트 줄: 하트를 남겼으면.
 * - 다녀온 줄: "오후 2시 20분에 다녀왔어요". 시각을 모르면(옛 기록) "다녀왔어요"만.
 * - 메모 줄: 있으면 그 글, 없으면 "메모 한 줄 남기기"(brand 글자). 누르면 그 자리에서 고친다(6-07).
 * - 평가는 여기서 묻지 않는다(M1). 남긴 게 하나도 없어도 메모 줄은 남겨 둔다(쓸 자리가 있어야 한다).
 */
export function LeftSection({
  boothId,
  name,
  screen,
  exhibitionSlug,
  show,
}: {
  boothId: string;
  name: string;
  screen: ScreenId;
  exhibitionSlug?: string;
  show: (s: Omit<SnackbarState, "key">) => void;
}) {
  const hydrated = useHydrated();
  const record = useVisitStore((s) => s.records[boothId]);
  const [editing, setEditing] = useState(false);
  if (!hydrated) return null;
  const memo = record?.memo?.trim() ?? "";
  const row =
    "flex w-full items-center gap-v2-x2-5 py-v2-x1-5 text-left text-v2-t4 font-v2-medium";
  return (
    <section className="flex flex-col gap-v2-x1 border-t border-v2-stroke-neutral-muted p-v2-x4">
      <h2 className="text-v2-t4 font-v2-bold text-v2-fg-neutral">
        {label.leftSection}
      </h2>
      {isHearted(record) && (
        <p className={row}>
          <Heart
            aria-hidden
            className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral"
          />
          <span className="min-w-0 flex-1 text-v2-fg-neutral">
            {system.heartLeft}
          </span>
        </p>
      )}
      {isVisited(record) && (
        <p className={row}>
          <Check
            aria-hidden
            className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral"
          />
          <span className="min-w-0 flex-1 text-v2-fg-neutral">
            {record?.visitedAt
              ? system.visitedAtTime(clockKo(record.visitedAt))
              : system.visitedPlain}
          </span>
        </p>
      )}
      {editing ? (
        <div className="pt-v2-x1">
          <LineInput
            autoFocus
            initial={memo}
            onSave={(text) => {
              saveMemo(boothId, name, text, { screen, exhibitionSlug, show });
              setEditing(false);
            }}
          />
        </div>
      ) : (
        <button type="button" onClick={() => setEditing(true)} className={row}>
          <Pencil
            aria-hidden
            className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral"
          />
          <span
            className={
              memo
                ? "min-w-0 flex-1 break-words text-v2-fg-neutral"
                : "min-w-0 flex-1 text-v2-fg-brand"
            }
          >
            {memo || label.memoAdd}
          </span>
        </button>
      )}
    </section>
  );
}
