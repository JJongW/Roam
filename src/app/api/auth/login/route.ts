import { getRepository } from "@/lib/repositories";
import {
  created,
  fail,
  getUserId,
  parseBody,
  setUserCookie,
} from "@/lib/api/http";
import { loginSchema } from "@/lib/schemas";
import { readBrain } from "@/lib/memory/service";

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
    const needsOnboarding = (await readBrain(existing.id)).interests.length === 0;
    return created({ user: existing, needsOnboarding });
  }

  const user = await repo.createUser(nickname);
  await setUserCookie(user.id);
  // 새 계정은 브레인이 비어 있으니 항상 온보딩이 필요하다(브레인 조회 불필요).
  return created({ user, needsOnboarding: true });
}
