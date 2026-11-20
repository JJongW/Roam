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

import { euroRo, iGa, iyeyo } from "./josa";

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
  // UI 7 로미 시트(R-A). iOS V1Copy.Romi와 같은 문장. 웹은 하트를 남긴 시각이 없어 "오늘 남기신 것"을
  // 가를 수 없다. 그래서 열린 날에도 "남기신 것"이라고만 한다(iOS sheetBodyEnded와 같은 문장).
  sheetTitle: "무엇을 같이 할까요?",
  sheetBody: "남기신 것은 제가 기억하고 있어요.",
  sheetBodyEmpty: "궁금한 건 물어보시고, 편하게 둘러보셔도 돼요.",
  /** 지금 어디(9-02와 같은 묻기, 추적 없음) */
  whereAsk: "지금 가까이 보이는 부스 이름을 알려 주세요",
  whereBody: "이름을 찾으면 지도에서 그 자리를 보여 드릴게요.",
  whereFound: (name: string, place: string) =>
    place ? `‘${name}’ 근처시군요. ${iyeyo(place)}` : `‘${name}’ 근처시군요`,
  whereNotFound: "그 이름의 부스를 찾지 못했어요",
  /** 7-05 장소 답(편의시설). 이 박람회 지도에 있는 것만 칩으로 묻는다. */
  facilityMarked: (facility: string) => `${facility} 자리를 지도에 표시해 뒀어요`,
  // UI 9 길 안내(11-11: 선은 한 번, 위치는 근처 부스 이름으로 묻기, 다음 한 곳씩)
  /** 9-01 */
  routeWhereTo: "어디로 가실까요?",
  /** 9-02 */
  routeNearbyAsk: "근처에 어떤 부스가 보이세요?",
  /** 9-03. 배치도에 축척이 없어 걸리는 시간은 말하지 않는다(iOS와 같음). */
  routeDrawn: (name: string) => `‘${name}’까지 가는 길을 그렸어요`,
  routeFromEntrance: (name: string) => `출입구에서 ‘${name}’까지 가는 길을 그렸어요`,
  routeOnlyPlace: (name: string) => `‘${name}’ 자리를 지도에 표시해 뒀어요`,
  routeOnTheWay: (name: string) => `가는 길에 하트 남긴 ‘${name}’도 있어요.`,
  /** 9-04 */
  routeDirect: (name: string) => `네, ‘${name}’까지 바로 가요`,
  routeReaskHint: "헷갈리면 근처 부스 이름으로 다시 찾아 드릴게요.",
  /** 9-05 */
  routeArriveAsk: "도착하시면 알려 주세요. 그냥 두셔도 괜찮아요.",
  /** 도착 뒤 다음 한 곳. 권하지 않고 묻기만 한다. */
  routeNextAsk: (name: string) => `다음은 ‘${name}’${euroRo(name)} 가 볼까요?`,
  routeNextSkip: "여기서 더 둘러보셔도 괜찮아요.",
  // UI 12 회고. 웹은 글을 이 브라우저에만 둔다(lib/recap/visit-memory.ts).
  /** 12-02 */
  recapAsk: "오늘 어떠셨어요?",
  recapKeep: "적어 주신 말은 고치지 않고 이 브라우저에 남겨 둘게요.",
  /** 12-03 */
  recapSaved: "남겨 주신 말이에요",
  // UI 8 둘러보기(L-B 분류 먼저, 11-11). 부스 목록 머리의 로미 말 상자.
  /** 8-01 "A홀부터 D홀까지 부스 597곳이 있어요.\n어떤 분류부터 볼까요?" 홀이 하나면 "A홀에", 모르면 홀 없이. */
  boothListIntro: (halls: string[], n: number) => {
    const where =
      halls.length > 1
        ? `${halls[0]}부터 ${halls[halls.length - 1]}까지 `
        : halls.length === 1
          ? `${halls[0]}에 `
          : "";
    return `${where}부스 ${n}곳이 있어요.\n어떤 분류부터 볼까요?`;
  },
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
  // UI 5-04~5-07 로그인. iOS V1Copy(loginSheetTitle 등)와 같은 자리. 웹은 Google 로그인이고 "이 휴대폰" 대신 "이 브라우저".
  // 로그인하면 이 브라우저의 하트와 다녀온 곳을 계정으로 올린다(stores/auth.ts syncPendingReactions). 그래서 "계정에도 남아요"는 사실이다.
  /** 5-04 */
  loginSheetTitle: "로그인하시면 남긴 하트가\n계정에도 남아요",
  loginSheetBody: "로그인하지 않아도 둘러보고 하트를 남길 수 있어요.",
  /** 5-05 로그인하고 돌아온 화면의 알림 */
  loggedIn: "로그인했어요.\n남긴 하트는 그대로 있어요.",
  /** 5-07. 실패 이유는 보여 주지 않는다(설계서 5-07). 서비스가 알리는 말이라 로미 없음. */
  loginFailedTitle: "로그인을 마치지 못했어요",
  loginFailedBody: "하트는 이 브라우저에 그대로 있어요.\n잠시 뒤에 다시 해 보셔도 돼요.",
  // UI 19 브랜드 하트(A안, 11-19). iOS V1Copy(Roam-ios #193)와 같은 자리. 웹에서 거짓이 되는 말만 바꿨다
  // (11-20 브랜드 검토). 웹은 브라우저 푸시를 보내지 않는다(브랜드 알림은 iOS 푸시, 그리고 웹과 iOS의
  // 알림함 줄로만 간다). 그래서 웹은 "알려 드려요" 대신 확인된 사실(계정에 남는다)만 말한다(브랜드 규칙 §4).
  /** 19-A1 브랜드 줄 설명, 로그인한 분 */
  brandRowLoggedIn: "브랜드 하트는 계정에 남아요",
  /** 19-A3 브랜드 줄 설명, 로그인 안 한 분 */
  brandRowLoggedOut: "로그인하시면 브랜드 하트가 계정에도 남아요",
  /** 19-A2 */
  brandHeartLeft: (name: string) => `‘${name}’ 브랜드 하트를 남겼어요.`,
  /** 19-A3 로그인 제안(5-02와 같은 띠). 로그인하면 stores/auth.ts가 syncBrandHearts로 계정에 올린다. */
  brandHeartLoginPrompt: "브랜드 하트는 이 브라우저에 남아요.\n로그인하시면 계정에도 남아요.",
  /** 19-A4 */
  brandHeartRemoved: (name: string) => `‘${name}’ 브랜드 하트를 뺐어요.`,
  /** 19-A5 */
  brandHeartSaveFailed: "브랜드 하트를 남기지 못했어요.",
  // UI 7
  leftNothing: "하트나 다녀온 곳을 남기시면 여기에 모여요.",
  // UI 9
  /** 9-06 "A홀 A13 도착했어요, 천천히 둘러보세요" */
  arrivedLine: (place: string) => `${place} 도착했어요, 천천히 둘러보세요`,
  // UI 12
  /** "일러스트페어, 12월 4일" */
  recapMeta: (fair: string, day: string) => `${fair}, ${day}`,
  /** 12-04. 글은 계정에 올라가지 않는다(서버에 글 칸이 없다). 하트는 로그인하면 올라간다(stores/auth.ts). */
  recapDeviceOnly: "이 말은 이 브라우저에만 남아요.\n로그인하시면 하트는 계정에도 남아요.",
  // UI 18 알림함. iOS V1Copy(18-02, 18-03)와 같은 자리. 웹은 브라우저 푸시를 보내지 않는다(웹 푸시 키 없음).
  // 그래서 "알려 드리고"를 빼고 알림함에 남는다는 사실만 말한다(브랜드 규칙 §4).
  /** 18-02 덧붙임 */
  inboxFooter: "알림은 30일 동안 여기에 남아요. 누르면 그 부스나 박람회 지도로 가요.",
  /** 18-03. 브랜드 알림 잡은 하트를 남긴 계정마다 줄을 만들고, 기기가 없는 계정(웹만 쓰는 분)의 줄도
   *  no_device로 알림함에 보인다(lib/notifications/run-brand-appear.ts). 그래서 "여기에 남겨 둘게요"는 사실이다. */
  inboxEmptyTitle: "아직 받은 알림이 없어요",
  inboxEmptyBody: "하트 남긴 브랜드가 다음 박람회에 나오면 여기에 남겨 둘게요.",
  inboxFailed: "알림을 불러오지 못했어요",
  inboxLoading: "알림을 불러오고 있어요",
  // UI 14 마이페이지. iOS V1Copy+Phase3과 같은 자리. 웹은 "이 휴대폰" 대신 "이 브라우저"(기록이 브라우저에 남는다).
  /** 14-01 머리(로그인 전) */
  browsing: "둘러보는 중이에요",
  meLoading: "남기신 기록을 불러오고 있어요",
  /** 14-01, 14-03 로미 줄 첫 줄 */
  nextFair: (day: string, name: string) => `다음 박람회는 ${day} ${iyeyo(name)}.`,
  openNow: (name: string) => `${name}${iGa(name)} 지금 열려 있어요.`,
  myHeartsHere: "하트 남긴 곳이 있어요.",
  /** 14-01. 웹 하트는 로그인 전에는 이 브라우저(localStorage)에만 있다. */
  myHeartsBrowserOnly: "하트는 지금 이 브라우저에만 남아 있어요.",
  noNextFair: "곧 열릴 박람회가 정해지면 여기에 나와요.",
  /** 14-06 */
  emptyHearts: "부스에 하트를 남기면 박람회 지도에 켜져요.",
  emptyHeartsOpen: (name: string) =>
    `${name}${iGa(name)} 지금 열려 있어요. 같이 둘러볼까요?`,
  exampleHeartTitle: "하트를 남기면 이렇게 보여요",
  exampleHeartBody: "박람회마다 지도 한 장에 모여요",
  /** 14-05 "12월 4일 금요일부터 4일간, 코엑스 C홀이에요. 하트 남긴 곳이 지도에 켜져 있어요." */
  fairHeartsOn: (when: string, venue: string) =>
    `${when}, ${iyeyo(venue)}. 하트 남긴 곳이 지도에 켜져 있어요.`,
  /** 14-05에서 지도를 그릴 수 없을 때(배치도가 없거나 하트가 0곳) "지도에 켜져 있어요"를 빼고 때와 장소만 */
  fairWhere: (when: string, venue: string) => `${when}, ${iyeyo(venue)}.`,
  /** "12월 4일부터 4일간, 코엑스 C홀" */
  fairPeriod: (start: string, days: number, venue: string) =>
    days > 1 ? `${start}부터 ${days}일간, ${venue}` : `${start}, ${venue}`,
  from: (day: string) => `${day}부터`,
  until: (day: string) => `${day}까지`,
  /** 14-02 */
  heartListNote: "이 브라우저에 남긴 하트예요. 하트를 다시 누르면 빠져요.",
  /** 14-07, 14-10 */
  heartListNoteAccount: "하트를 다시 누르면 빠져요.",
  /** 14-04 맨 아래 */
  heartsApart: "하트와 다녀온 기록은 따로 남아요.\n다녀왔다고 하트가 생기지는 않아요.",
  /** 14-10 "홈테이블데코페어 2026, 12월 4일부터" */
  brandUpcoming: (fair: string, day: string) => `${fair}, ${day}부터`,
  brandHeartsEmpty: "아직 하트 남긴 브랜드가 없어요.",
  brandHeartsFailed: "브랜드 하트를 불러오지 못했어요",
  brandHeartsLoading: "브랜드 하트를 불러오고 있어요",
  /** 12-05(40-C) 그날 쓰신 말 아래 */
  writtenOn: (day: string) => `${day}에 쓰신 말`,
  // UI 15 설정
  loggedInWith: (provider: string) => `${provider}${euroRo(provider)} 로그인했어요`,
  profileNote: "로그아웃과 계정 삭제는 설정 맨 아래에 있어요.",
  nicknameHint: "12자까지 쓸 수 있어요. 마이페이지 맨 위에 보여요.",
  nicknameFull: "12자를 다 채웠어요.",
  nicknameTaken: "다른 분이 쓰고 있는 닉네임이에요. 다른 이름을 써 주세요.",
  nicknameInvalid: "한글, 영문, 숫자로 2자 이상 써 주세요.",
  nicknameFailed: "닉네임을 바꾸지 못했어요. 잠시 뒤에 다시 해 주세요.",
  /** 15-09 */
  logoutTitle: "로그아웃할까요?",
  logoutBody: "이 브라우저에서 로그인이 풀려요.",
  logoutDone: "로그아웃했어요",
  /** 15-11, 15-12, 15-13. 서버 DELETE /api/me가 계정 기록을 바로 지운다. */
  deleteBody: "계정을 지우면 계정에 남은\n하트, 다녀온 기록, 평가, 메모가 사라져요.",
  deleteWarn: "바로 지워지고 되돌릴 수 없어요.",
  deleteAsk: "계정을 지울까요?",
  deleteDone: "계정을 지웠어요",
  deleteFailed: "계정을 지우지 못했어요. 잠시 뒤에 다시 해 주세요.",
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
  /** 5-04 웹은 Google 로그인(iOS는 Apple) */
  googleLogin: "Google로 로그인",
  browseWithoutLogin: "로그인 없이 둘러보기",
  retry: "다시 시도",
  /** 19-A1 브랜드 줄 */
  brand: "브랜드",
  brandHeartPill: "이 브랜드 하트",
  brandHeartAdd: "브랜드 하트 남기기",
  brandHeartRemove: "브랜드 하트 빼기",
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
  /** 알림함 시각, 회고 날짜 */
  today: "오늘",
  yesterday: "어제",
  // UI 7 로미 시트
  romiSheet: "로미 시트 열기",
  leftItems: "남긴 것",
  heartedPlaces: "하트 남긴 곳",
  visitedPlaces: "다녀온 곳",
  ask: "물어보기",
  whereNow: "지금 어디인지 알려 주기",
  nearbyBoothName: "가까이 보이는 부스 이름",
  doneForToday: "오늘은 여기까지 할게요",
  /** "A홀 A13, 하트, 다녀왔어요, 메모" */
  kindHeart: "하트",
  kindMemo: "메모",
  andMore: (n: number) => ` 외 ${n}곳`,
  /** 7-01 칩 "'꽃잠' 가는 길" */
  routeTo: (name: string) => `‘${name}’ 가는 길`,
  askFacility: (facility: string) => `${facility} 어디예요?`,
  // UI 9
  route: "길 안내",
  dontKnow: "잘 모르겠어요",
  here: "여기예요",
  startFront: (name: string) => `${name} 앞`,
  entrance: "출입구",
  stopBy: "들렀다 갈게요",
  justGo: "그냥 갈게요",
  endGuide: "안내 끝내기",
  otherBoothFront: "다른 부스 앞이에요",
  arrived: "도착했어요",
  goTogether: "같이 가요",
  noThanks: "괜찮아요",
  // UI 12
  // UI 8 둘러보기
  browse: "둘러보기",
  boothList: "부스 목록",
  boothListOpen: "부스 목록 보기",
  boothListSub: "분류별로 볼 수 있어요",
  /** 8-01 머리 오른쪽 글자 버튼 */
  toMap: "지도로 보기",
  /** 분류가 없는 부스를 모은 줄(Figma 8-01 "그 밖") */
  otherCategory: "그 밖",
  /** 8-02 "96곳, 부스 번호 순이에요" */
  byNumber: (n: number) => `${n}곳, 부스 번호 순이에요`,
  recapPlaceholder: "떠오르는 대로 적어 주세요",
  leave: "남기기",
  placesStat: (n: number) => `${n}곳`,
  memoStat: (n: number) => `${n}개`,
  memo: "메모",
  // UI 18
  inbox: "알림함",
  /** 종의 점(읽어 주기). 숫자는 말하지 않는다(18-01A 점 하나). */
  inboxHasNew: "새 알림 있음",
  inboxThisWeek: "이번 주",
  inboxEarlier: "지난 알림",
  // UI 14 마이페이지
  myPage: "마이페이지",
  settings: "설정",
  seeAll: "전체 보기",
  seeMap: "지도 보기",
  upcomingFairs: "곧 열리는 박람회",
  heartsPill: (n: number) => `하트 ${n}곳`,
  example: "예시",
  step1: "부스를 눌러요",
  step2: "하트를 남겨요",
  step3: "여기에 모여요",
  ended: "끝났어요",
  expand: "펼치기",
  collapse: "접기",
  heartedBrands: "하트 남긴 브랜드",
  upcomingBrands: "곧 박람회에 나와요",
  unknownSchedule: "다음 일정은 아직 몰라요",
  fairsStat: (n: number) => `박람회 ${n}곳`,
  // UI 15 설정
  profile: "프로필",
  nickname: "닉네임",
  loginMethod: "로그인 방식",
  myRecords: "내 기록",
  info: "정보",
  privacy: "개인정보 처리방침",
  terms: "이용약관",
  account: "계정",
  logout: "로그아웃",
  deleteAccount: "계정 삭제",
  deleteAccountButton: "계정 지우기",
  delete: "지우기",
  cancel: "취소",
  done: "완료",
  disappears: "사라지는 것",
  goneHearts: "하트 남긴 부스와 브랜드",
  goneVisits: "다녀온 기록과 평가",
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
