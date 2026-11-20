import "server-only";
import { cache } from "react";
import { getRepository } from "@/lib/repositories";
import { fail, isAdminAuthed } from "@/lib/api/http";
import type { Exhibition } from "@/lib/types";
import { openFields } from "@/lib/exhibition/openable";

/**
 * 방문객 경로의 문지기(2026-11-20 Ted 결정, lib/exhibition/openable.ts).
 *
 * 지도에 놓인 부스가 없는 박람회는 상세, 부스, 지도, 피드를 내주지 않는다. 일부만 비운
 * 데이터를 주면 옛 앱 빌드가 빈 지도를 그린다 — 그래서 409 `NOT_OPEN` 하나로 분명히 말한다.
 * 운영자(admin 쿠키)는 그대로 통과한다 — 콘솔은 부스를 놓기 전부터 그 박람회를 다룬다.
 */

/** 요청 단위로 한 번만 묻는다(페이지의 generateMetadata와 본문이 같이 부른다). */
export const isExhibitionOpenCached = cache(async (exhibitionId: string): Promise<boolean> => {
  const repo = await getRepository();
  return (await repo.openExhibitionIds([exhibitionId])).has(exhibitionId);
});

export const NOT_OPEN_MESSAGE = "아직 진행 예정인 박람회예요";

export function notOpen() {
  return fail("NOT_OPEN", NOT_OPEN_MESSAGE);
}

/**
 * slug로 들어온 방문객 요청을 막을지. 막으면 응답을, 통과면 null을 준다.
 * 행사가 없으면 통과시킨다 — "없음"은 각 라우트가 원래대로 404로 답한다.
 */
export async function gateFairBySlug(slug: string): Promise<Response | null> {
  if (await isAdminAuthed()) return null;
  const repo = await getRepository();
  const id = await repo.getExhibitionIdBySlug(slug);
  if (!id) return null;
  return (await isExhibitionOpenCached(id)) ? null : notOpen();
}

export async function gateFairById(exhibitionId: string): Promise<Response | null> {
  if (await isAdminAuthed()) return null;
  return (await isExhibitionOpenCached(exhibitionId)) ? null : notOpen();
}

/** 목록에 열림 칸을 붙인다. 행사는 모두 내준다 — 열 수 없는 행사도 목록엔 "진행 예정"으로 보인다. */
export async function withOpenFields<T extends Pick<Exhibition, "id">>(
  exhibitions: T[],
): Promise<(T & ReturnType<typeof openFields>)[]> {
  if (exhibitions.length === 0) return [];
  const repo = await getRepository();
  const open = await repo.openExhibitionIds(exhibitions.map((e) => e.id));
  return exhibitions.map((e) => ({ ...e, ...openFields(open.has(e.id)) }));
}
