// 웹의 이름 붙은 이벤트(화면 설계서 E 2-4). iOS와 같은 이름, 같은 수신구, 같은 묶음 모양.
//
// - 이름과 화면 id는 iOS `AnalyticsTaxonomy.swift`(Roam-ios dev)를 그대로 옮겼다. 겹치는
//   자리는 iOS 이름을 쓴다. 웹에만 있는 옛 이벤트(`view` 단건, `ui_click`)는 그대로 둔다.
// - POST /api/analytics/events 에 `{ platform: "web", anonId, sessionId, events }`로 보낸다.
//   서버(app-events.ts)가 위치, 글 원문 키를 한 번 더 지운다. 여기서도 글을 넣지 않는다.
// - 실패는 삼킨다. 기록이 화면을 막지 않는다.
// - anonId는 기기(브라우저) 단위 무작위 uuid다. 광고 식별자가 아니다(E 2-1 6번).

export const APP_EVENT_NAMES = [
  "app_open",
  "screen_view",
  "fair_open",
  "map_control",
  "map_load_result",
  "search_submit",
  "search_zero_result",
  "search_result_tap",
  "hall_switch",
  "booth_card_open",
  "booth_photo_swipe",
  "booth_show_on_map",
  "heart_add",
  "heart_remove",
  "heart_save_fail",
  // 브랜드 하트(UI 19 A, 측정 W-22). 이름은 iOS AnalyticsTaxonomy와 같다.
  "brand_heart_add",
  "brand_heart_remove",
  "brand_heart_undo",
  "login_prompt_shown",
  "login_prompt_tap",
  // UI 5-04~5-07 로그인 화면. 이름은 iOS AnalyticsTaxonomy와 같다.
  "login_skip",
  "login_complete",
  "login_fail",
  "visit_mark",
  "visit_unmark",
  "visit_undo",
  "verdict_set",
  "verdict_cleared",
  "memo_saved",
  "memo_cleared",
  "memo_undo",
  "visited_list_open",
  "visited_list_row_tap",
  "romi_sheet_open",
  "romi_row_tap",
  "route_start",
  // UI 8 둘러보기. 앞의 둘은 iOS AnalyticsTaxonomy와 같은 이름, 줄 누름은 설계서 B UI 8 이름.
  "booth_list_open",
  "booth_list_category_tap",
  "booth_list_row_tap",
  // UI 1 박람회 첫 진입, 10 열리기 전, 11 끝난 박람회 지도. 이름은 iOS AnalyticsTaxonomy와 같다.
  "onboarding_mood_shown",
  "onboarding_mood_pick",
  "onboarding_mood_skip",
  "onsite_question_answer",
  "onboarding_first_three_shown",
  // UI 24 Q2 A(11-25): 로미가 고른 곳 카드의 이름 줄을 눌러 미리보기 시트를 열었다. 속성 index(0부터). iOS와 같은 이름.
  "onboarding_first_pick_preview_open",
  "romi_pick_feedback",
  // UI 8-04~8-08 로미가 고른 곳(K-C). 이름은 iOS AnalyticsTaxonomy와 같다.
  "romi_pick_shown",
  "romi_pick_map_toggle",
  "onboarding_reask_shown",
  "onboarding_reask_answer",
  "prefair_view",
  "verdict_pick",
  "verdict_later",
  "verdict_all_done",
  // UI 9 길 안내, 12 회고, 18 알림함. 이름은 iOS AnalyticsTaxonomy와 같다.
  "nearby_answer",
  "route_line_drawn",
  "route_just_go",
  "booth_arrive",
  "recap_start",
  "recap_save",
  "recap_login_choice",
  "inbox_open",
  "inbox_item_open",
  // UI 14 마이페이지, 15 설정. 이름은 iOS AnalyticsTaxonomy와 같다.
  "heart_list_view",
  "heart_brand_view",
  "nickname_change_result",
  "logout",
  "account_delete",
  // UI 20 홈과 박람회 전체, 11 끝난 박람회 입구, 16 오프라인 띠. 이름은 iOS AnalyticsTaxonomy와 같다.
  "ended_fair_entry_shown",
  "ended_fair_entry_tap",
  "verdict_pick",
  "verdict_later",
  "verdict_all_done",
  "offline_band_shown",
] as const;
export type AppEventName = (typeof APP_EVENT_NAMES)[number];

/** Figma UI v1 화면 id(iOS `ScreenID`와 같은 값). */
export const SCREEN = {
  map: "UI 3-01",
  mapLoading: "UI 3-03",
  boothCard: "UI 4-01",
  boothDetail: "UI 4-02",
  photoViewer: "UI 4-03",
  loginSheet: "UI 5-04",
  heartUndo: "UI 5-08",
  visitRemembered: "UI 6-03",
  todayVisited: "UI 6-04",
  visitedList: "UI 6-10",
  brandRow: "UI 19-A1",
  brandHeartLeft: "UI 19-A2",
  brandHeartLoginPrompt: "UI 19-A3",
  brandHeartUndo: "UI 19-A4",
  brandHeartFailed: "UI 19-A5",
  romiSheet: "UI 7-01",
  boothList: "UI 8-01",
  boothListCategory: "UI 8-02",
  picksList: "UI 8-04",
  picksLine: "UI 8-06",
  picksOnMap: "UI 8-07",
  picksCard: "UI 8-08",
  moodSheet: "UI 1-02",
  onsiteAsk: "UI 1-04",
  firstPicks: "UI 1-05",
  known: "UI 1-07",
  returnLine: "UI 1-09",
  reask: "UI 1-10",
  prefair: "UI 10-01",
  prefairSheet: "UI 10-03",
  endedMap: "UI 11-04",
  verdictAsk: "UI 11-05",
  verdictThanks: "UI 11-06",
  endedMapEmpty: "UI 11-07",
  romiLeft: "UI 7-03",
  routeTarget: "UI 9-01",
  routeNearby: "UI 9-02",
  routeDrawn: "UI 9-03",
  routeArrived: "UI 9-06",
  recapWrite: "UI 12-02",
  recapSaved: "UI 12-03",
  recapLoggedOut: "UI 12-04",
  inbox: "UI 18-02",
  inboxEmpty: "UI 18-03",
  myPage: "UI 14-01",
  heartList: "UI 14-02",
  heartFair: "UI 14-05",
  heartEmpty: "UI 14-06",
  heartBrands: "UI 14-10",
  settings: "UI 15-01",
  profile: "UI 15-02",
  nickname: "UI 15-03",
  logout: "UI 15-09",
  deleteAccount: "UI 15-11",
  home: "UI 20-01",
  homeNoOpen: "UI 2-07",
  homeLoggedIn: "UI 2-05",
  fairsAll: "UI 20-02",
  endedHome: "UI 11-01",
  homeVerdict: "UI 11-08",
  myVerdict: "UI 11-10",
  loginPromptTop: "UI 5-03",
  offlineMap: "UI 16-01",
  offlineHome: "UI 16-04",
} as const;
export type ScreenId = (typeof SCREEN)[keyof typeof SCREEN];

/** 글 길이 구간(iOS `LengthBucket`과 같은 경계). 글 원문 대신 이것만 보낸다(E 2-1). */
export function lenBucket(n: number): string {
  if (n <= 0) return "0";
  if (n <= 5) return "1-5";
  if (n <= 20) return "6-20";
  if (n <= 100) return "21-100";
  return "100+";
}

type PropValue = string | number | boolean | null | (string | number)[];

export interface AppEvent {
  eventId: string;
  name: AppEventName;
  clientTs: string;
  screenId?: ScreenId;
  exhibitionSlug?: string;
  boothId?: string;
  props?: Record<string, PropValue>;
}

const ANON_KEY = "roam.device.id";
const SESSION_KEY = "roam.session.id";
const FLUSH_MS = 1500;

const queue: AppEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let listening = false;

function uuid(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  // 아주 옛 브라우저용. 형식만 uuid v4.
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (Number(c) ^ (Math.random() * 16) >> (Number(c) / 4)).toString(16),
  );
}

function stored(storage: Storage | undefined, key: string): string {
  try {
    const hit = storage?.getItem(key);
    if (hit) return hit;
    const id = uuid();
    storage?.setItem(key, id);
    return id;
  } catch {
    return uuid();
  }
}

/** 묶음 본문. 테스트가 모양을 확인할 수 있게 따로 둔다. */
export function batchBody(events: AppEvent[], ids: { anonId: string; sessionId: string }) {
  return { platform: "web" as const, anonId: ids.anonId, sessionId: ids.sessionId, events };
}

export function flushAppEvents(): void {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (queue.length === 0 || typeof window === "undefined") return;
  const events = queue.splice(0, 100);
  const body = batchBody(events, {
    anonId: stored(window.localStorage, ANON_KEY),
    sessionId: stored(window.sessionStorage, SESSION_KEY),
  });
  void fetch("/api/analytics/events", {
    method: "POST",
    // 지도에서 상세로 넘어가는 순간에 쌓인 것도 살아남게.
    keepalive: true,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }).catch(() => {});
  if (queue.length) flushAppEvents();
}

/** 이벤트 하나를 쌓는다. 1.5초 안에 모아서 한 번에 보내고, 탭을 떠날 때 바로 보낸다. */
export function track(
  name: AppEventName,
  opts: {
    screen?: ScreenId;
    exhibitionSlug?: string;
    boothId?: string;
    props?: Record<string, PropValue>;
  } = {},
): void {
  if (typeof window === "undefined") return;
  queue.push({
    eventId: uuid(),
    name,
    clientTs: new Date().toISOString(),
    screenId: opts.screen,
    exhibitionSlug: opts.exhibitionSlug,
    boothId: opts.boothId,
    props: opts.props,
  });
  if (!listening) {
    listening = true;
    const onHide = () => {
      if (document.visibilityState === "hidden") flushAppEvents();
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flushAppEvents);
  }
  if (!timer) timer = setTimeout(flushAppEvents, FLUSH_MS);
}
