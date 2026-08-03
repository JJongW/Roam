import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { recordSignal, classifyForUser } from "@/lib/memory/service";
import { boothNoteInputSchema } from "@/lib/schemas";
import type { JudgedClass } from "@/lib/memory/taste";
import type { SignalKind } from "@/lib/types";

type Ctx = { params: Promise<{ boothId: string }> };

/** 상태 → 신호 종류. 상태 해제(null)는 신호를 남기지 않는다. */
const SIGNAL_BY_STATUS: Record<string, SignalKind | undefined> = {
  visited: "booth_visited",
  skipped: "booth_skipped",
  interested: "reaction_interested",
  later: "reaction_later",
};

/** 이 상태 값이 확신·부정 반응이면 true — 상태가 실제로 "바뀔 때"만 판정을 새로
 *  계산한다(호출부에서 statusChanged와 함께 쓴다). 상태가 그대로인데(메모만 고치는
 *  쓰기 등) 여기 걸리면, 이미 얼려둔 judged_class를 지금 브레인 상태로 조용히
 *  재채점하게 된다 — "판정은 그 순간에 얼린다"는 원칙을 메모 편집 한 번으로 깨뜨리는
 *  것이다. visited(가봄)는 무판정(되묻기 전엔) — 그 자체로는 재계산 대상이 아니다. */
function needsJudgment(status: string | null | undefined): boolean {
  return status === "interested" || status === "later" || status === "skipped";
}

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { boothId } = await params;
  const parsed = await parseBody(req, boothNoteInputSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();

  const status = parsed.data.status ?? null;
  // 이 쓰기가 상태를 실제로 바꾸는지 먼저 확인한다 — 안 그러면 메모만 고치는 쓰기
  // (status는 그대로 보내지는데 memo만 다른 PUT, 예: 부스 상세의 메모 편집)에서도
  // 매번 judged_class가 지금 브레인으로 재계산돼 이미 확정된 판정이 조용히 바뀐다.
  const existing = (await repo.listNotes(user.id)).find(
    (n) => n.boothId === boothId,
  );
  const statusChanged = (existing?.status ?? null) !== status;

  let judgedClass: JudgedClass | null | undefined;
  if (statusChanged) {
    if (needsJudgment(status)) {
      const booth = await repo.getBooth(boothId);
      judgedClass = booth ? await classifyForUser(booth, user.id) : null;
    } else if (!status) {
      judgedClass = null; // 해제 — 판정도 지운다
    } // else: status === "visited"로 새로 바뀜 → undefined로 남겨 무판정 유지.
  } // else: 상태 불변(메모/사진만 편집) → undefined, 기존 판정을 안 건드린다.

  const note = await repo.upsertNote(user.id, boothId, parsed.data, judgedClass);

  // L4 메모리: 상태 변경이 곧 신호다. 여기가 **유일한** 신호 적재 지점 —
  // 예전엔 ReactionBar가 /api/me/signal을 따로 쳐서 가봄·별로만 신호가 두 번
  // 쌓였고(끌림·나중에는 한 번), 브레인 가중치가 왜곡됐다. 어느 화면에서 상태를
  // 바꾸든(지도·피드·부스 상세 패널) 이 경로를 지나므로 빠뜨릴 곳이 없다.
  const kind = SIGNAL_BY_STATUS[status ?? ""];
  if (kind) await recordSignal(user.id, { kind, boothId });

  // 취향 정확도 — 이 부스의 전시로 스코프. 클라이언트는 이 값을 그대로 표시할 뿐
  // 자기 공식으로 계산하지 않는다(서버 유일 진실).
  const booth = await repo.getBooth(boothId);
  const taste = booth
    ? await repo.getTasteAccuracy(user.id, booth.exhibitionId)
    : { judgedCount: 0, pct: null };

  return ok({ note, taste });
}
