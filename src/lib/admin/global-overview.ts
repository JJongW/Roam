import type { Exhibition, User, UserSignal } from "@/lib/types";
import {
  onboardingValueBreakdown,
  type OnboardingValueCount,
} from "./journey-funnel";

/** 전시 하나치 재료 — 페이지가 저장소에서 읽어와 그대로 넘긴다. */
export interface ExhibitionBundle {
  exhibition: Exhibition;
  boothCount: number;
  signals: UserSignal[];
}

export interface PortfolioRow {
  id: string;
  slug: string;
  name: string;
  startDate: string;
  endDate: string;
  boothCount: number;
  /** 이 전시에서 신호를 남긴 고유 사용자 수. */
  visitorCount: number;
}

export interface GlobalOverview {
  totalUsers: number;
  /** 어느 전시에서든 신호를 하나라도 남긴 고유 사용자. */
  activeUsers: number;
  multiExhibitionUsers: number;
  /** 분모는 총 사용자가 아니라 활성 사용자다 — 가입만 하고 전시를 한 번도
   *  안 본 계정을 분모에 넣으면 "전시를 넘어 돌아오는가"라는 질문이 흐려진다. */
  multiExhibitionRatio: number;
  /** 전 전시 합산 가치 분포. */
  values: OnboardingValueCount[];
  /** 최근 시작 전시가 위. */
  portfolio: PortfolioRow[];
}

export function buildGlobalOverview(
  users: User[],
  bundles: ExhibitionBundle[],
): GlobalOverview {
  const exhibitionsByUser = new Map<string, Set<string>>();
  for (const b of bundles) {
    for (const s of b.signals) {
      if (!s.userId) continue;
      const seen = exhibitionsByUser.get(s.userId) ?? new Set<string>();
      seen.add(b.exhibition.id);
      exhibitionsByUser.set(s.userId, seen);
    }
  }
  const activeUsers = exhibitionsByUser.size;
  const multiExhibitionUsers = [...exhibitionsByUser.values()].filter(
    (seen) => seen.size > 1,
  ).length;

  return {
    totalUsers: users.length,
    activeUsers,
    multiExhibitionUsers,
    multiExhibitionRatio: activeUsers ? multiExhibitionUsers / activeUsers : 0,
    values: onboardingValueBreakdown(bundles.flatMap((b) => b.signals)),
    portfolio: bundles
      .map((b) => ({
        id: b.exhibition.id,
        slug: b.exhibition.slug,
        name: b.exhibition.name,
        startDate: b.exhibition.startDate,
        endDate: b.exhibition.endDate,
        boothCount: b.boothCount,
        visitorCount: new Set(
          b.signals.map((s) => s.userId).filter(Boolean),
        ).size,
      }))
      .sort((a, b) => b.startDate.localeCompare(a.startDate)),
  };
}
