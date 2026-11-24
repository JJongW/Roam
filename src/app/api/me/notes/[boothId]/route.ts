import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { recordSignal, classifyForUser } from "@/lib/memory/service";
import { boothNoteInputSchema } from "@/lib/schemas";
import type { JudgedClass } from "@/lib/memory/taste";
import type { SignalKind } from "@/lib/types";
import { heartOf } from "@/lib/notes/apply";
import { followBrandForBoothHeart } from "@/lib/brands/follow";

type Ctx = { params: Promise<{ boothId: string }> };

/** interest 값 → 신호 종류. */
const SIGNAL_BY_INTEREST: Record<string, SignalKind> = {
  must: "reaction_must",
  curious: "reaction_curious",
  pass: "reaction_pass",
};
/** verdict 값 → 신호 종류. */
const SIGNAL_BY_VERDICT: Record<string, SignalKind> = {
  good: "verdict_good",
  ok: "verdict_ok",
  bad: "verdict_bad",
};

export async function PUT(req: Request, { params }: Ctx) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const { boothId } = await params;
  const parsed = await parseBody(req, boothNoteInputSchema);
  if (!parsed.ok) return parsed.res;

  const repo = await getRepository();
  const existing = (await repo.listNotes(user.id)).find(
    (n) => n.boothId === boothId,
  );

  // 이 쓰기가 interest·verdict 중 무엇을 실제로 바꾸는지 각각 확인한다 — 메모만
  // 고치는 쓰기(둘 다 undefined로 옴)에서 이미 확정된 판정을 조용히 재계산하면
  // 안 된다(기존 statusChanged 가드와 같은 원칙, 이제 두 필드 각각에 적용).
  // heart를 보내면 interest보다 우선한다(lib/notes/apply.ts) — interest 경로는 옛 클라이언트용.
  const heartSent = parsed.data.heart !== undefined;
  const heartChanged =
    heartSent && heartOf(existing ?? {}) !== parsed.data.heart;
  const interestChanged =
    heartChanged ||
    (!heartSent &&
      parsed.data.interest !== undefined &&
      (existing?.interest ?? null) !== (parsed.data.interest ?? null));
  const verdictChanged =
    parsed.data.verdict !== undefined &&
    (existing?.verdict ?? null) !== (parsed.data.verdict ?? null);

  // 판정 등급은 나중에 바뀐 필드가 최종이다 — verdict가 둘 다 바뀐 요청에서 나중
  // 판정으로 남는다(같은 요청이면 verdict 우선, judgment-vocabulary §6).
  let judgedClass: JudgedClass | null | undefined;
  const booth = interestChanged || verdictChanged ? await repo.getBooth(boothId) : null;
  if (verdictChanged) {
    judgedClass = parsed.data.verdict
      ? booth
        ? await classifyForUser(booth, user.id)
        : null
      : null; // verdict 해제 → 판정도 지운다
  } else if (interestChanged) {
    const nowInterested = heartSent ? parsed.data.heart : parsed.data.interest;
    judgedClass = nowInterested
      ? booth
        ? await classifyForUser(booth, user.id)
        : null
      : null;
  } // else: 둘 다 불변(메모/사진만 편집) → undefined, 기존 판정을 안 건드린다.

  const note = await repo.upsertNote(user.id, boothId, parsed.data, judgedClass);

  // UI 23(2026-11-24): 부스 하트가 바뀌면 그 부스의 브랜드 하트도 따라 맞춘다(lib/brands/follow.ts).
  // 하트 경로(heart)와 옛 interest 경로 둘 다 실제 하트가 바뀐 경우만. 부스 하트 저장은 이미 끝났으므로
  // 따라가기가 실패해도(예: 0074 적용 전) 이 요청을 실패로 돌리지 않고 로그만 남긴다.
  const wasHearted = heartOf(existing ?? {});
  const isHearted = heartOf(note);
  if (wasHearted !== isHearted) {
    try {
      await followBrandForBoothHeart(repo, user.id, boothId, isHearted);
    } catch (e) {
      console.error("[brand-follow] 부스 하트를 브랜드 하트로 맞추지 못했어요", { boothId, err: (e as Error).message });
    }
  }

  // L4 메모리: 상태 변경이 곧 신호다. 이 경로가 유일한 신호 적재 지점.
  if (heartChanged) {
    await recordSignal(user.id, {
      kind: parsed.data.heart ? "heart_added" : "heart_removed",
      boothId,
    });
  } else if (interestChanged && parsed.data.interest) {
    await recordSignal(user.id, {
      kind: SIGNAL_BY_INTEREST[parsed.data.interest],
      boothId,
    });
  }
  if (verdictChanged && parsed.data.verdict) {
    await recordSignal(user.id, {
      kind: SIGNAL_BY_VERDICT[parsed.data.verdict],
      boothId,
    });
  }

  // 다녀왔어요는 평가와 다른 신호다(2026-11-17 결정). 평가로 처음 켜진 방문도 남긴다.
  const wasVisited = !!existing?.visitedAt;
  const isVisited = !!note.visitedAt;
  if (wasVisited !== isVisited) {
    await recordSignal(user.id, {
      kind: isVisited ? "visit_marked" : "visit_unmarked",
      boothId,
    });
  }

  const taste = booth
    ? await repo.getTasteAccuracy(user.id, booth.exhibitionId)
    : note
      ? await (async () => {
          const b = await repo.getBooth(boothId);
          return b
            ? repo.getTasteAccuracy(user.id, b.exhibitionId)
            : { judgedCount: 0, pct: null };
        })()
      : { judgedCount: 0, pct: null };

  return ok({ note, taste });
}
