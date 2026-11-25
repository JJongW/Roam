// 지도 첫 진입(UI 1), 열리기 전(UI 10), 끝난 박람회 지도(UI 11)의 사용자 문구. iOS V1Copy와 같은 글이다.
// 브랜드 규칙: 해요체 존댓말, "전시" 없음, 가운뎃점 없음, 라벨은 명사 끝 허용(§5). 로미는 동행자(§5).
// v1.ts는 다른 화면 작업이 같이 고치는 파일이라 이 묶음 문구는 여기에 둔다.

export const entryCopy = {
  // UI 1
  welcome: (fair: string) => `${fair}에 오셨네요`,
  moodBody: "눈길 가는 사진을 두 장 골라 주세요. 이번 행사에 나오는 부스의 사진이에요.",
  moodHint: "두 장을 고르면 바로 지도로 가요",
  moodDone: "두 장 고르셨네요. 이제 지도로 가요",
  skip: "건너뛰기",
  moodPhoto: (name: string) => `${name} 부스 사진`,
  onsiteAsk: "지금 행사장에 계세요?",
  onsiteBody: "고르신 사진의 부스와 같은 분류에서 몇 곳을 이어서 보여 드릴게요.",
  onsiteHere: "행사장에 있어요",
  onsitePlanning: "미리 보는 중이에요",
  later: "나중에 할게요",
  firstPicksHead: (n: number) => `고르신 사진으로 ${n === 3 ? "세" : n === 2 ? "두" : "한"} 곳을 골라 봤어요`,
  heartLeft: (name: string) => `‘${name}’에 하트를 남겼어요`,
  leaveHeart: "하트 남기기",
  notThis: "이건 아니에요",
  /** UI 24 Q2A-2 미리보기 시트 둘째 동작(부스 상세로). Figma 3311:23690 글자 그대로. */
  seeDetail: "자세히 보기",
  progress: (i: number, n: number) => `${i} / ${n}`,
  knownTitle: "제가 알고 있는 것",
  /** 7-02 둘러보기 줄 설명 */
  knownRowSub: "오늘 고르신 답이에요. 언제든 바꿀 수 있어요.",
  knownBody: "직접 고르고 남기신 것만 보여요. 언제든 바꿀 수 있어요.",
  knownNote: "둘러본 시간이나 지나간 길로 취향을 짐작하지 않아요.",
  pickedMood: "고르신 사진",
  /** 1-07 고르신 사진 줄: 고르신 사진의 부스 이름. Figma는 "분위기" 낱말이지만 웹은 부스 사진을 고르므로 "분위기"라 부르지 않는다(브랜드 검토, §2 §5). */
  pickedPhotosOf: (names: string) => `${names} 사진`,
  notPicked: "고르신 사진은 없어요",
  today: "오늘",
  heartedPlaces: "하트 남긴 곳",
  pickAgain: "다시 고르기",
  change: "바꾸기",
  see: "보기",
  returnHearts: "다시 오셨네요, 하트는 그대로 있어요",
  returnBody: "행사장에 계시면 가까운 부스 이름으로 지금 어디쯤인지 같이 찾아 볼게요.",
  whereNow: "지금 어디인지 알려 주기",
  noThanks: "괜찮아요",
  reaskTitle: "오늘 볼 곳을 같이 골라 볼까요?",
  reaskBody: "사진 두 장만 고르면 돼요. 지도는 그대로 있어요.",
  pickNow: "골라 볼게요",
  // UI 8-04 ~ 8-08 로미가 고른 곳(K-C, 목록에만). iOS V1Copy+Phase3과 같은 글.
  /** 8-04 머리. Figma "선물을 사러 친구와 오셨다고 해서 골라 봤어요" — 웹 답은 고르신 사진뿐이라 사진으로 말한다. */
  picksHead: "고르신 사진으로 골라 봤어요",
  picksSection: "로미가 골라 봤어요",
  changeAnswer: "답 바꾸기",
  morePicks: "고른 곳 더 보기",
  /** 8-06 */
  picksListOnly: "제가 고른 곳은 목록에 담아 뒀어요",
  picksListOnlyBody: "지도에는 하트 남긴 곳만 보여요.",
  /** 하트가 하나도 없을 때(37-B: 남긴 게 없으면 하트 얘기를 빼요) */
  picksListOnlyBodyNoHearts: "지도에서 켜면 고른 곳이 밝게 보여요.",
  /** 8-07 */
  picksOnMap: "제가 고른 곳을 지도에 켰어요",
  picksOnMapBody: "밝은 곳 중 하트가 없는 곳이에요. 오늘만 켜 둘게요.",
  picksOnMapBodyNoHearts: "밝은 곳이 제가 고른 곳이에요. 오늘만 켜 둘게요.",
  listView: "목록으로 보기",
  turnOnMap: "지도에 켜기",
  turnOff: "끄기",
  // UI 10
  opensOn: (md: string) => `${md}에 열려요`,
  prefairLine: "아직 열리기 전이에요, 미리 둘러봐요",
  prefairSheetBody: (md: string) => `${md}에 열려요. 남기신 하트는 제가 기억하고 있어요.`,
  // UI 11
  endedOn: (md: string) => `${md}에 끝났어요`,
  howWas: (name: string) => `‘${name}’, 어떠셨어요?`,
  visitedBefore: (place: string) => `${place},\n지난번에 다녀오신 곳이에요`,
  visitedBeforeNoPlace: "지난번에 다녀오신 곳이에요",
  thanksLeft: "남겨 주셔서 고마워요",
  seeInMyPage: "마이페이지에서 다시 볼 수 있어요",
  close: "닫기",
} as const;

/** "2026-12-11" → "12월 11일". 시간대를 타지 않게 문자열로만 읽는다. */
export function monthDayKo(iso: string): string {
  const [, m, d] = iso.slice(0, 10).split("-").map(Number);
  return `${m}월 ${d}일`;
}
