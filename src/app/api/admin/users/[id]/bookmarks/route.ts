import { getRepository } from "@/lib/repositories";
import { noContent, parseBody, requireAdmin } from "@/lib/api/http";
import { bookmarkInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function DELETE(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, bookmarkInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  await repo.removeBookmark(id, parsed.data);
  return noContent();
}
