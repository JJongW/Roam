import { getRepository } from "@/lib/repositories";
import { created, fail, getUserId, parseBody, setUserCookie } from "@/lib/api/http";
import { loginSchema } from "@/lib/schemas";

/**
 * Nickname login. The nickname is a unique public key:
 * - free → create the account and sign in
 * - taken by you (same cookie) → re-issue cookie, sign in
 * - taken by someone else → 409 (cannot be reused)
 */
export async function POST(req: Request) {
  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.res;
  const { nickname } = parsed.data;
  const repo = await getRepository();

  const existing = await repo.getUserByNickname(nickname);
  if (existing) {
    const currentId = await getUserId();
    if (existing.id !== currentId) {
      return fail("CONFLICT", "이미 사용 중인 닉네임이에요", {
        nickname: ["이미 사용 중인 닉네임이에요"],
      });
    }
    await setUserCookie(existing.id);
    return created({ user: existing });
  }

  const user = await repo.createUser(nickname);
  await setUserCookie(user.id);
  return created({ user });
}
