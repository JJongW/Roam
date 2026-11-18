// UI v1 화면 문구 — 웹 v2 화면이 쓰는 말을 한 자리에 모은다.
//
// iOS `RoamKit/Features/AppShell/V1Copy.swift`(Roam-ios dev)와 같은 문장이다. 같은 화면은
// 같은 말을 한다. 화면 설계서(11-17): "화면 문구는 전부 자리표시예요. UX 라이팅은 나중에
// 한꺼번에 해요." 그래서 화면 코드에 흩지 않는다.
// 화자: romi = 로미가 하는 말, system = 서비스가 알리는 사실, label = 버튼, 칩 같은 짧은 라벨.
// 전부 해요체 존댓말, 가운뎃점 없음, "전시" 없음, 하트(찜, 좋아요 아님). 브랜드 규칙 §1, §5.

export const romi = {
  /** 3-01 "A홀이에요, 같이 둘러봐요" */
  inHall: (hall: string) => `${hall}이에요, 같이 둘러봐요`,
  /** 홀 이름을 모를 때 */
  lookAround: "같이 둘러봐요",
  /** 10-01 열리기 전 */
  prefairLine: "아직 열리기 전이에요, 미리 둘러봐요",
} as const;

export const system = {
  /** 3-03 */
  mapLoading: "지도를 불러오고 있어요",
  boothLoading: "부스 정보를 불러오고 있어요",
  noFloorplanTitle: "이 박람회는 아직 배치도가 없어요",
  noFloorplanBody: "배치도가 나오면 여기에 지도가 생겨요",
  /** 3-04 "2곳 있어요" */
  searchCount: (n: number) => `${n}곳 있어요`,
  /** 3-06 */
  searchEmptyTitle: (q: string) => `‘${q}’, 찾은 부스가 없어요`,
  searchEmptyBody: "부스 이름이나 브랜드 이름으로 찾을 수 있어요.",
  /** 4-06. "주최 측에서 받은"이라고 쓰지 않는다(11-17 Ted). */
  nameAndLocationOnly: "지금은 부스 이름과 위치만 나와 있어요.",
  /** 5-08 */
  heartRemoved: (name: string) => `‘${name}’ 하트를 뺐어요`,
  heartLeft: "하트를 남겼어요",
  /** 5-10 */
  heartSaveFailed: "하트를 남기지 못했어요",
  /** 6-06 */
  visitRemoved: (name: string, hadVerdict: boolean) =>
    hadVerdict
      ? `‘${name}’, 다녀온 곳에서 뺐어요. 남긴 평가도 함께 빠졌어요.`
      : `‘${name}’, 다녀온 곳에서 뺐어요.`,
  /** 5-02 로그인 제안(웹은 계정 로그인 화면으로) */
  loginPrompt: "하트는 이 기기에 남아요. 로그인하면 계정에도 남아요.",
} as const;

export const label = {
  searchPlaceholder: "부스나 브랜드 이름으로 찾기",
  clearSearch: "검색어 지우기",
  detail: "자세히",
  visited: "다녀왔어요",
  whole: "전체",
  entrance: "출입구",
  brandIntro: "브랜드 소개",
  location: "위치",
  showOnMap: "지도에서 보기",
  goods: "파는 것",
  instagram: "인스타그램",
  website: "브랜드 사이트",
  open: "열기",
  back: "뒤로",
  close: "닫기",
  heart: "하트",
  undo: "되돌리기",
  login: "로그인",
  photo: "부스 사진",
  zoomIn: "지도 확대",
  zoomOut: "지도 축소",
  wholeView: "전체 보기",
  hallSwitch: "홀 바꾸기",
  /** "A홀 A13" */
  hallNumber: (hall?: string | null, code?: string | null) =>
    [hall, code].filter(Boolean).join(" "),
} as const;

/** 편의시설 칩(3-01). 서버에 종류 칸이 없어(설계서 D9) 이름으로 가른다. iOS와 같은 여섯. */
export const AMENITIES = [
  { id: "toilet", title: "화장실", match: /화장실|toilet|restroom|wc/i },
  { id: "restaurant", title: "식당", match: /식당|푸드|food|restaurant/i },
  { id: "cafe", title: "카페", match: /카페|커피|cafe|coffee|라운지|lounge/i },
  { id: "entrance", title: "출입구", match: /출입구|입구|출구|entrance|exit|gate/i },
  { id: "storage", title: "물품 보관", match: /물품\s*보관|보관소|cloak|locker/i },
  { id: "info", title: "안내 데스크", match: /안내|인포|info/i },
] as const;
export type AmenityId = (typeof AMENITIES)[number]["id"];
