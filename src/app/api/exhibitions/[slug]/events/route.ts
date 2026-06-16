import { getRepository } from "@/lib/repositories";
import { ok } from "@/lib/api/http";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const data = await repo.listEvents(slug, {
    boothId: searchParams.get("boothId") ?? undefined,
    from: searchParams.get("from") ?? undefined,
    to: searchParams.get("to") ?? undefined,
  });
  return ok({ data });
}
