import { getRepository } from "@/lib/repositories";
import { noContent, notFound, ok, requireAdmin } from "@/lib/api/http";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const repo = await getRepository();
  const user = await repo.getUser(id);
  if (!user) return notFound("계정을 찾을 수 없습니다");
  const [signals, bookmarks] = await Promise.all([
    repo.listUserSignals(id),
    repo.listBookmarks(id),
  ]);
  return ok({ user, signals, bookmarks });
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const repo = await getRepository();
  const deleted = await repo.deleteUser(id);
  if (!deleted) return notFound("계정을 찾을 수 없습니다");
  return noContent();
}
