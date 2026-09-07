import { AlertTriangle, ArrowRight, TrendingDown, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { VALUE_TAGS } from "@/lib/values";
import type { TasteDrift } from "@/lib/admin/taste-drift";

const COLOR = Object.fromEntries(VALUE_TAGS.map((v) => [v.slug, v.color]));

/** 취향이 전시를 거치며 어디로 옮겨갔나. 재방문자만 세서 관객 구성 변화를 걸러낸다. */
export function TasteDriftCard({ drift }: { drift: TasteDrift }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold">취향 이동</h2>
        <p className="text-sm text-muted-foreground">
          두 전시 이상에 반응한 {drift.cohort}명의 <b>선호 편향</b> 변화 — 전시가
          제공한 만큼 대비 얼마나 골랐는지입니다. 한 번만 온 사람을 빼서 관객 구성
          변화를, 제공 비중으로 나눠서 전시 성격 차이를 걸러냅니다.
        </p>
      </div>
      <Card className="space-y-4 p-4">
        {drift.movers.length === 0 ? (
          <p className="py-4 text-center text-sm text-muted-foreground">
            아직 이동이 없습니다.
          </p>
        ) : (
          <ul className="space-y-2.5">
            {drift.movers.map((m) => (
              <li key={m.slug} className="flex items-center gap-3 text-sm">
                <span
                  className="w-14 shrink-0 rounded-full px-2 py-0.5 text-center text-xs font-semibold"
                  style={{
                    backgroundColor: `${COLOR[m.slug] ?? "#888"}1a`,
                    color: COLOR[m.slug] ?? "#888",
                  }}
                >
                  {m.label}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground tabular">
                  {m.fromPct > 0 ? "+" : ""}
                  {m.fromPct}%
                  <ArrowRight className="size-3.5" />
                  <b className="text-foreground">
                    {m.toPct > 0 ? "+" : ""}
                    {m.toPct}%
                  </b>
                </span>
                <span
                  className={
                    m.deltaPct > 0
                      ? "ml-auto flex items-center gap-1 text-xs font-semibold text-[var(--ok,#0f9d63)]"
                      : "ml-auto flex items-center gap-1 text-xs font-semibold text-muted-foreground"
                  }
                >
                  {m.deltaPct > 0 ? (
                    <TrendingUp className="size-3.5" />
                  ) : (
                    <TrendingDown className="size-3.5" />
                  )}
                  {m.deltaPct > 0 ? "+" : ""}
                  {m.deltaPct}%p
                </span>
              </li>
            ))}
          </ul>
        )}

        {drift.slices.length > 0 && (
          <ol className="flex flex-wrap gap-x-3 gap-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
            {drift.slices.map((s, i) => (
              <li key={s.exhibitionId} className="tabular">
                {i + 1}. {s.exhibitionName} · 신호 {s.signals}
                {s.unadjusted && " · 보정 못함"}
              </li>
            ))}
          </ol>
        )}

        {drift.note && (
          <p className="flex gap-2 rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>{drift.note}</span>
          </p>
        )}
      </Card>
    </section>
  );
}
