import { z } from "zod";
import { cookies } from "next/headers";
import { noContent, parseBody, requireAdmin } from "@/lib/api/http";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";

const bodySchema = z.object({ exhibitionId: z.string().min(1) });

/**
 * 운영자가 admin 전시 선택기로 고른 전시를 쿠키에 저장한다. 존재하지 않는
 * exhibitionId를 형식만 통과해 저장해도 안전 — 각 소비처의 resolveAdminExhibition이
 * 목록에 없으면 자동 선택으로 폴백한다.
 */
export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, bodySchema);
  if (!parsed.ok) return parsed.res;

  const store = await cookies();
  store.set(ADMIN_EXHIBITION_COOKIE, parsed.data.exhibitionId, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return noContent();
}
