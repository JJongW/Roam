import { z } from "zod";
import { fail, noContent, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { recordSignal } from "@/lib/memory/service";

// 범용 사용자 신호 수신구(L4). 피드 클릭 등 클라 상호작용을 원장에 적재 → 브레인 재증류.
const signalSchema = z.object({
  boothId: z.string().min(1),
  kind: z.enum([
    "feed_click",
    "booth_visited",
    "booth_skipped",
    "booth_bookmarked",
    "reaction_interested",
    "reaction_later",
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
