"use client";

import { useParams } from "next/navigation";
import { MapSkeleton } from "@/components/map-v2/map-skeleton";
import { FLOORPLANS } from "@/lib/floorplans";

// 이 주소는 지도로 넘겨 주기만 한다(page.tsx). 넘어가는 동안에도 피드 뼈대가 아니라
// 그 박람회 배치도 뼈대를 보여 준다(UI 3-03, map/loading.tsx와 같다).
export default function Loading() {
  const { slug } = useParams<{ slug: string }>();
  return <MapSkeleton floorplan={slug ? FLOORPLANS[slug] : undefined} />;
}
