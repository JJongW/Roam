import { getRepository } from "@/lib/repositories";
import { noContent, notFound, ok, parseBody, requireAdmin } from "@/lib/api/http";
import { eventPatchInputSchema } from "@/lib/schemas";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const parsed = await parseBody(req, eventPatchInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const updated = await repo.updateEvent(id, parsed.data);
  if (!updated) return notFound();
  return ok({ event: updated });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const repo = await getRepository();
  const okDel = await repo.deleteEvent(id);
  if (!okDel) return notFound();
  return noContent();
}
