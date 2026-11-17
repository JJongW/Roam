// 부스 노트 한 줄에 쓰기 요청 하나를 얹은 결과를 계산한다. 순수 함수.
// supabase와 mock 저장소가 같은 규칙을 쓰도록 여기 한 곳에 둔다.
//
// 규칙(2026-11-17 Ted 결정, docs/decisions/2026-11-17_ios-기반-api.md):
// - 다녀왔어요와 평가는 따로다. 평가를 지워도 다녀왔어요는 남는다. 다녀왔어요를 끄면
//   평가도 같이 지운다. 평가를 새로 남기면 다녀왔어요도 켠다(평가는 다녀온 뒤에만 있다).
//   방문 시각은 처음 켠 시각을 지킨다 — 평가를 고쳐도 덮지 않는다.
// - 하트 하나(2026-11-07). 옛 interest 3값과 함께 산다: must·curious는 하트, pass는 하트
//   없음. heart를 보내면 interest보다 우선하고, interest만 보내는 옛 클라이언트도 하트
//   시각이 맞게 따라간다.
import type { BoothInterest, BoothVerdict } from "@/lib/types";
import type { BoothNoteInput } from "@/lib/schemas";

export interface NoteState {
  interest: BoothInterest | null;
  heartedAt: string | null;
  verdict: BoothVerdict | null;
  verdictAt: string | null;
  visitedAt: string | null;
  memo: string | null;
  photos: string[];
}

export interface NoteApplyResult {
  next: NoteState;
  /** 이 요청이 하트 묶음(interest, hearted_at)을 건드리는지. 아니면 저장할 때 빼서 기존 값을 둔다. */
  touchesHeart: boolean;
  /** 이 요청이 방문 묶음(verdict, verdict_at, visited_at)을 건드리는지. */
  touchesVisit: boolean;
  /** 쓰고 나면 남는 게 없는지 — 비면 행을 지운다. */
  empty: boolean;
}

export const EMPTY_NOTE: NoteState = {
  interest: null,
  heartedAt: null,
  verdict: null,
  verdictAt: null,
  visitedAt: null,
  memo: null,
  photos: [],
};

/** 옛 interest 값이 하트인지. pass와 null은 하트가 아니다. */
export function isHeartInterest(i: BoothInterest | null | undefined): boolean {
  return i === "must" || i === "curious";
}

/** 응답에 싣는 하트 값. 백필(0065) 전 행도 옛 interest로 읽힌다. */
export function heartOf(n: { heartedAt?: string | null; interest?: BoothInterest | null }): boolean {
  return !!n.heartedAt || isHeartInterest(n.interest);
}

export function applyNoteInput(
  existing: NoteState | null,
  input: BoothNoteInput,
  at: string,
): NoteApplyResult {
  const prev = existing ?? EMPTY_NOTE;
  const next: NoteState = { ...prev, photos: [...prev.photos] };

  // --- 하트 -------------------------------------------------------------------
  let touchesHeart = false;
  if (input.heart !== undefined) {
    touchesHeart = true;
    if (input.heart) {
      next.heartedAt = prev.heartedAt ?? at;
      next.interest = isHeartInterest(prev.interest) ? prev.interest : "must";
    } else {
      next.heartedAt = null;
      // 하트 없음. 옛 pass는 하트가 아니라 그대로 둔다(지어낸 변화를 만들지 않는다).
      next.interest = prev.interest === "pass" ? "pass" : null;
    }
  } else if (input.interest !== undefined) {
    touchesHeart = true;
    next.interest = input.interest ?? null;
    next.heartedAt = isHeartInterest(next.interest) ? (prev.heartedAt ?? at) : null;
  }

  // --- 다녀왔어요와 평가 ---------------------------------------------------------
  let touchesVisit = false;
  if (input.visited === false) {
    // 다녀왔어요를 끄면 평가도 지운다(같은 요청에 verdict가 와도 끄기가 이긴다).
    touchesVisit = true;
    next.visitedAt = null;
    next.verdict = null;
    next.verdictAt = null;
  } else {
    if (input.verdict !== undefined) {
      touchesVisit = true;
      const v = input.verdict ?? null;
      if (v) {
        next.verdictAt = v === prev.verdict ? (prev.verdictAt ?? at) : at;
        next.visitedAt = prev.visitedAt ?? at;
      } else {
        next.verdictAt = null; // 평가만 지운다 — 다녀왔어요는 남는다.
      }
      next.verdict = v;
    }
    if (input.visited === true) {
      touchesVisit = true;
      next.visitedAt = next.visitedAt ?? at;
    }
  }

  // --- 메모, 사진 -------------------------------------------------------------
  if (input.memo !== undefined) next.memo = input.memo ?? null;
  if (input.photos !== undefined) next.photos = input.photos;

  const empty =
    !next.interest &&
    !next.heartedAt &&
    !next.verdict &&
    !next.visitedAt &&
    !(next.memo ?? "").trim() &&
    next.photos.length === 0;

  return { next, touchesHeart, touchesVisit, empty };
}
