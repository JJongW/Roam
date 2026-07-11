"use client";

import { Maximize2, Plus, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/lib/i18n/provider";
import type { TFn } from "@/lib/i18n/resolve";

/**
 * First-visit map guide. Shown once after onboarding when the visitor first
 * lands on the map. 시작에 꼭 필요한 것만(전체보기·줌·색) — 나머지 컨트롤은
 * 아이콘으로 자명하니 뺐다. 지도를 오래 가리지 않게 짧게. `?`로 재열람 가능.
 * Dismissing flips the persisted `mapGuideSeen` flag so it never auto-reappears.
 */
function items(t: TFn): { Icon: typeof Plus; label: string; desc: string }[] {
  return [
    { Icon: Maximize2, label: t("map.coachFitL"), desc: t("map.coachFitD") },
    { Icon: Plus, label: t("map.coachZoomL"), desc: t("map.coachZoomD") },
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
