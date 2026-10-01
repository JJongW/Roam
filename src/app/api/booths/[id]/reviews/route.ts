import { getRepository } from "@/lib/repositories";
import { created, fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
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
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요합니다");
  const repo = await getRepository();
  const review = await repo.createReview(id, user.id, parsed.data);
  return created({ review });
}
