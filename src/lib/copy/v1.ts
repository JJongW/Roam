// UI v1 화면 문구 — 웹 v2 화면이 쓰는 말을 한 자리에 모은다.
//
// iOS `RoamKit/Features/AppShell/V1Copy.swift`(Roam-ios dev)와 같은 문장이다. 같은 화면은
// 같은 말을 한다. 화면 설계서(11-17): "화면 문구는 전부 자리표시예요. UX 라이팅은 나중에
// 한꺼번에 해요." 그래서 화면 코드에 흩지 않는다.
// 화자: romi = 로미가 하는 말, system = 서비스가 알리는 사실, label = 버튼, 칩 같은 짧은 라벨.
// 전부 해요체 존댓말, 가운뎃점 없음, "전시" 없음, 하트(찜, 좋아요 아님). 브랜드 규칙 §1, §5.
// 마침표: 제목, 라벨, 한 줄 상태 줄(불러오는 중, 요약 줄)은 찍지 않는다. 스낵바와 본문처럼 완결된 문장을
// 알리는 글은 찍는다(2026-11-18 브랜드 검토).
// 기능이 아직 없는 것은 약속하지 않는다(브랜드 규칙 §4 "확인되지 않았으면 된다고 약속하지 않는다").

import { iyeyo } from "./josa";

export const romi = {
  /** 3-01 "A홀이에요, 같이 둘러봐요" */
  inHall: (hall: string) => `${iyeyo(hall)}, 같이 둘러봐요`,
  /** 홀 이름을 모를 때 */
  lookAround: "같이 둘러봐요",
  /** 6-03 다녀왔어요 직후. 평가를 묻지 않고 남긴 것을 기억한다고만 말한다(로미는 동행자). */
  visitRemembered: (name: string) => `‘${name}’, 다녀온 곳으로 기억해 둘게요`,
  visitLaterNote: "어떠셨는지는 나중에 남기셔도 돼요.",
  /** 6-09 다녀온 뒤 상세 위 띠 */
  howWasIt: (name: string) => `‘${name}’, 어떠셨어요?`,
} as const;

export const system = {
  /** 3-03 */
  mapLoading: "지도를 불러오고 있어요",
  boothLoading: "부스 정보를 불러오고 있어요",
  noFloorplanTitle: "이 박람회는 아직 배치도가 없어요",
  /** 3-04 "2곳 있어요" */
  searchCount: (n: number) => `${n}곳 있어요`,
  /** 3-06 */
  searchEmptyTitle: (q: string) => `‘${q}’, 찾은 부스가 없어요`,
  searchEmptyBody: "부스 이름이나 브랜드 이름으로 찾을 수 있어요.",
  /** 4-06. "주최 측에서 받은"이라고 쓰지 않는다(11-17 Ted). */
  nameAndLocationOnly: "부스 이름과 위치만 나와 있어요.",
  /** 5-08 */
  heartRemoved: (name: string) => `‘${name}’ 하트를 뺐어요.`,
  heartLeft: "하트를 남겼어요",
  /** 6-06 */
  visitRemoved: (name: string, hadVerdict: boolean) =>
    hadVerdict
      ? `‘${name}’, 다녀온 곳에서 뺐어요. 남긴 평가도 함께 빠졌어요.`
      : `‘${name}’, 다녀온 곳에서 뺐어요.`,
  /** 6-05 남기신 것 */
  visitedAtTime: (time: string) => `${time}에 다녀왔어요`,
  visitedPlain: "다녀왔어요",
  /** 6-08 */
  memoCleared: (name: string) => `‘${name}’ 메모를 지웠어요.`,
  /** 6-10 */
  visitedSummary: (fairs: number, booths: number) =>
    `박람회 ${fairs}곳에서 부스 ${booths}곳을 다녀왔어요`,
  /** "11월 2일, 코엑스 C홀" */
  visitedOnDay: (day: string, place?: string) =>
    [day, place].filter(Boolean).join(", "),
  visitedEmptyTitle: "아직 다녀온 곳이 없어요",
  visitedEmptyBody: "부스 카드에서 ‘다녀왔어요’를 누르면 여기에 모여요.",
  visitedLoading: "다녀온 곳을 불러오고 있어요",
  /** 이벤트(v1 상세에서 옮김) */
  eventStandingOp: "상시 운영",
  eventSoon: "알림을 받기로 한 이벤트가 곧 시작해요.",
  /** 이 탭이 열려 있을 때만 울리는 브라우저 알림이라 그만큼만 약속한다(lib/push/notify.ts). */
  eventReminded: "이 창을 열어 두시면 시작 10분 전에 알려 드려요.",
  eventRemindFailed: "이 이벤트는 알림을 맞출 수 없어요.",
  eventNoNotification: "이 브라우저는 알림을 받을 수 없어요.",
  eventNeedPermission: "알림을 받으려면 브라우저에서 알림을 허용해 주세요.",
  eventLive: "진행 중",
  /** 남은 수가 아니라 주최가 적은 준비 수량이다(받아 갈 때 줄지 않는다). */
  welcomeKitPrepared: (n: number) => `${n}개 준비`,
  /** 5-02 로그인 제안. 웹 저장은 브라우저마다라 "이 브라우저". 로그인하면 기기 기록(하트, 다녀왔어요)을
   *  계정으로 올린다(stores/auth.ts syncPendingReactions). */
  loginPrompt: "하트는 이 브라우저에 남아요. 로그인하시면 계정에도 남아요.",
} as const;

export const label = {
  searchPlaceholder: "부스나 브랜드 이름으로 찾기",
  clearSearch: "검색어 지우기",
  detail: "자세히",
  visited: "다녀왔어요",
  whole: "전체",
  brandIntro: "브랜드 소개",
  location: "위치",
  showOnMap: "지도에서 보기",
  /** 품목과 체험이 섞인 키워드라 "파는 것"이 아니다 */
  goods: "만나 볼 수 있는 것",
  instagram: "인스타그램",
  website: "브랜드 사이트",
  open: "열기",
  back: "뒤로",
  close: "닫기",
  heartAdd: "하트 남기기",
  heartRemove: "하트 빼기",
  undo: "되돌리기",
  login: "로그인",
  photo: "부스 사진",
  zoomIn: "지도 확대",
  zoomOut: "지도 축소",
  hallSwitch: "홀 바꾸기",
  /** 6 평가 칩. 판단 어휘(02_voice-tone §5) */
  verdict: { good: "좋았어요", ok: "그저 그랬어요", bad: "아니었어요" },
  later: "나중에 할게요",
  leftSection: "남기신 것",
  memoAdd: "메모 한 줄 남기기",
  memoField: "메모 한 줄",
  memoEdit: "메모 쓰기",
  todayVisited: "오늘 다녀온 곳",
  /** 6-10 목록 제목. "다녀왔어요"는 버튼에만 쓴다. */
  visitedList: "다녀온 기록",
  events: "이벤트",
  standing: "상시",
  otherFairs: "다른 박람회에서 만난 곳",
  welcomeKit: "웰컴 키트",
  eventRemind: "이벤트 알림 받기",
  togetherBooths: (n: number) => `함께 나온 브랜드 ${n}곳`,
  /** "A홀 A13" */
  hallNumber: (hall?: string | null, code?: string | null) =>
    [hall, code].filter(Boolean).join(" "),
} as const;

/** 메모 한 줄 길이(UI/입력 줄, 6-04). 서버는 300자까지 받지만 화면은 50자(설계서 §0-5). */
export const MEMO_MAX = 50;

/** "오후 2시 20분" */
export function clockKo(iso: string): string {
  const d = new Date(iso);
  const h = d.getHours();
  const m = d.getMinutes();
  const ap = h < 12 ? "오전" : "오후";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${ap} ${h12}시${m ? ` ${m}분` : ""}`;
}

/** "11월 2일" */
export function dayKo(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

/** 편의시설 칩(3-01). 서버에 종류 칸이 없어(설계서 D9) 이름으로 가른다. iOS와 같은 여섯. */
export const AMENITIES = [
  { id: "toilet", title: "화장실", match: /화장실|toilet|restroom|wc/i },
  { id: "restaurant", title: "식당", match: /식당|푸드|food|restaurant/i },
  { id: "cafe", title: "카페", match: /카페|커피|cafe|coffee|라운지|lounge/i },
  {
    id: "entrance",
    title: "출입구",
    match: /출입구|입구|출구|entrance|exit|gate/i,
  },
  {
    id: "storage",
    title: "물품 보관",
    match: /물품\s*보관|보관소|cloak|locker/i,
  },
  { id: "info", title: "안내 데스크", match: /안내|인포|info/i },
] as const;
export type AmenityId = (typeof AMENITIES)[number]["id"];
