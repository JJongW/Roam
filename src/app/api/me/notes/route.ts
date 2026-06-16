import { getRepository } from "@/lib/repositories";
import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";

export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();
  const data = await repo.listNotes(user.id);
  return ok({ data });
}
