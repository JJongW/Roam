import { getRepository } from "@/lib/repositories";
import { created, fail, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { exhibitionInputSchema } from "@/lib/schemas";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const page = await repo.listExhibitions({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  });
  return ok(page);
}

export async function POST(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const parsed = await parseBody(req, exhibitionInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  // 같은 주소면 id(exh_<slug>)도 같아 insert가 500으로 터진다 — 칸 오류로 먼저 막는다.
  if (await repo.getExhibitionIdBySlug(parsed.data.slug)) {
    const message = "이미 다른 행사가 이 주소를 쓰고 있어요. 다른 주소로 바꿔 주세요";
    return fail("VALIDATION", message, { slug: [message] });
  }
  const exhibition = await repo.createExhibition(parsed.data);
  return created({ exhibition });
}
