// 대화형 온보딩 질문 데이터 + 집계 로직(순수·LLM 없음).
// 문구(프롬프트·답변 라벨)는 i18n `onboardingQ.<id>.<key>` 키로 분리 — 여기선 값 매핑만.
// value slug = VALUE_TAGS slug(발견/체험/굿즈/소통/학습/트렌드/영감/가볍게).

export interface QOption {
  /** i18n 라벨 키(a/b/c/d) + tally에 더할 가치 slug들. */
  key: string;
  values: string[];
}
export interface Question {
  id: string;
  options: QOption[];
}

/** 앱 최초진입 — 시나리오 풀(적응형에서 순차 소진, 진행바 없음). 8가치 고루 커버. */
export const APP_QUESTIONS: Question[] = [
  {
    id: "app1",
    options: [
      { key: "a", values: ["discovery"] },
      { key: "b", values: ["goods"] },
      { key: "c", values: ["experience"] },
      { key: "d", values: ["rest"] },
    ],
  },
  {
    id: "app2",
    options: [
      { key: "a", values: ["social"] },
      { key: "b", values: ["learning"] },
      { key: "c", values: ["trend"] },
      { key: "d", values: ["inspiration"] },
    ],
  },
  {
    id: "app3",
    options: [
      { key: "a", values: ["discovery"] },
      { key: "b", values: ["experience"] },
      { key: "c", values: ["goods"] },
      { key: "d", values: ["rest"] },
    ],
  },
  {
    id: "app4",
    options: [
      { key: "a", values: ["trend"] },
      { key: "b", values: ["inspiration"] },
      { key: "c", values: ["learning"] },
      { key: "d", values: ["social"] },
    ],
  },
  {
    id: "app5",
    options: [
      { key: "a", values: ["discovery"] },
      { key: "b", values: ["experience"] },
      { key: "c", values: ["trend"] },
      { key: "d", values: ["rest"] },
    ],
  },
  {
    id: "app6",
    options: [
      { key: "a", values: ["goods"] },
      { key: "b", values: ["experience"] },
      { key: "c", values: ["social"] },
      { key: "d", values: ["inspiration"] },
    ],
  },
  {
    id: "app7",
    options: [
      { key: "a", values: ["social"] },
      { key: "b", values: ["goods"] },
      { key: "c", values: ["trend"] },
      { key: "d", values: ["inspiration"] },
    ],
  },
  {
    id: "app8",
    options: [
      { key: "a", values: ["discovery", "learning"] },
      { key: "b", values: ["experience"] },
      { key: "c", values: ["goods"] },
      { key: "d", values: ["rest"] },
    ],
  },
];

/** 전시별 — 고정 4문항(진행바 n/N). 이 전시 관람 가치 확정. */
export const EXHIBITION_QUESTIONS: Question[] = [
  {
    id: "ex1",
    options: [
      { key: "a", values: ["discovery"] },
      { key: "b", values: ["experience"] },
      { key: "c", values: ["goods"] },
      { key: "d", values: ["rest"] },
    ],
  },
  {
    id: "ex2",
    options: [
      { key: "a", values: ["learning"] },
      { key: "b", values: ["trend"] },
      { key: "c", values: ["social"] },
      { key: "d", values: ["inspiration"] },
    ],
  },
  {
    id: "ex3",
    options: [
      { key: "a", values: ["experience"] },
      { key: "b", values: ["goods"] },
      { key: "c", values: ["social"] },
      { key: "d", values: ["inspiration"] },
    ],
  },
  {
    id: "ex4",
    options: [
      { key: "a", values: ["discovery"] },
      { key: "b", values: ["learning"] },
      { key: "c", values: ["trend"] },
      { key: "d", values: ["rest"] },
    ],
  },
];

export type Tally = Record<string, number>;

/** 선택한 옵션의 가치들을 tally에 누적한 새 객체 반환. */
export function tallyAdd(tally: Tally, opt: QOption): Tally {
  const next = { ...tally };
  for (const v of opt.values) next[v] = (next[v] ?? 0) + 1;
  return next;
}

/** 누적 상위 가치 slug n개(가중 desc, 0 제외). */
export function topValues(tally: Tally, n = 3): string[] {
  return Object.entries(tally)
    .filter(([, w]) => w > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([slug]) => slug);
}

/** 적응형 종료 판정(앱 진입). 최소 5문항 + 뚜렷(가치 5종 이상 커버 or 1위 가중 ≥3),
 *  또는 풀 소진. 결정론. */
export function shouldStopAdaptive(
  tally: Tally,
  answered: number,
  poolSize: number,
): boolean {
  if (answered >= poolSize) return true;
  if (answered < 5) return false;
  const weights = Object.values(tally);
  const covered = weights.filter((w) => w > 0).length;
  const top1 = weights.length ? Math.max(...weights) : 0;
  return covered >= 5 || top1 >= 3;
}
