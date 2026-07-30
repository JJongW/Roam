import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { recordSignal } from "@/lib/memory/service";
import { boothNoteInputSchema } from "@/lib/schemas";
import type { SignalKind } from "@/lib/types";

type Ctx = { params: Promise<{ boothId: string }> };

/** 상태 → 신호 종류. 상태 해제(null)는 신호를 남기지 않는다. */
const SIGNAL_BY_STATUS: Record<string, SignalKind | undefined> = {
  visited: "booth_visited",
  skipped: "booth_skipped",
  interested: "reaction_interested",
  later: "reaction_later",
};

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { boothId } = await params;
  const parsed = await parseBody(req, boothNoteInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const note = await repo.upsertNote(user.id, boothId, parsed.data);

  // L4 메모리: 상태 변경이 곧 신호다. 여기가 **유일한** 신호 적재 지점 —
  // 예전엔 ReactionBar가 /api/me/signal을 따로 쳐서 가봄·별로만 신호가 두 번
  // 쌓였고(끌림·나중에는 한 번), 브레인 가중치가 왜곡됐다. 어느 화면에서 상태를
  // 바꾸든(지도·피드·부스 상세 패널) 이 경로를 지나므로 빠뜨릴 곳이 없다.
  const kind = SIGNAL_BY_STATUS[parsed.data.status ?? ""];
  if (kind) await recordSignal(user.id, { kind, boothId });

  return ok({ note });
}
