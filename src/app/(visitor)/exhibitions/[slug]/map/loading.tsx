"use client";

import { useParams } from "next/navigation";
import { MapSkeleton } from "@/components/map-v2/map-skeleton";
import { FLOORPLANS } from "@/lib/floorplans";

// 지도를 불러오는 동안 그 박람회의 실제 배치도 모양을 뼈대로 보여 준다(UI 3-03).
// loading.js는 params를 받지 않아서(Next 16 문서) 클라이언트에서 useParams로 읽는다.
export default function Loading() {
  const { slug } = useParams<{ slug: string }>();
  return <MapSkeleton floorplan={slug ? FLOORPLANS[slug] : undefined} />;
}
