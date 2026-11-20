"use client";

import { useEffect, useMemo } from "react";
import Link from "next/link";
import { Check, ChevronRight } from "lucide-react";
import { BackButton } from "@/components/v2/back-button";
import { RomiAvatar } from "@/components/v2/romi-avatar";
import {
  isVisited,
  useVisitStore,
  type VerdictValue,
} from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { FLOORPLANS } from "@/lib/floorplans";
import { MiniMap } from "@/components/booth-v2/mini-map";
import { floorplanHallOf } from "@/lib/floorplan/hall-of";
import { dayKo, label, system } from "@/lib/copy/v1";
import { SCREEN, track } from "@/lib/analytics/app-track";
import { useBoothMeta } from "@/lib/me/use-booth-meta";
import { readRecap } from "@/lib/recap/visit-memory";

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

/**
 * UI 6-10 "다녀왔어요" 목록(Figma 3003:9490). 박람회별로 묶어 작은 지도(다녀온 칸만 진하게)와 부스 줄.
 * - 원천: 이 기기의 기록(로그인하면 계정 노트가 합쳐진 것).
 * - 부스 이름: 로그인했으면 GET /api/me/notes?expand=booth 한 번(API A-1, PR #172). 거기 없는 것(아직 올라가지
 *   않은 기기 기록)과 로그인 전에는 부스마다 GET /api/booths/{id}를 6개씩 묶어 부른다.
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
  const meta = useBoothMeta(ids);

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
            const recap = readRecap(fair!.slug);
            const first = rows
              .map((r) => r.visitedAt)
              .filter(Boolean)
              .sort()[0];
            return (
              <section
                key={fair!.id}
                id={fair!.slug}
                className="flex scroll-mt-v2-x4 flex-col gap-v2-x3 overflow-hidden rounded-v2-r4 border border-v2-stroke-neutral-muted bg-v2-bg-layer-floating pb-v2-x2 pt-v2-x4"
              >
                {fp && (
                  <div className="px-v2-x4">
                  <MiniMap
                    floorplan={fp}
                    codes={
                      new Set(
                        rows.map((r) => r.code).filter((c): c is string => !!c),
                      )
                    }
                  />
                  </div>
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
                {recap?.text && (
                  // 12-05(40-C) 그날 쓰신 말. 고치지 않고 그대로, 회색 따옴표 글과 쓴 날.
                  // 글은 이 브라우저에만 있다(서버에 글 칸이 없다). "다음 박람회에도 나와요"는 그 API가 없어 아직 없다.
                  <figure className="mx-v2-x4 flex flex-col gap-v2-x1 border-b border-v2-stroke-neutral-muted pb-v2-x3">
                    <blockquote className="whitespace-pre-line text-v2-t5 font-v2-medium text-v2-fg-neutral-muted">
                      “{recap.text}”
                    </blockquote>
                    {recap.date && (
                      <figcaption className="text-v2-t3 font-v2-medium text-v2-fg-neutral-subtle">
                        {system.writtenOn(dayKo(recap.date))}
                      </figcaption>
                    )}
                  </figure>
                )}
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
