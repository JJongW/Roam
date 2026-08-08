import { getRepository } from "@/lib/repositories";
import { pickAdminExhibition, todayISO } from "@/lib/exhibition/current";
import { ok, requireAdmin } from "@/lib/api/http";

export async function GET() {
  const denied = await requireAdmin();
  if (denied) return denied;
  const repo = await getRepository();
  const { data: exhibitions } = await repo.listExhibitions({ limit: 100 });
  const exhibition = pickAdminExhibition(exhibitions, todayISO());
  if (!exhibition) {
    return ok({ exhibition: null, signals: [], analytics: [], booths: [] });
  }
  const [signals, analytics, booths] = await Promise.all([
    repo.listExhibitionSignals(exhibition.id),
    repo._allAnalytics?.(exhibition.id) ?? Promise.resolve([]),
    repo.listBoothsByExhibitionId(exhibition.id),
  ]);
  return ok({ exhibition, signals, analytics, booths });
}
