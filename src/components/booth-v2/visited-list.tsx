"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { BackButton } from "@/components/v2/back-button";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import { api } from "@/lib/api/client";
import {
  isVisited,
  useVisitStore,
  type VerdictValue,
} from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FLOORPLANS, type Floorplan } from "@/lib/floorplans";
import { floorplanHallOf } from "@/lib/floorplan/hall-of";
import { dayKo, label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import { V2_PX } from "@/styles/v2/lengths.generated";
import type { BoothDetail } from "@/lib/types";

export interface FairInfo {
  id: string;
  slug: string;
  name: string;
  venue: string;
}

interface Row {
  boothId: string;
  name: string;
  code?: string;
  exhibitionId: string;
  verdict?: VerdictValue;
  visitedAt?: string;
}

const C = (name: string) => `var(--roam-v2-color-${name})`;

/**
 * UI 6-10 "다녀왔어요" 목록(Figma 3003:9490). 박람회별로 묶어 작은 지도(다녀온 칸만 진하게)와 부스 줄.
 * - 원천: 이 기기의 기록(로그인하면 계정 노트가 합쳐진 것). 부스 이름은 부스마다 GET /api/booths/{id}
 *   (설계서 6-10 "다른 박람회 부스 이름을 한 번에 받는 API가 없어요", API A-1 전까지).
 * - 목록에서 지우지 않는다(41-B 버림). 고치기는 상세에서만(41-A). 평가가 없으면 비운다(세지 않음).
 */
export function VisitedList({ fairs }: { fairs: FairInfo[] }) {
  const hydrated = useHydrated();
  const records = useVisitStore((s) => s.records);
  const ids = useMemo(
    () =>
      hydrated
        ? Object.keys(records).filter((id) => isVisited(records[id]))
        : [],
    [records, hydrated],
  );
  const idsKey = ids.slice().sort().join(",");
  const [meta, setMeta] = useState<
    Record<string, { name: string; code?: string; exhibitionId: string } | null>
  >({});

  useEffect(() => {
    if (!idsKey) return;
    let alive = true;
    const missing = idsKey.split(",");
    (async () => {
      const out: typeof meta = {};
      for (let i = 0; i < missing.length; i += 6) {
        await Promise.all(
          missing.slice(i, i + 6).map(async (id) => {
            const d = await api
              .get<BoothDetail>(`/api/booths/${id}`)
              .catch(() => null);
            out[id] = d
              ? {
                  name: d.booth.name,
                  code: d.booth.code,
                  exhibitionId: d.booth.exhibitionId,
                }
              : null;
          }),
        );
      }
      if (alive) setMeta(out);
    })();
    return () => {
      alive = false;
    };
  }, [idsKey]);

  const loading =
    !hydrated || (ids.length > 0 && ids.some((id) => !(id in meta)));
  const fairById = useMemo(() => new Map(fairs.map((f) => [f.id, f])), [fairs]);
  const groups = useMemo(() => {
    const rows = ids
      .map((id): Row | null => {
        const m = meta[id];
        if (!m) return null;
        return {
          boothId: id,
          ...m,
          verdict: records[id]?.verdict,
          visitedAt: records[id]?.visitedAt,
        };
      })
      .filter((r): r is Row => !!r);
    const byFair = new Map<string, Row[]>();
    for (const r of rows)
      byFair.set(r.exhibitionId, [...(byFair.get(r.exhibitionId) ?? []), r]);
    const latest = (rs: Row[]) =>
      rs.reduce(
        (m, r) => (r.visitedAt && r.visitedAt > m ? r.visitedAt : m),
        "",
      );
    return [...byFair.entries()]
      .map(([fid, rs]) => ({
        fair: fairById.get(fid),
        rows: rs.sort((a, b) =>
          (a.code ?? a.name).localeCompare(b.code ?? b.name),
        ),
        last: latest(rs),
      }))
      .filter((g) => !!g.fair)
      .sort((a, b) => b.last.localeCompare(a.last));
  }, [ids, meta, records, fairById]);

  const opened = groups.length > 0 && !loading;
  useEffect(() => {
    if (!opened) return;
    track("visited_list_open", {
      screen: SCREEN.visitedList,
      props: {
        source: "web",
        fair_count: groups.length,
        booth_count: groups.reduce((n, g) => n + g.rows.length, 0),
      },
    });
    // 한 번만(열렸을 때)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opened]);

  const boothCount = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <div className="min-h-dvh bg-v2-bg-layer-default font-v2-ui text-v2-fg-neutral">
      <div className="flex items-center px-v2-x1-5 pt-safe">
        <BackButton fallbackHref="/" />
      </div>
      <div className="flex flex-col gap-v2-x4 px-v2-x4 pb-v2-x6">
        <div className="flex flex-col gap-v2-x1">
          <h1 className="text-v2-t7 font-v2-bold tracking-v2-card-title">
            {label.visitedList}
          </h1>
          {opened && (
            <p className="text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
              {system.visitedSummary(groups.length, boothCount)}
            </p>
          )}
        </div>

        {loading ? (
          <p className="text-v2-t4 text-v2-fg-neutral-muted">
            {system.visitedLoading}
          </p>
        ) : groups.length === 0 ? (
          <div className="flex flex-col items-center gap-v2-x3 py-v2-x16 text-center">
            <RomiAvatar size="lg" />
            <p className="text-v2-t6 font-v2-bold">
              {system.visitedEmptyTitle}
            </p>
            <p className="text-v2-t4 text-v2-fg-neutral-muted">
              {system.visitedEmptyBody}
            </p>
          </div>
        ) : (
          groups.map(({ fair, rows }) => {
            const fp = FLOORPLANS[fair!.slug];
            // 행사장 이름에 이미 홀이 들어 있으면 다시 붙이지 않는다.
            const halls = [
              ...new Set(
                rows
                  .map((r) => floorplanHallOf(fp, r.code))
                  .filter((h): h is string => !!h),
              ),
            ]
              .filter((h) => !fair!.venue.includes(h))
              .join(", ");
            const first = rows
              .map((r) => r.visitedAt)
              .filter(Boolean)
              .sort()[0];
            return (
              <section
                key={fair!.id}
                className="flex flex-col gap-v2-x3 overflow-hidden rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating pb-v2-x2 pt-v2-x4"
              >
                {fp && (
                  <MiniMap
                    floorplan={fp}
                    codes={
                      new Set(
                        rows.map((r) => r.code).filter((c): c is string => !!c),
                      )
                    }
                  />
                )}
                <div className="flex flex-col gap-v2-x0-5 px-v2-x4 font-v2-medium">
                  <h2 className="text-v2-t5 text-v2-fg-neutral">
                    {fair!.name}
                  </h2>
                  <p className="text-v2-t3 text-v2-fg-neutral-muted">
                    {first
                      ? system.visitedOnDay(
                          dayKo(first),
                          [fair!.venue, halls].filter(Boolean).join(" "),
                        )
                      : fair!.venue}
                  </p>
                </div>
                <ul>
                  {rows.map((r) => (
                    <li key={r.boothId}>
                      <Link
                        href={`/booths/${r.boothId}`}
                        onClick={() =>
                          track("visited_list_row_tap", {
                            screen: SCREEN.visitedList,
                            boothId: r.boothId,
                            exhibitionSlug: fair!.slug,
                          })
                        }
                        className="flex w-full items-center gap-v2-x2-5 px-v2-x4 py-v2-x2-5 active:bg-v2-bg-neutral-weak"
                      >
                        <Check
                          aria-hidden
                          className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral"
                        />
                        <span className="min-w-0 flex-1 truncate text-v2-t4 font-v2-medium">
                          {r.name}
                        </span>
                        {r.verdict && (
                          <span className="flex min-h-v2-x6 shrink-0 items-center rounded-v2-r1-5 bg-v2-bg-neutral-weak px-v2-x2 py-v2-x1 text-v2-t2 font-v2-medium text-v2-fg-neutral-muted">
                            {label.verdict[r.verdict]}
                          </span>
                        )}
                        {r.code && (
                          <span className="shrink-0 text-right text-v2-t3 font-v2-medium text-v2-fg-neutral-muted">
                            {r.code}
                          </span>
                        )}
                        <ChevronRight
                          aria-hidden
                          className="size-[var(--roam-v2-icon-size-md)] shrink-0 text-v2-fg-neutral"
                        />
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })
        )}
      </div>
    </div>
  );
}

/** 작은 지도(Figma 3045:18454 홀 벽 + UI/지도/작은 다녀온 칸 3003:9489). 다녀온 칸이 든 홀만 잘라 그린다. */
function MiniMap({
  floorplan,
  codes,
}: {
  floorplan: Floorplan;
  codes: Set<string>;
}) {
  const visited = floorplan.booths.filter((b) => codes.has(b.code));
  if (visited.length === 0) return null;
  const halls = floorplan.halls.filter((h) =>
    visited.some(
      (b) => b.x >= h.x && b.x <= h.x + h.w && b.y >= h.y && b.y <= h.y + h.h,
    ),
  );
  const hall = halls.length
    ? {
        x: Math.min(...halls.map((h) => h.x)),
        y: Math.min(...halls.map((h) => h.y)),
        x1: Math.max(...halls.map((h) => h.x + h.w)),
        y1: Math.max(...halls.map((h) => h.y + h.h)),
      }
    : { x: 0, y: 0, x1: floorplan.width, y1: floorplan.height };
  const cellH = Math.min(...visited.map((b) => Math.min(b.w, b.h)));
  // 다녀온 칸 둘레만 잘라 그린다(이웃 칸 몇 줄과 함께). 홀이 커도 칸이 점이 되지 않게. 홀 밖으로는 넘지 않는다.
  const pad = cellH * 4;
  let box = {
    x: Math.min(...visited.map((b) => b.x - b.w / 2)) - pad,
    y: Math.min(...visited.map((b) => b.y - b.h / 2)) - pad,
    x1: Math.max(...visited.map((b) => b.x + b.w / 2)) + pad,
    y1: Math.max(...visited.map((b) => b.y + b.h / 2)) + pad,
  };
  // 카드 폭에 맞게 가로가 세로의 두 배쯤 되도록 넓힌다.
  const want = (box.y1 - box.y) * 2 - (box.x1 - box.x);
  if (want > 0) box = { ...box, x: box.x - want / 2, x1: box.x1 + want / 2 };
  box = {
    x: Math.max(hall.x, box.x),
    y: Math.max(hall.y, box.y),
    x1: Math.min(hall.x1, box.x1),
    y1: Math.min(hall.y1, box.y1),
  };
  return (
    <div className="px-v2-x4">
      <svg
        aria-hidden
        viewBox={`${box.x} ${box.y} ${box.x1 - box.x} ${box.y1 - box.y}`}
        className="block w-full rounded-v2-r1 border-2 border-v2-stroke-neutral-weak bg-v2-bg-layer-default"
      >
        {floorplan.booths.map((b) => {
          const on = codes.has(b.code);
          return (
            <g
              key={b.code}
              transform={
                b.rotate ? `rotate(${b.rotate} ${b.x} ${b.y})` : undefined
              }
            >
              <rect
                x={b.x - b.w / 2 + 2}
                y={b.y - b.h / 2 + 2}
                width={Math.max(4, b.w - 4)}
                height={Math.max(4, b.h - 4)}
                rx={V2_PX["radius-r1"]}
                fill={on ? C("bg-neutral-solid") : C("map-booth")}
                stroke={on ? "none" : C("stroke-neutral-weak")}
              />
              {on && (
                <text
                  x={b.x}
                  y={b.y}
                  fontSize={cellH * 0.35}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={C("fg-neutral-inverted")}
                  className="font-v2-ui font-v2-regular"
                >
                  {b.code}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
