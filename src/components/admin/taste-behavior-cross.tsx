import { valueDef, valueLabel } from "@/lib/values";
import type { TasteBehaviorResult } from "@/lib/admin/taste-behavior";

/**
 * 취향 × 행동 교차 표. 가치별로 "그 취향 사람들이 실제로 많이 본 부스"를 보여주고,
 * 그 부스가 해당 가치 태그를 달고 있지 않으면 "태그 없음"으로 세운다 — 그 줄이
 * 추천 근거를 고칠 지점이다(태깅 누락이거나, 태그가 실제 끌림을 설명 못 함).
 */
export function TasteBehaviorCross({
  result,
  boothNames,
}: {
  result: TasteBehaviorResult;
  boothNames: Record<string, string>;
}) {
  const { rows, unattributed } = result;

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        아직 취향이 쌓인 사용자가 없습니다.
      </p>
    );
  }

  const active = rows.some((r) => r.booths.length > 0);

  return (
    <div className="space-y-4">
      {!active && (
        <p className="rounded-lg bg-secondary px-3 py-2 text-sm text-muted-foreground">
          취향은 쌓였지만 사용자에 귀속된 행동 기록이 아직 없습니다. 분석
          이벤트에 사용자를 적기 시작한 건 최근이라, 그 전에 쌓인 기록은 여기에
          잡히지 않습니다.
        </p>
      )}

      <ul className="space-y-3">
        {rows.map((row) => {
          const def = valueDef(row.slug);
          return (
            <li key={row.slug} className="rounded-xl border p-3">
              <div className="flex items-baseline justify-between gap-2">
                <span
                  className="text-sm font-bold"
                  style={def ? { color: def.color } : undefined}
                >
                  {valueLabel(row.slug)}
                </span>
                <span className="text-xs text-muted-foreground">
                  취향 {row.tasteUsers}명 · 행동 {row.activeUsers}명
                </span>
              </div>

              {row.booths.length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">
                  귀속된 행동 없음
                </p>
              ) : (
                <ul className="mt-2 space-y-1">
                  {row.booths.map((b) => (
                    <li
                      key={b.boothId}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">
                        {boothNames[b.boothId] ?? b.boothId}
                        {!b.tagged && (
                          <span className="ml-2 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-muted-foreground">
                            태그 없음
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
                        {b.events}회 · {b.users}명
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {unattributed > 0 && (
        <p className="text-xs text-muted-foreground">
          사용자에 귀속되지 않은 이벤트 {unattributed}건은 제외했습니다(비로그인
          이거나 사용자 기록 도입 전).
        </p>
      )}
    </div>
  );
}
