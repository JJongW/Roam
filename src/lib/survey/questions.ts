/**
 * 공개 설문 `/survey`의 질문 — 페이지·입력 검증·관리자 집계가 모두 이것 하나를 읽는다.
 *
 * 질문을 바꾸면 `SURVEY_ID`도 바꾼다. 같은 id로 보기를 바꾸면 예전 응답의 값이
 * 새 보기에 없어서 집계에서 조용히 빠진다.
 */
export const SURVEY_ID = "venue-map-2026-10";

export interface SurveyOption {
  value: string;
  label: string;
  /** 보기 아래 작은 설명. */
  sub?: string;
}

export interface SurveyQuestion {
  key: string;
  title: string;
  /** 관리자 집계 카드의 짧은 이름. */
  short: string;
  hint?: string;
  multi?: boolean;
  /** 여러 개 고를 때 최대 개수. */
  max?: number;
  /** 보기 대신 부스 그림을 보여주는 질문(`survey-form.tsx`가 그린다). */
  visual?: "wrap" | "entry";
  options: SurveyOption[];
}

export const SURVEY_QUESTIONS: SurveyQuestion[] = [
  {
    key: "freq",
    title: "전시·박람회에 얼마나 자주 가세요?",
    short: "방문 빈도",
    options: [
      { value: "month", label: "한 달에 한 번 이상" },
      { value: "quarter", label: "두세 달에 한 번" },
      { value: "year", label: "1년에 한두 번" },
      { value: "rare", label: "거의 안 가요" },
    ],
  },
  {
    key: "kinds",
    title: "주로 어떤 전시에 가세요?",
    short: "주로 가는 전시",
    multi: true,
    options: [
      { value: "living", label: "가구·리빙·인테리어" },
      { value: "food", label: "카페·음식·주류" },
      { value: "design", label: "디자인·아트페어" },
      { value: "book", label: "책·출판·독립서점" },
      { value: "craft", label: "공예·핸드메이드 마켓" },
      { value: "biz", label: "일 때문에 가는 산업 전시" },
    ],
  },
  {
    key: "pain",
    title: "전시장에서 가장 힘든 건 뭐예요?",
    short: "가장 힘든 것",
    hint: "두 개까지 골라 주세요.",
    multi: true,
    max: 2,
    options: [
      { value: "find", label: "가려던 부스를 찾는 것" },
      { value: "route", label: "어디부터 돌지 동선을 짜는 것" },
      { value: "miss", label: "좋은 곳을 놓치고 지나치는 것" },
      { value: "remember", label: "뭘 봤는지 기억하는 것" },
      { value: "crowd", label: "사람 많은 곳을 피하는 것" },
      { value: "tired", label: "다리 아프고 지치는 것" },
    ],
  },
  {
    key: "findby",
    title: "부스를 찾을 때 무엇을 보고 찾으세요?",
    short: "부스 찾는 단서",
    options: [
      { value: "code", label: "부스 번호(A101 같은)" },
      { value: "name", label: "브랜드·부스 이름" },
      { value: "zone", label: "분야나 구역" },
      { value: "walk", label: "그냥 걸어 다니며 눈에 띄는 곳" },
    ],
  },
  {
    key: "wrap",
    title: "좁은 부스의 긴 이름, 어느 쪽이 더 읽기 편하세요?",
    short: "좁은 부스 긴 이름",
    visual: "wrap",
    options: [
      { value: "word-wrap", label: "띄어쓰기 단위로 줄바꿈", sub: "글자는 크게, 줄을 늘려요" },
      { value: "one-line", label: "한 줄로 줄여서", sub: "글자를 작게, 길면 잘라요" },
    ],
  },
  {
    key: "entry",
    title: "지도를 처음 열었을 때 무엇이 보이면 좋겠어요?",
    short: "처음 열 때",
    visual: "entry",
    options: [
      { value: "whole", label: "전시장 전체", sub: "한눈에 보이지만 이름은 작아요" },
      { value: "entrance", label: "입구 근처를 크게", sub: "이름은 읽히고, 넓게 보려면 줄여요" },
    ],
  },
  {
    key: "refind",
    title: "다녀온 뒤 “그 부스 어디였더라?” 하고 다시 찾아본 적 있어요?",
    short: "다녀온 뒤 다시 찾기",
    options: [
      { value: "often", label: "자주 있어요" },
      { value: "sometimes", label: "가끔 있어요" },
      { value: "never", label: "거의 없어요" },
    ],
  },
  {
    key: "judge",
    title: "부스에 “좋았어 · 별로” 같은 평가와 메모를 어디서 남기고 싶으세요?",
    short: "평가·메모 자리",
    options: [
      { value: "map-card", label: "지도에서 부스를 눌렀을 때 뜨는 카드에서", sub: "상세 화면에 들어가지 않고" },
      { value: "intro-tab", label: "부스 소개 화면에서", sub: "설명을 읽다가 그 자리에서" },
      { value: "record-tab", label: "“나의 기록” 탭에서", sub: "내가 남긴 것만 따로 모아서" },
    ],
  },
];

export const SURVEY_COMMENT_MAX = 1000;
