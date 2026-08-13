import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { loginSchema } from "@/lib/schemas";

/**
 * 닉네임 변경 — Google 로그인 사용자는 가입 시 실명/이메일에서 딴 닉네임을 그대로
 * 쓰게 되는데(uniqueNickname), 리뷰·방문기록 등 공개되는 자리에 실명이 남는 걸
 * 싫어할 수 있다. 로그인 후 언제든 바꿀 수 있게 한다.
 */
export async function PATCH(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const parsed = await parseBody(req, loginSchema);
  if (!parsed.ok) return parsed.res;

  const nickname = parsed.data.nickname;
  const repo = await getRepository();
  const existing = await repo.getUserByNickname(nickname);
  if (existing && existing.id !== user.id) {
    return fail("CONFLICT", "이미 사용 중인 닉네임이에요", {
      nickname: ["이미 사용 중인 닉네임이에요"],
    });
  }

  const updated = await repo.updateNickname(user.id, nickname);
  if (!updated) return fail("NOT_FOUND", "계정을 찾을 수 없어요");
  return ok({ user: updated });
}
