// 방문객 반응 — Roam 신호에서 센 사실 기록(기준 문서 3장). 순수 함수.
// 다녀왔다고 좋아한다고 보지 않고, 반응이 없다고 싫어한다고 보지 않는다(브랜드 규칙 §4).
// 그래서 칸마다 따로 세고 합친 점수를 만들지 않는다.
import type { BoothNote } from "@/lib/types";

export interface ReactionCounts {
  must: number;
  curious: number;
  pass: number;
  visited: number;
  good: number;
  ok: number;
  bad: number;
  /** 반응을 남긴 사람 수(중복 없이). */
  people: number;
}

export function countReactions(notes: Pick<BoothNote, "userId" | "interest" | "verdict" | "visitedAt">[]): ReactionCounts {
  const c: ReactionCounts = { must: 0, curious: 0, pass: 0, visited: 0, good: 0, ok: 0, bad: 0, people: 0 };
  const people = new Set<string>();
  for (const n of notes) {
    if (!n.interest && !n.verdict && !n.visitedAt) continue;
    people.add(n.userId);
    if (n.interest) c[n.interest]++;
    if (n.visitedAt) c.visited++;
    if (n.verdict) c[n.verdict]++;
  }
  c.people = people.size;
  return c;
}

/** 화면 라벨 — 판단 버튼 어휘(02_voice-tone.md §5, 2026-11-03 확정)와 같은 말. */
export const REACTION_LABEL: Record<Exclude<keyof ReactionCounts, "people">, string> = {
  must: "꼭 갈래요",
  curious: "끌려요",
  pass: "패스",
  visited: "여기 다녀왔어요",
  good: "좋았어요",
  ok: "그저 그랬어요",
  bad: "아니었어요",
};
