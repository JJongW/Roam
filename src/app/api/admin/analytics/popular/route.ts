import { getRepository } from "@/lib/repositories";
import { fail, ok, requireAdmin } from "@/lib/api/http";

export async function GET(req: Request) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { searchParams } = new URL(req.url);
  const exhibitionId = searchParams.get("exhibitionId");
  if (!exhibitionId) return fail("VALIDATION", "exhibitionId required");
  const limit = Number(searchParams.get("limit")) || undefined;
  const repo = await getRepository();
  return ok({ booths: await repo.analyticsPopular(exhibitionId, limit) });
}
