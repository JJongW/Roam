"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { useT } from "@/lib/i18n/provider";
import {
  DEFAULT_RHYTHM,
  RHYTHMS,
  isRhythm,
  type Rhythm,
} from "@/lib/feed/rhythm";

/**
 * 오늘의 관람 관점(리듬) 선택 — 집중/가볍게/쉬면서. 선택은 ?rhythm= 쿼리로 반영되어
 * 서버가 피드를 다시 큐레이션한다(밀도·믹스 변경). companion-reframe Phase H.
 */
export function RhythmPicker() {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const raw = sp.get("rhythm") ?? undefined;
  const current: Rhythm = isRhythm(raw) ? raw : DEFAULT_RHYTHM;

  function set(r: Rhythm) {
    const p = new URLSearchParams(sp.toString());
    p.set("rhythm", r);
    router.replace(`${pathname}?${p.toString()}`, { scroll: false });
  }

  return (
    <section className="mt-2">
      <p className="mb-2 px-1 text-sm font-bold">{t("rhythm.question")}</p>
      <div className="flex gap-2">
        {RHYTHMS.map((r) => {
          const on = r.key === current;
          return (
            <button
              key={r.key}
              type="button"
              onClick={() => set(r.key)}
              aria-pressed={on}
              className={cn(
                "flex flex-1 flex-col items-start gap-0.5 rounded-2xl border px-3.5 py-2.5 text-left active:scale-[0.99]",
                on ? "border-primary bg-accent/60" : "border-border bg-card",
              )}
            >
              <span
                className={cn(
                  "text-sm font-bold",
                  on ? "text-primary" : "text-foreground",
                )}
              >
                {t(`rhythm.${r.key}`)}
              </span>
              <span className="text-xs text-muted-foreground">
                {t(`rhythm.${r.key}Hint`)}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}
