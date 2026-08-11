import { getRepository } from "@/lib/repositories";
import { noContent, notFound, ok, requireAdmin } from "@/lib/api/http";
import { readBrain } from "@/lib/memory/service";
import { valueDef } from "@/lib/values";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const denied = await requireAdmin();
  if (denied) return denied;
  const { id } = await params;
  const repo = await getRepository();
  const user = await repo.getUser(id);
  if (!user) return notFound("계정을 찾을 수 없습니다");
  const [signals, bookmarks, brain] = await Promise.all([
    repo.listUserSignals(id),
    repo.listBookmarks(id),
    readBrain(id),
  ]);
  // 방문객 자신의 "내 취향" 화면(brain-sheet.tsx)과 완전히 같은 파생 로직 —
  // 8가치 축 노드만 뽑는다(분야 slug 노드는 취향 레이더 축이 아니라서 제외).
  // 로직이 갈리면 관리자가 보는 취향과 사용자 자신이 보는 취향이 달라진다.
  const values: Record<string, number> = {};
  for (const n of brain.interests) {
    if (valueDef(n.key)) values[n.key] = n.confidence;
  }
  return ok({ user, signals, bookmarks, values });
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
