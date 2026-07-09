"use client";

import {
  Maximize2,
  Plus,
  RotateCw,
  NotebookPen,
  MessagesSquare,
  Palette,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { TFn } from "@/lib/i18n/resolve";

/**
 * First-visit map guide. Shown once after onboarding when the visitor first
 * lands on the map, explaining what each control + the booth colours mean.
 * Dismissing it flips the persisted `mapGuideSeen` flag so it never reappears.
 * 지도는 길찾기가 아니라 "관심 밀도 지도"(동선 제거) — 안내도 그에 맞춘다.
 */
function items(t: TFn): { Icon: typeof Plus; label: string; desc: string }[] {
  return [
    { Icon: Maximize2, label: t("map.coachFitL"), desc: t("map.coachFitD") },
    { Icon: Plus, label: t("map.coachZoomL"), desc: t("map.coachZoomD") },
    {
      Icon: RotateCw,
      label: t("map.coachRotateL"),
      desc: t("map.coachRotateD"),
    },
    {
      Icon: NotebookPen,
      label: t("map.coachNotesL"),
      desc: t("map.coachNotesD"),
    },
    {
      Icon: MessagesSquare,
      label: t("map.coachCommunityL"),
      desc: t("map.coachCommunityD"),
    },
    {
      Icon: Palette,
      label: t("map.coachColorsL"),
      desc: t("map.coachColorsD"),
    },
  ];
}

export function MapCoachmark({ onClose }: { onClose: () => void }) {
  const t = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 backdrop-blur-sm animate-in fade-in sm:items-center">
      <div className="w-full max-w-sm rounded-3xl border border-border bg-card p-5 shadow-[var(--shadow-pop)] animate-in slide-in-from-bottom-4">
        <h2 className="text-lg font-extrabold">{t("map.coachTitle")}</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {t("map.coachSub")}
        </p>
        <ul className="mt-4 space-y-3">
          {items(t).map(({ Icon, label, desc }) => (
            <li key={label} className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-secondary">
                <Icon className="size-4.5 text-foreground" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">{label}</p>
                <p className="text-sm text-muted-foreground">{desc}</p>
              </div>
            </li>
          ))}
        </ul>
        <Button className="mt-5 w-full" size="lg" onClick={onClose}>
          {t("map.coachCta")}
        </Button>
      </div>
    </div>
  );
}
