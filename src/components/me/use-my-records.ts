"use client";

import { useMemo } from "react";
import { isHearted, isVisited, useVisitStore } from "@/lib/stores/visit";
import { useHydrated } from "@/lib/hooks/use-hydrated";
import { useBoothMeta } from "@/lib/me/use-booth-meta";
import { groupByFair, type MeBoothRow, type MeFair } from "@/lib/me/view";

/**
 * 마이페이지가 읽는 기록: 하트 남긴 부스와 다녀온 부스를 박람회별로 묶은 것.
 * 원천은 이 브라우저의 기록(로그인하면 계정 노트와 합친 것, stores/visit.ts). 하트와 다녀온 기록은 따로 센다.
 */
export function useMyRecords(
  fairs: MeFair[],
  today: string,
  { withCategory = false }: { withCategory?: boolean } = {},
) {
  const hydrated = useHydrated();
  const records = useVisitStore((s) => s.records);
  const heartIds = useMemo(
    () => (hydrated ? Object.keys(records).filter((id) => isHearted(records[id])) : []),
    [records, hydrated],
  );
  const visitedIds = useMemo(
    () => (hydrated ? Object.keys(records).filter((id) => isVisited(records[id])) : []),
    [records, hydrated],
  );
  const allIds = useMemo(
    () => [...new Set([...heartIds, ...visitedIds])],
    [heartIds, visitedIds],
  );
  const meta = useBoothMeta(allIds, { withCategory });
  const loading = !hydrated || allIds.some((id) => !(id in meta));

  const toRows = (ids: string[]): MeBoothRow[] =>
    ids.flatMap((id) => {
      const m = meta[id];
      return m ? [{ boothId: id, ...m }] : [];
    });
  const hearts = useMemo(
    () => groupByFair(toRows(heartIds), fairs, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [heartIds, meta, fairs, today],
  );
  const visited = useMemo(
    () => groupByFair(toRows(visitedIds), fairs, today),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [visitedIds, meta, fairs, today],
  );
  /** 다녀온 박람회마다 처음 다녀온 시각(ISO). 없으면 비어 있다. */
  const firstVisit = (exhibitionId: string) =>
    visited
      .find((g) => g.fair.id === exhibitionId)
      ?.rows.map((r) => records[r.boothId]?.visitedAt)
      .filter((v): v is string => !!v)
      .sort()[0];

  return { loading, hearts, visited, heartCount: heartIds.length, firstVisit };
}
