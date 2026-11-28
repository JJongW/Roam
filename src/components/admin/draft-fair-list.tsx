import { ChevronRight } from "lucide-react";
import { FairPortfolioLink } from "@/components/admin/fair-portfolio-link";
import type { DraftFairRow } from "@/lib/admin/queues";
import { cn } from "@/lib/utils";

/**
 * 초안 검수 화면 맨 위의 박람회별 건수. 관리자 홈 카드와 같은 함수(enrichmentQueueByFair)로 센다.
 * 고른 박람회가 0건이어도 다른 박람회에 남은 건수가 여기 보이고, 누르면 그 박람회를 고른다.
 * 건수가 있는 박람회가 없으면 그리지 않는다.
 */
export function DraftFairList({ rows, selectedId }: { rows: DraftFairRow[]; selectedId?: string }) {
  const open = rows
    .filter((r) => r.count > 0 || r.secondary > 0)
    .sort((a, b) => b.count - a.count || b.secondary - a.secondary || a.name.localeCompare(b.name));
  if (open.length === 0) return null;
  return (
    <section className="rounded-2xl border border-border bg-card p-4" aria-labelledby="draft-fair-list-title">
      <p id="draft-fair-list-title" className="text-sm font-semibold">
        박람회별 남은 건수
      </p>
      <p className="mt-0.5 text-xs text-muted-foreground">관리자 홈의 초안 검수 숫자와 같아요. 누르면 그 박람회로 바꿔요.</p>
      <ul className="mt-2 divide-y divide-border">
        {open.map((r) => {
          const current = r.exhibitionId === selectedId;
          return (
            <li key={r.exhibitionId}>
              <FairPortfolioLink
                exhibitionId={r.exhibitionId}
                href="/admin/enrichment"
                className={cn(
                  "press -mx-2 flex items-center gap-3 rounded-lg px-2 py-2 text-sm hover:bg-secondary active:bg-card-pressed",
                  current && "bg-secondary",
                )}
              >
                <span className="min-w-0 flex-1 truncate">
                  {r.name}
                  {current && <span className="ml-1.5 text-xs text-muted-foreground">지금 보는 박람회</span>}
                </span>
                <span className="shrink-0 text-xs tabular text-muted-foreground">
                  검수 <span className="font-semibold text-foreground">{r.count}</span>
                  {r.secondary > 0 && (
                    <span className="ml-2">
                      직접 조사 <span className="font-semibold text-foreground">{r.secondary}</span>
                    </span>
                  )}
                </span>
                <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              </FairPortfolioLink>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
