import { getRepository } from "@/lib/repositories";
import { ok } from "@/lib/api/http";

type Ctx = { params: Promise<{ slug: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { slug } = await params;
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const page = await repo.listBooths(slug, {
    hallId: searchParams.get("hallId") ?? undefined,
    categoryId: searchParams.get("categoryId") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    cursor: searchParams.get("cursor") ?? undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  });
  return ok(page);
}
