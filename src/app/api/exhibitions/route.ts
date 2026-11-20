import { getRepository } from "@/lib/repositories";
import { created, fail, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { exhibitionInputSchema } from "@/lib/schemas";
import { withOpenFields } from "@/lib/exhibition/open-gate";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const page = await repo.listExhibitions({
    cursor: searchParams.get("cursor") ?? undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  });
  // 열 수 없는 박람회도 목록엔 낸다 — 방문객 화면이 흐린 "진행 예정" 줄로 그린다.
  // openable, availability 칸을 더하기만 한다(옛 앱 디코딩 그대로).
  return ok({ ...page, data: await withOpenFields(page.data) });
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
