import { redirect } from "next/navigation";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ booth?: string | string[] }>;
};

/**
 * 박람회를 고르면 지도부터(브랜드 규칙 §4, 화면 설계서 UI 3-01).
 *
 * 예전 이 주소는 추천 피드(가치 온보딩, 관심 피드, 근거 카드, 회고 입구)를 먼저 보여 줬다. 지도 먼저와
 * 부딪혀 2026-11-20 지도로 바로 보낸다. 로미가 고른 곳은 지도에 올리지 않고 목록(UI 8, K-C)에만 둔다.
 * 웹에는 그 목록이 아직 없다.
 *
 * 홈 카드, 공유된 링크, 검색 엔진이 이 주소를 그대로 들고 있어서 지우지 않고 넘겨 준다.
 * 피드 코드(components/feed, lib/feed/curate, value-onboarding, finish-visit)는 iOS가 쓰는
 * `GET /api/exhibitions/[slug]/feed`가 같은 큐레이션을 써서 남겨 둔다. 이 화면에서만 닿지 않는다.
 */
export default async function ExhibitionEntryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { booth } = await searchParams;
  const focus = typeof booth === "string" && booth ? `?booth=${encodeURIComponent(booth)}` : "";
  redirect(`/exhibitions/${encodeURIComponent(slug)}/map${focus}`);
}
