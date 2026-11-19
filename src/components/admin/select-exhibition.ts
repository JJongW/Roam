import { api } from "@/lib/api/client";

/** 관리자가 볼 박람회를 쿠키에 저장한다. 선택기와 홈 포트폴리오 줄이 같은 길을 쓴다. */
export function selectAdminExhibition(exhibitionId: string): Promise<unknown> {
  return api.post("/api/admin/exhibition-selection", { exhibitionId });
}
