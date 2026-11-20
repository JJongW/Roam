"use client";

import { useEffect, useMemo, useState } from "react";
import { useMyRecords } from "@/components/me/use-my-records";
import { useVisitStore } from "@/lib/stores/visit";
import { isVerdictDismissed, needsVerdict, visitedLastWeek } from "@/lib/me/ended-entry";
import type { FairGroup, MeFair } from "@/lib/me/view";

/**
 * 끝난 박람회 입구(UI 11)에 쓰는 기록. 홈(M3, H-B)과 마이페이지(M6)가 같이 쓴다.
 * 평가를 묻는 박람회는 한 번 정하면 그대로 둔다 — 시트에서 마지막 평가를 고르는 순간 카드가 사라지면
 * 시트도 같이 닫혀 "남겨 주셔서 고마워요"를 못 본다.
 */
export function useEndedEntry(fairs: MeFair[], today: string) {
  const { loading, visited } = useMyRecords(fairs, today);
  const records = useVisitStore((s) => s.records);
  const [hidden, setHidden] = useState(false);
  const [pinned, setPinned] = useState<FairGroup | null>(null);
  const candidate = useMemo(
    () =>
      loading
        ? null
        : needsVerdict(visited, (id) => records[id]?.verdict, today, isVerdictDismissed),
    [loading, visited, records, today],
  );
  useEffect(() => {
    // 처음 정해진 박람회 하나만 잡아 둔다(위 주석). 외부 기록이 바뀌어도 바꾸지 않는다.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!pinned && candidate) setPinned(candidate);
  }, [candidate, pinned]);
  const ask = hidden ? null : pinned;
  const lastWeek = useMemo(() => (loading ? [] : visitedLastWeek(visited, today)), [loading, visited, today]);
  return { loading, ask, hideAsk: () => setHidden(true), lastWeek, visited };
}
