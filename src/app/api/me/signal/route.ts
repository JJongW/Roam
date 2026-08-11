import { z } from "zod";
import { fail, noContent, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { recordSignal } from "@/lib/memory/service";

// 범용 사용자 신호 수신구(L4). 피드 클릭 등 클라 상호작용을 원장에 적재 → 브레인 재증류.
const signalSchema = z.object({
  boothId: z.string().min(1),
  kind: z.enum([
    "feed_click",
    "booth_bookmarked",
    // route_saved는 뺐다 — 클라 호출부가 하나도 없는데 SIGNAL_WEIGHTS에서 가장
    // 무거운 explicit 가중치(1.5)를 가져, 쓰이지도 않으면서 클라가 쓸 수 있는
    // 표면만 넓혀뒀다(judgment-vocabulary 최종 리뷰 Fix 9). 실제 기능이 생기면 다시 추가.
    "reaction_must",
    "reaction_curious",
    "reaction_pass",
    "verdict_good",
    "verdict_ok",
    "verdict_bad",
    "search_query",
  ]),
});

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인해야 해");
  const parsed = await parseBody(req, signalSchema);
  if (!parsed.ok) return parsed.res;
  await recordSignal(user.id, {
    kind: parsed.data.kind,
    boothId: parsed.data.boothId,
  });
  return noContent();
}
