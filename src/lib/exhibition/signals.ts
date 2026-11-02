import { exhibitionStatus } from "@/lib/exhibition/status";
import type { BoothListItem, Exhibition } from "@/lib/types";

/**
 * 홈 전시 카드의 결정 근거 — **가진 사실만.**
 *
 * 인기순은 쓰지 않는다. 전시별 인기 데이터가 없고, 없는 걸 지어내면
 * "성공처럼 보이는 실패"를 홈에서 반복한다.
 *
 * 로미 준비도(groundedCount)는 Roam만 말할 수 있는 지표다. 저작 커버리지가
 * 부스마다 다른 현실을 약점으로 숨기는 대신 "여긴 로미가 잘 아는 전시야"로 쓴다.
 */
export interface ExhibitionSignals {
  /** 볼거리 부스 수 — facility(라운지·화장실·무대)는 뺀다. */
  boothCount: number;
  /** 로미가 근거를 가진 부스 수 = enrichment summary가 실제로 채워진 것. */
  groundedCount: number;
  /** 종료일까지 남은 일수(오늘 포함). 진행 중이 아니면 null. */
  daysLeft: number | null;
}

const DAY_MS = 86_400_000;

export function exhibitionSignals(
  exhibition: Exhibition,
  booths: BoothListItem[],
  todayIso: string,
): ExhibitionSignals {
  const visitable = booths.filter((b) => b.kind !== "facility");
  // 공백만 있는 summary는 근거가 아니다 — 없음과 비어 있음을 구별한다.
  const groundedCount = visitable.filter(
    (b) => (b.enrichment?.summary ?? "").trim().length > 0,
  ).length;

  const daysLeft =
    exhibitionStatus(exhibition, todayIso) === "ongoing"
      ? Math.round(
          (Date.parse(`${exhibition.endDate}T00:00:00Z`) -
            Date.parse(`${todayIso}T00:00:00Z`)) /
            DAY_MS,
        ) + 1
      : null;

  return { boothCount: visitable.length, groundedCount, daysLeft };
}
