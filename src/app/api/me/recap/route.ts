import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { ensureLatestRecap, readBrain } from "@/lib/memory/service";
import { nextReflectQuestion } from "@/lib/memory/reflect-questions";

// 최근 관람 회고(Companion 서술) + 이번에 물을 질문 하나.
// 회고는 "오늘 이랬어"로 끝나면 안 되고, 클릭으로 알 수 없는 걸 하나 물어
// 다음 전시를 더 잘 고르게 해야 한다(관람 아크의 '후'). 질문은 아직 답하지
// 않은 것 중 하나 — 다 채워졌으면 null이고 그때는 더 묻지 않는다.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const [visit, brain] = await Promise.all([
    ensureLatestRecap(user.id),
    readBrain(user.id),
  ]);
  return ok({ data: { visit, question: nextReflectQuestion(brain) } });
}
