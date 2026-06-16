import { getRepository } from "@/lib/repositories";
import { created, fail, noContent, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { bookmarkInputSchema } from "@/lib/schemas";

// Bookmarks ("가고 싶은 부스 저장") require a signed-in account so they persist
// per user. The user id is used as the owner key.

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return ok({ data: [] });
  const repo = await getRepository();
  const data = await repo.listBookmarks(user.id);
  return ok({ data });
}

export async function POST(req: Request) {
  const parsed = await parseBody(req, bookmarkInputSchema);
  if (!parsed.ok) return parsed.res;
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();
  const bookmark = await repo.addBookmark(user.id, parsed.data);
  return created({ bookmark });
}

export async function DELETE(req: Request) {
  const parsed = await parseBody(req, bookmarkInputSchema);
  if (!parsed.ok) return parsed.res;
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();
  await repo.removeBookmark(user.id, parsed.data);
  return noContent();
}
