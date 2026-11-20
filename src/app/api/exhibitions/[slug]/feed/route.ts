import { getExhibitionCached } from "@/lib/repositories/cached";
import { curateFeed } from "@/lib/feed/curate";
import { readBrain } from "@/lib/memory/service";
import { getI18n } from "@/lib/i18n/server";
import { getCurrentUser } from "@/lib/api/session";
import { DEFAULT_RHYTHM, isRhythm } from "@/lib/feed/rhythm";
import { notFound, ok } from "@/lib/api/http";
import { gateFairBySlug } from "@/lib/exhibition/open-gate";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  // 지도에 놓인 부스가 없는 박람회는 방문객에게 내주지 않는다(lib/exhibition/open-gate.ts).
  const gated = await gateFairBySlug(slug);
  if (gated) return gated;
  const detail = await getExhibitionCached(slug);
  if (!detail) return notFound("행사를 찾을 수 없어요");

  const { searchParams } = new URL(req.url);
  const rhythmRaw = searchParams.get("rhythm") ?? undefined;
  const rhythm = isRhythm(rhythmRaw) ? rhythmRaw : DEFAULT_RHYTHM;

  const [{ locale }, user] = await Promise.all([getI18n(), getCurrentUser()]);
  const brain = user ? await readBrain(user.id) : undefined;
  const items = await curateFeed(slug, user?.id ?? null, rhythm, locale, brain);

  return ok(items);
}
