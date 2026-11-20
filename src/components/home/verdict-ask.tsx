"use client";

import { useEffect, useRef, useState } from "react";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { ChoiceChip } from "@/components/v2/choice-chip";
import { BottomSheet } from "@/components/map-v2/bottom-sheet";
import { pushNote, useVisitStore, type VerdictValue } from "@/lib/stores/visit";
import { label } from "@/lib/copy/v1";
import { homeCopy } from "@/lib/copy/home";
import { track, type ScreenId } from "@/lib/analytics/app-track";
import { dismissVerdict } from "@/lib/me/ended-entry";
import type { FairGroup } from "@/lib/me/view";

const VERDICTS: VerdictValue[] = ["good", "ok", "bad"];

/**
 * 끝난 박람회 평가 묻기 카드. 홈(11-08 M3)과 마이페이지(11-10 M6)가 같이 쓴다(Figma 11-08 생김새).
 * - 로미는 왼쪽(동행자가 묻는다). "평가 남기기"는 다녀오신 곳 시트를 연다.
 * - "나중에 할게요"를 누르면 그 박람회에서는 다시 묻지 않는다(iOS와 같은 키). 재촉하지 않는다(§5).
 * - 보이면 ended_fair_entry_shown(variant m3), 누르면 ended_fair_entry_tap. iOS와 같다.
 */
export function VerdictAskCard({
  group,
  screen,
  onHide,
}: {
  group: FairGroup;
  screen: ScreenId;
  /** "나중에 할게요" 뒤 카드를 내린다. */
  onHide: () => void;
}) {
  const [open, setOpen] = useState(false);
  const slug = group.fair.slug;
  const seen = useRef<string | null>(null);
  useEffect(() => {
    if (seen.current === slug) return;
    seen.current = slug;
    track("ended_fair_entry_shown", { screen, exhibitionSlug: slug, props: { variant: "m3" } });
  }, [slug, screen]);

  return (
    <>
      <section className="flex flex-col gap-v2-x3 rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating p-v2-x4 shadow-v2-s1">
        <div className="flex items-start gap-v2-x3">
          <RomiAvatar size="md" />
          <div className="flex min-w-0 flex-col gap-v2-x0-5 font-v2-medium">
            <p className="text-v2-t5 text-v2-fg-neutral">{homeCopy.howWas(group.fair.name)}</p>
            <p className="text-v2-t3 text-v2-fg-neutral-muted">{homeCopy.pickRemembered}</p>
          </div>
        </div>
        <div className="flex items-center gap-v2-x2">
          <button
            type="button"
            onClick={() => {
              track("ended_fair_entry_tap", { screen, exhibitionSlug: slug, props: { variant: "m3" } });
              setOpen(true);
            }}
            className="flex min-h-v2-x11 flex-1 items-center justify-center rounded-v2-r2 bg-v2-bg-brand-solid text-v2-t4 font-v2-bold text-v2-fg-on-brand-solid active:bg-v2-bg-brand-solid-pressed"
          >
            {homeCopy.leaveVerdict}
          </button>
          <button
            type="button"
            onClick={() => {
              dismissVerdict(slug);
              track("verdict_later", { screen, exhibitionSlug: slug });
              onHide();
            }}
            className="flex min-h-v2-x11 items-center rounded-v2-r2 px-v2-x4 text-v2-t4 font-v2-bold text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
          >
            {homeCopy.later}
          </button>
        </div>
      </section>
      {open && <VerdictSheet group={group} screen={screen} onClose={() => setOpen(false)} />}
    </>
  );
}

/**
 * 다녀오신 곳마다 평가 칩 셋. 기억나는 곳만 고르면 된다. 같은 칩을 다시 누르면 풀린다.
 * 남은 곳을 세거나 재촉하지 않는다. 다 고르면 고맙다는 말 한 줄.
 */
export function VerdictSheet({
  group,
  screen,
  onClose,
}: {
  group: FairGroup;
  screen: ScreenId;
  onClose: () => void;
}) {
  const records = useVisitStore((s) => s.records);
  const slug = group.fair.slug;
  const allDone = group.rows.every((r) => !!records[r.boothId]?.verdict);
  const pick = (boothId: string, v: VerdictValue) => {
    useVisitStore.getState().setVerdict(boothId, v);
    void pushNote(boothId, { verdict: true, visited: true });
    track("verdict_pick", { screen, exhibitionSlug: slug, boothId, props: { value: v } });
    const after = useVisitStore.getState().records;
    if (group.rows.every((r) => !!after[r.boothId]?.verdict))
      track("verdict_all_done", { screen, exhibitionSlug: slug });
  };
  return (
    <BottomSheet ariaLabel={homeCopy.howWas(group.fair.name)} onClose={onClose}>
      <div className="flex items-start gap-v2-x3">
        <RomiAvatar size="md" />
        <div className="flex flex-col gap-v2-x0-5 font-v2-medium">
          <h2 className="text-v2-t5 text-v2-fg-neutral">{homeCopy.howWas(group.fair.name)}</h2>
          <p className="text-v2-t3 text-v2-fg-neutral-muted">
            {allDone ? homeCopy.thanksLeft : homeCopy.pickRemembered}
          </p>
        </div>
      </div>
      <ul className="flex flex-col gap-v2-x4">
        {group.rows.map((r) => (
          <li key={r.boothId} className="flex flex-col gap-v2-x2">
            <span className="flex items-center gap-v2-x1-5">
              <span className="text-v2-t5 font-v2-medium text-v2-fg-neutral">{r.name}</span>
              {r.code && (
                <span className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">{r.code}</span>
              )}
            </span>
            <div className="flex flex-wrap gap-v2-x2">
              {VERDICTS.map((v) => (
                <ChoiceChip key={v} on={records[r.boothId]?.verdict === v} onClick={() => pick(r.boothId, v)}>
                  {label.verdict[v]}
                </ChoiceChip>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={() => {
          if (!allDone) track("verdict_later", { screen, exhibitionSlug: slug });
          onClose();
        }}
        className="flex min-h-v2-x11 w-full items-center justify-center text-v2-t4 font-v2-medium text-v2-fg-neutral-muted active:bg-v2-bg-transparent-pressed"
      >
        {allDone ? homeCopy.done : homeCopy.later}
      </button>
    </BottomSheet>
  );
}
