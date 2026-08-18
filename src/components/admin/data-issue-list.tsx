import Link from "next/link";
import type { BoothGap, NoteInconsistency } from "@/lib/admin/data-issues";

const REASON_LABEL: Record<NoteInconsistency["reason"], string> = {
  verdict_without_visitedAt: "판정은 있는데 방문 시각이 없음",
};

export function DataIssueList({
  gaps,
  inconsistencies,
}: {
  gaps: BoothGap[];
  inconsistencies: NoteInconsistency[];
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-sm font-bold">
          부스 정보 결측 ({gaps.length})
        </h3>
        {gaps.length === 0 ? (
          <p className="text-sm text-muted-foreground">결측 없음.</p>
        ) : (
          <ul className="space-y-1.5">
            {gaps.map((g) => (
              <li key={g.boothId}>
                <Link
                  href={`/admin/booths?edit=${g.boothId}`}
                  className="block rounded-xl border border-border bg-card p-3 text-sm transition-colors hover:bg-secondary/50"
                >
                  <p className="font-medium">{g.boothName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {g.missingFields.join(", ")}
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-sm font-bold">
          판단 레코드 정합성 ({inconsistencies.length})
        </h3>
        {inconsistencies.length === 0 ? (
          <p className="text-sm text-muted-foreground">이상 없음.</p>
        ) : (
          <ul className="space-y-1.5">
            {inconsistencies.map((n, i) => (
              <li
                key={`${n.userId}-${n.boothId}-${i}`}
                className="rounded-xl border border-border bg-card p-3 text-sm"
              >
                <p className="font-medium">{REASON_LABEL[n.reason]}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  user: {n.userId} · booth: {n.boothId}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
