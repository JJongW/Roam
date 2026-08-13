"use client";

import { useEffect } from "react";
import { useCompanionStore } from "@/lib/stores/companion";

/**
 * 부스 상세(/booths/[id])엔 URL에 전시 slug가 없어 컴패니언 바가 pathname만으로는
 * 전시를 못 알아낸다(companion-bar.tsx) — 이 화면이 이미 아는 exhibitionId를
 * 스토어로 대신 흘려보낸다. HomeCompanionContextBridge와 같은 생명주기 패턴.
 */
export function BoothExhibitionContextBridge({
  exhibitionId,
}: {
  exhibitionId: string;
}) {
  const setActiveExhibitionId = useCompanionStore(
    (s) => s.setActiveExhibitionId,
  );
  useEffect(() => {
    setActiveExhibitionId(exhibitionId);
    return () => setActiveExhibitionId(null);
  }, [exhibitionId, setActiveExhibitionId]);
  return null;
}
