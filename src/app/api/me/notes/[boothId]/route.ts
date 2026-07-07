import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { recordSignal } from "@/lib/memory/service";
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

  // L4 메모리: 방문/skip은 관심 신호로 적재(결정론 증류). 부스 tags→slug.
  if (parsed.data.status === "visited" || parsed.data.status === "skipped") {
    await recordSignal(user.id, {
      kind:
        parsed.data.status === "visited" ? "booth_visited" : "booth_skipped",
      boothId,
    });
  }

  return ok({ note });
}
