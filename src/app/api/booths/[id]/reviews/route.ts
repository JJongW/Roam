import { getRepository } from "@/lib/repositories";
import { created, ok, parseBody } from "@/lib/api/http";
import { ensureSession } from "@/lib/api/session";
import { reviewInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const { id } = await params;
  const { searchParams } = new URL(req.url);
  const repo = await getRepository();
  const result = await repo.listReviews(id, {
    cursor: searchParams.get("cursor") ?? undefined,
    limit: Number(searchParams.get("limit")) || undefined,
  });
  return ok(result);
}

export async function POST(req: Request, { params }: Ctx) {
  const { id } = await params;
  const parsed = await parseBody(req, reviewInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const detail = await repo.getBoothDetail(id);
  const session = await ensureSession(detail?.booth.exhibitionId);
  const review = await repo.createReview(id, session.id, parsed.data);
  return created({ review });
}
