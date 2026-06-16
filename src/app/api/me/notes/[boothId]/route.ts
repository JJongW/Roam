import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { boothNoteInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ boothId: string }> };

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { boothId } = await params;
  const parsed = await parseBody(req, boothNoteInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const note = await repo.upsertNote(user.id, boothId, parsed.data);
  return ok({ note });
}
