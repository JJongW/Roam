import { computeTasteAccuracy, INSIGHT_THRESHOLD } from "@/lib/memory/taste";
import type { BoothNote, JudgedClass } from "@/lib/types";

/**
 * N회차 방문자의 추천 정확도 — **루프 B가 작동한다는 유일한 증거**다
 * (docs/admin-automation-architecture.md §1). 1회차보다 2회차가, 2회차보다
 * 3회차가 정확해야 로미가 전시를 넘어 학습하는 것이다.
 *
 * 회차는 **그 사용자가 반응을 남긴 전시의 순서**로 센다. 전시의 개최 순서가 아니다 —
 * 세 번째로 열린 전시가 어떤 사람에겐 첫 방문일 수 있고, 로미가 그 사람에 대해
 * 아는 양은 개최 순서가 아니라 그 사람의 방문 순서를 따른다.
 */

export interface CurveInput {
  userId: string;
  exhibitionId: string;
  /** 그 부스에 반응한 시각. 회차 정렬의 기준. */
  at: string;
  interest: BoothNote["interest"] | null | undefined;
  verdict: BoothNote["verdict"] | null | undefined;
  judgedClass: JudgedClass | null | undefined;
}

export interface CurvePoint {
  /** 1회차, 2회차 … */
  ordinal: number;
  /** 이 회차에 도달한 사용자 수. */
  users: number;
  /** 채점 가능한 판정 수(interest+verdict+judgedClass가 다 있는 것). */
  judgedCount: number;
  /** 0..100. 표본이 임계 미만이면 null. */
  pct: number | null;
  /** 숫자는 나오지만 흔들리는 표본. 판정 몇 건이 붙고 떨어지는 것만으로 몇 %p가
   *  움직인다 — 추세로 읽으면 안 된다. */
  thin: boolean;
}

/** 이 아래면 "숫자는 있지만 추세로 읽지 말 것". 임계(5)는 숫자를 보여줄지 말지의
 *  기준이고, 이건 그 숫자를 믿을지의 기준이라 따로 둔다. */
export const THIN_SAMPLE = 30;

export interface LearningCurve {
  points: CurvePoint[];
  /** 표본이 부족할 때 **왜 부족한지**. 빈 화면은 "아직 없다"만 말하고 끝나지만,
   *  무엇이 막고 있는지를 알아야 다음에 뭘 할지 정할 수 있다. */
  blocker: string | null;
}

/** 회차별로 묶어 정확도를 낸다. 순수 — I/O 없음. */
export function learningCurve(rows: CurveInput[]): LearningCurve {
  // 사용자별로 전시를 "첫 반응 시각" 순으로 세워 회차를 매긴다.
  const firstAt = new Map<string, string>(); // `${user}|${ex}` → 최초 반응
  for (const r of rows) {
    if (!r.userId || !r.exhibitionId) continue;
    const k = `${r.userId}|${r.exhibitionId}`;
    const cur = firstAt.get(k);
    if (!cur || r.at < cur) firstAt.set(k, r.at);
  }
  const ordinalOf = new Map<string, number>(); // `${user}|${ex}` → 회차
  const byUser = new Map<string, { key: string; at: string }[]>();
  for (const [key, at] of firstAt) {
    const user = key.split("|")[0];
    const list = byUser.get(user) ?? [];
    list.push({ key, at });
    byUser.set(user, list);
  }
  for (const list of byUser.values()) {
    list.sort((a, b) => a.at.localeCompare(b.at));
    list.forEach((v, i) => ordinalOf.set(v.key, i + 1));
  }

  const grouped = new Map<number, { notes: CurveInput[]; users: Set<string> }>();
  for (const r of rows) {
    const ord = ordinalOf.get(`${r.userId}|${r.exhibitionId}`);
    if (!ord) continue;
    const g = grouped.get(ord) ?? { notes: [], users: new Set<string>() };
    g.notes.push(r);
    g.users.add(r.userId);
    grouped.set(ord, g);
  }

  const points: CurvePoint[] = [...grouped.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ordinal, g]) => {
      const acc = computeTasteAccuracy(g.notes);
      return {
        ordinal,
        users: g.users.size,
        judgedCount: acc.judgedCount,
        pct: acc.pct,
        thin: acc.pct !== null && acc.judgedCount < THIN_SAMPLE,
      };
    });

  return { points, blocker: findBlocker(points) };
}

/**
 * 곡선이 왜 안 그려지는지를 한 줄로. 표본 부족은 여러 이유로 생기는데, 어느
 * 이유인지에 따라 다음에 할 일이 다르다 — 재방문자가 없는 것과, 재방문은
 * 하는데 판정을 안 남기는 것은 전혀 다른 문제다.
 */
function findBlocker(points: CurvePoint[]): string | null {
  const compared = points.filter((p) => p.pct !== null);
  if (compared.length >= 2) {
    const thin = compared.filter((p) => p.thin);
    if (thin.length > 0) {
      // 곡선이 그려지긴 하는데 결론으로 읽으면 안 되는 상태. 이걸 말 안 하면
      // "1회차 54% → 2회차 70%, 로미가 학습한다"로 읽힌다.
      return `${thin.map((p) => `${p.ordinal}회차`).join("·")} 표본이 ${THIN_SAMPLE}건 미만이라 몇 건만 바뀌어도 크게 흔들린다 — 아직 추세가 아니다. 전시마다 저작 데이터 품질이 달라서 회차 차이가 학습이 아닐 수도 있다.`;
    }
    return null;
  }

  const second = points.find((p) => p.ordinal === 2);
  if (!second) {
    return "두 번째 전시에 반응한 사용자가 아직 없다 — 회차 비교 자체가 성립하지 않는다.";
  }
  if (second.judgedCount === 0) {
    return `2회차 방문자 ${second.users}명이 반응은 남겼지만 판정(좋았어/아니었어)이 0건이다 — 관람을 마치지 않으면 채점할 게 없다.`;
  }
  if (second.judgedCount < INSIGHT_THRESHOLD) {
    return `2회차 판정이 ${second.judgedCount}건뿐이다 — ${INSIGHT_THRESHOLD}건은 모여야 정확도를 말할 수 있다.`;
  }
  return "1회차 표본이 부족하다 — 비교 기준이 없다.";
}
