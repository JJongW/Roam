import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { notificationReadSchema } from "@/lib/schemas";

/** 알림함 읽음 표시. `{ ids: [...] }` 또는 `{ all: true }`. 내 줄만 고친다. */
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const parsed = await parseBody(req, notificationReadSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const updated = await repo.markNotificationsRead(user.id, "all" in parsed.data ? "all" : parsed.data.ids);
  return ok({ updated });
}
