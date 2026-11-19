import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";

/**
 * 박람회 하나를 골라 보는 관리자 화면이 쓰는 범위. 쿠키(선택기에서 고른 값)가 있으면 그것,
 * 없으면 오늘 기준 자동 선택. 이 함수를 부르는 화면만 선택기(AdminFairHeader)를 그린다.
 * 전체 화면(홈, 브랜드, 계정 등)은 부르지 않는다(2026-11-19 Ted: 홈에 박람회 선택기가 떠 있음).
 */
export const getAdminFairScope = cache(async () => {
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());
  return { exhibitions, exhibition };
});
