import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { LearningCurve } from "@/lib/memory/learning-curve";

/**
 * 로미 학습 곡선 — 회차가 늘수록 추천이 정확해지는가.
 * 설계 문서가 "루프 B가 작동한다는 유일한 증거"로 꼽고 L1 최상단에 두라고 한 블록이다.
 */
export function LearningCurveCard({ curve }: { curve: LearningCurve }) {
  const max = Math.max(100, ...curve.points.map((p) => p.pct ?? 0));
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-bold">로미 학습 곡선</h2>
        <p className="text-sm text-muted-foreground">
          N회차 방문자의 추천 정확도. 회차가 늘수록 올라가야 로미가 전시를 넘어
          학습하는 것입니다.
        </p>
      </div>
      <Card className="space-y-4 p-4">
        {curve.points.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            아직 판정이 없습니다.
          </p>
        ) : (
          <ul className="space-y-3">
            {curve.points.map((p) => (
              <li key={p.ordinal} className="flex items-center gap-3">
                <span className="w-12 shrink-0 text-sm font-medium tabular">
                  {p.ordinal}회차
                </span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-secondary">
                  {p.pct !== null && (
                    <span
                      className="block h-full rounded-full bg-primary"
                      style={{ width: `${(p.pct / max) * 100}%` }}
                    />
                  )}
                </span>
                <span className="w-32 shrink-0 text-right text-xs text-muted-foreground tabular">
                  {p.pct !== null ? (
                    <b
                      className={
                        p.thin
                          ? "text-sm text-muted-foreground"
                          : "text-sm text-foreground"
                      }
                    >
                      {p.pct}%
                    </b>
                  ) : (
                    "표본 부족"
                  )}
                  {" · "}
                  {p.users}명 · 판정 {p.judgedCount}
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* 빈 화면은 "아직 없다"만 말하고 끝난다. 무엇이 막고 있는지를 알아야
            다음에 뭘 할지 정할 수 있다. */}
        {curve.blocker && (
          <p className="flex gap-2 rounded-lg bg-secondary p-3 text-xs text-muted-foreground">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning" />
            <span>{curve.blocker}</span>
          </p>
        )}
      </Card>
    </section>
  );
}
