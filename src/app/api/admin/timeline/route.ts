import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { listExhibitionsCached } from "@/lib/repositories/cached";
import { resolveAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ok, requireAdmin } from "@/lib/api/http";
import { ADMIN_EXHIBITION_COOKIE } from "@/lib/constants";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  const { data: exhibitions } = await listExhibitionsCached();
  const cookieId = (await cookies()).get(ADMIN_EXHIBITION_COOKIE)?.value;
  const exhibition = resolveAdminExhibition(exhibitions, cookieId, todayISO());
  if (!exhibition) {
    return ok({ exhibition: null, signals: [], analytics: [], booths: [], nicknames: {} });
  }
  const [signals, analytics, booths, users] = await Promise.all([
    repo.listExhibitionSignals(exhibition.id),
    repo._allAnalytics?.(exhibition.id) ?? Promise.resolve([]),
    repo.listBoothsByExhibitionId(exhibition.id),
    repo.listUsers(),
  ]);
  // 닉네임만 필요한데 User 전체(email·avatarUrl 등 PII 포함)를 클라로 보내지
  // 않기 위해 서버에서 매핑만 뽑아 보낸다.
  const nicknames = Object.fromEntries(users.map((u) => [u.id, u.nickname]));
  return ok({ exhibition, signals, analytics, booths, nicknames });
}
