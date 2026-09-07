import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { Calibration } from "@/lib/enrichment/calibration";

/** 밴드별 승인률 — 자동 통과 임계값을 감이 아니라 이 표로 정한다. */
export function CalibrationCard({ cal }: { cal: Calibration }) {
  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="text-sm font-bold">신뢰도별 승인률</p>
        <p className="text-xs text-muted-foreground">
          사람이 판단한 {cal.reviewed}건 기준. 자동 통과 임계값은 이 표를 보고
          정합니다.
        </p>
      </div>
      <ul className="space-y-1.5">
        {cal.bands.map((b) => {
          const n = b.approved + b.rejected;
          return (
            <li key={b.label} className="flex items-center gap-3 text-sm">
              <span className="w-20 shrink-0 font-medium tabular">{b.label}</span>
              <span className="h-2 flex-1 overflow-hidden rounded-full bg-secondary">
                {b.approvalPct !== null && (
                  <span
                    className="block h-full rounded-full bg-primary"
                    style={{ width: `${b.approvalPct}%` }}
                  />
                )}
              </span>
              <span className="w-28 shrink-0 text-right text-xs text-muted-foreground tabular">
                {b.approvalPct === null ? (
                  "판단 없음"
                ) : (
                  <>
                    <b className="text-sm text-foreground">{b.approvalPct}%</b> ·{" "}
                    {b.approved}/{n}
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {cal.note && (
        <p className="flex gap-2 rounded-lg bg-secondary p-2.5 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
          <span>{cal.note}</span>
        </p>
      )}
    </Card>
  );
}
