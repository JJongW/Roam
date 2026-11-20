// 홈(UI 2, 20), 박람회 전체(20-02), 끝난 박람회 입구(UI 11)의 사용자 문구. iOS V1Copy와 같은 글이다.
// 브랜드 규칙: 해요체 존댓말, "전시" 없음, 가운뎃점 없음, 라벨은 명사 끝 허용(§5).
// v1.ts는 다른 화면 작업이 같이 고치는 파일이라 이 화면 묶음 문구는 여기에 둔다.

export const homeCopy = {
  /** 20-00 흐린 줄 라벨. "진행 예정"은 Ted의 말(11-20). */
  notOpen: "진행 예정",
  notOpenA11y: (name: string) => `${name}, 진행 예정`,
  openNow: "지금 열려 있어요",
  comingSoon: "곧 열려요",
  ended: "끝났어요",
  allFairs: "박람회 전체 보기",
  fairsTitle: "박람회 전체",
  noOpenFairsTitle: "지금 열린 박람회가 없어요",
  noOpenFairsBody: "곧 열리는 박람회는 아래에서 볼 수 있어요.",
  noFairsAtAll: "곧 열릴 박람회가 정해지면 여기에 나와요.",
  homeFailed: "박람회 목록을 불러오지 못했어요",
  homeFailedBody: "잠시 뒤에 다시 열어 주세요.",
  /** 2-05 하트 남긴 브랜드 줄 */
  heartedBrandLine: (names: string) => `하트 남긴 브랜드: ${names}`,
  heartedFairsTitle: "하트 남긴 브랜드가 나오는 박람회",
  heartedBrands: "하트 남긴 브랜드",
  /** 11-01 H-B */
  visitedLastWeek: "다녀오신 박람회",
  /** 11-03 박람회 전체의 끝난 묶음(H-C) */
  fairsWithLeft: "남기신 게 있는 박람회",
  fairsOther: "그 밖의 지난 박람회",
  /** 11-08 M3, 11-10 M6 */
  howWas: (fair: string) => `‘${fair}’, 어떠셨어요?`,
  pickRemembered: "다녀오신 곳 중 기억나는 곳만 골라도 돼요.",
  leaveVerdict: "평가 남기기",
  later: "나중에 할게요",
  thanksLeft: "남겨 주셔서 고마워요",
  seeInMyPage: "마이페이지에서 다시 볼 수 있어요",
  done: "닫기",
  /** UI 16 오프라인 띠 */
  offlineMap: "오프라인이에요. 이미 불러온 지도는 계속 볼 수 있어요",
  offlineHome: "오프라인이에요. 지금 화면은 계속 볼 수 있어요",
} as const;
