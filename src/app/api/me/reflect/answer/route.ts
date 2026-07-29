import { z } from "zod";
import { fail, noContent, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { applyReflectAnswer } from "@/lib/memory/reflect-questions";
import { emptyBrain } from "@/lib/memory/distill";

// 관람 종료 대화의 답변 → 브레인 preferences에 기록.
// 클릭으로는 알 수 없는 것(깊게/넓게·혼잡 민감도·동행 …)이라 여기서만 채워진다.
// 값 검증은 applyReflectAnswer가 한다 — 선택지에 없는 값은 조용히 무시(클라를 믿지 않음).
const schema = z.object({
  key: z.string().min(1),
  value: z.union([z.string(), z.number()]),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const parsed = await parseBody(req, schema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const brain = (await repo.getUserBrain(user.id)) ?? emptyBrain(user.id);
  await repo.saveUserBrain(
    applyReflectAnswer(brain, parsed.data.key, parsed.data.value),
  );
  return noContent();
}
