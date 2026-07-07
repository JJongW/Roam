import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { ensureLatestRecap } from "@/lib/memory/service";

// 최근 관람 회고(Companion 서술). 조회 시 lazy 생성·캐시. 관람 이력 없으면 null.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const visit = await ensureLatestRecap(user.id);
  return ok({ data: visit });
}
