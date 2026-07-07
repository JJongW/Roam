import { ok, fail } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { readBrain } from "@/lib/memory/service";

// L4 종단 브레인 조회(관찰·후속 UI용). 증류본 요약, 원장 아님.
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const brain = await readBrain(user.id);
  return ok({ data: brain });
}
