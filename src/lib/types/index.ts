// ---------------------------------------------------------------------------
// Roam domain types. Mirrors .claude/plans/erd.md. Single source for the app.
// ---------------------------------------------------------------------------

export const VISIT_PURPOSES = [
  "purchase",
  "information",
  "networking",
  "experience",
] as const;
export type VisitPurpose = (typeof VISIT_PURPOSES)[number];

export const MOVEMENT_PREFERENCES = [
  "shortest",
  "balanced",
  "thorough",
] as const;
export type MovementPreference = (typeof MOVEMENT_PREFERENCES)[number];

export const COMPANION_TYPES = [
  "alone",
  "partner",
  "family",
  "group",
  "business",
] as const;
export type CompanionType = (typeof COMPANION_TYPES)[number];

/** Visitor age group — collected in onboarding (alongside interests + purpose). */
export const AGE_GROUPS = ["10s", "20s", "30s", "40s", "50s+"] as const;
export type AgeGroup = (typeof AGE_GROUPS)[number];

export const ROUTE_STATUSES = ["active", "completed", "abandoned"] as const;
export type RouteStatus = (typeof ROUTE_STATUSES)[number];

export const BOOKMARK_TARGETS = ["booth", "event"] as const;
export type BookmarkTarget = (typeof BOOKMARK_TARGETS)[number];

export const ANALYTICS_TYPES = [
  "view",
  "dwell",
  "route_start",
  "route_complete",
  "booth_arrive",
  "event_bookmark",
  "ui_click",
] as const;
/** "app"은 이름 붙은 앱 이벤트(0066)용. 웹 단건 입력(analyticsEventInputSchema)은 받지 않는다. */
export type AnalyticsType = (typeof ANALYTICS_TYPES)[number] | "app";

export interface Point {
  x: number;
  y: number;
}

export interface ExhibitionTips {
  transportation?: string;
  parking?: string;
  ticket?: string;
  guide?: string;
}

export interface Exhibition {
  id: string;
  slug: string;
  name: string;
  venue: string;
  description: string;
  startDate: string; // ISO date
  endDate: string;
  coverImageUrl?: string;
  mapImageUrl?: string;
  mapWidth: number;
  mapHeight: number;
  tips: ExhibitionTips;
  organizerId?: string;
  createdAt: string;
}

export interface Hall {
  id: string;
  exhibitionId: string;
  name: string;
  floor: number;
  sort: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  color: string;
  icon: string; // lucide icon name
}

/** 부스 종류. facility는 지도에만 있고 추천·피드·스크린샷 매칭에서 빠진다 —
 *  종류가 늘면 그 제외 규칙(engine/scoring·feed)을 같이 봐야 한다. */
export const BOOTH_KINDS = ["exhibitor", "facility"] as const;
export type BoothKind = (typeof BOOTH_KINDS)[number];

export interface Booth {
  id: string;
  exhibitionId: string;
  hallId: string;
  categoryId: string;
  /** Stand number on the printed floorplan (e.g. "A06"). Optional. */
  code?: string;
  /** "exhibitor" (default) or "facility" — lounge/stage/aux areas that are on
   *  the map but aren't participating publishers, so they stay out of
   *  recommendation and swipe. */
  kind?: BoothKind;
  name: string;
  company: string;
  /** 대표 브랜드(exhibitor.id). 부스 API 응답에만 붙인다(lib/booth/brand-ids.ts) — 저장소
   *  읽기는 채우지 않는다. 브랜드 하트, 브랜드 알림, 다음 박람회 잇기의 열쇠. 배정 전이면 없음. */
  exhibitorId?: string;
  /** 대표 참가(exhibition_participant.id). 위와 같다. */
  participantId?: string;
  /** Co-located exhibitors sharing this booth code (e.g. a country pavilion or
   *  a shared indie stand). Surfaced in search so any of
   *  them resolves to this booth, even though the map shows one name. */
  aliases?: string[];
  description: string;
  longDescription: string;
  images: string[];
  logoUrl?: string;
  /** Outbound links surfaced on the booth detail + map (feature: detail from map). */
  instagramUrl?: string;
  websiteUrl?: string;
  tags: string[]; // category slugs (분야 축) — 표시/필터
  /** 관람 가치 태그(강도 0..1). 스코어링·L4 브레인·피드의 가치 축(분야와 병행). */
  valueTags?: BoothValueTag[];
  x: number;
  y: number;
  /** 부스 크기로 추정한 체류 시간(분). floorplan 면적에서 런타임 주입(small 3 /
   *  large 10). 동선 시간예산·소요시간 계산에 쓰인다. 없으면 BASE_DWELL_MINUTES. */
  dwellMinutes?: number;
  popularity: number; // 0..100
  /** 수동 주입한 추가정보(굿즈·테마·팁). booth_enrichment 테이블에 보관하고
   *  부스에 붙여 노출한다. themeTags(=카테고리 slug)는 seed 시 tags에도 병합돼
   *  추천 스코어링에 LLM 없이 반영된다. */
  enrichment?: BoothEnrichment;
  createdAt: string;
}

/** enrichment 데이터 신뢰도. grounding.ts가 같은 목록을 따로 들고 있었다. */
export const ENRICHMENT_CONFIDENCES = ["low", "medium", "high"] as const;
export type EnrichmentConfidence = (typeof ENRICHMENT_CONFIDENCES)[number];

/**
 * 운영자/사용자가 인스타·현장에서 보고 손으로 옮겨 적은 부스 추가정보.
 * 추출(자연어→태그)은 주입 시점 1회. 추천 때는 저장된 값만 읽어 즉시 사용.
 */
export interface BoothEnrichment {
  /** 굿즈·상품 키워드(자유어, 한국어). 상세 표시 + 검색 + 추론 어휘. */
  goodsKeywords: string[];
  /** 테마 태그 — 카테고리 slug. seed 시 Booth.tags에 병합돼 스코어링에 반영. */
  themeTags: string[];
  /** 한 줄 요약. */
  summary?: string;
  /** 대기·위치·추천 시간대 등 현장 팁. */
  tips?: string;
  /** 출처(인스타/웹 URL). */
  sourceUrl?: string;
  /** 관람 가치 태그(수동 주입, 강도). 있으면 파생보다 우선. */
  valueTags?: BoothValueTag[];
  /** Roam식 한 줄 해석 — 공식 설명을 사용자 관심 언어로 번역. */
  roamInterpretation?: string;
  /** 관람 가치별 추천 근거 — valueTag slug → "왜 그 가치에 맞는지" 한 줄.
   *  MVP 필수: 공식정보·해석·가치태그와 함께 부스가 반드시 갖춰야 할 재료. */
  recommendationReasons?: Record<string, string>;
  /** 여기서 뭘 하면 좋은지(행동 제안) — "신간 훑기"·"제작 과정 물어보기" 등. */
  thingsToDo?: string[];
  /** 타이밍 큐(사인회·굿즈 마감·붐빔·품절 등). */
  timing?: string[];
  /** 회고·다음 추천용 기억 단서. */
  memoryHooks?: string[];
  /** 동행자가 던질 대화 소재. */
  conversationPrompts?: string[];
  /** 데이터 신뢰도. */
  confidence?: EnrichmentConfidence;
}

/** 관람 가치 태그 — 부스가 어떤 관람 가치와 연결되는지 + 강도. */
export interface BoothValueTag {
  slug: string; // VALUE_TAGS의 slug
  strength: number; // 0..1
}

export interface BoothEvent {
  id: string;
  boothId: string;
  title: string;
  description: string;
  startTime: string; // ISO
  endTime: string;
  rewardInfo?: string;
  capacity?: number;
  /** Program type chip (이벤트 / 저자 사인회 / 주제강연 …). */
  tag?: string;
  /** Lecture subtitle / 부주제. */
  subtitle?: string;
  /** 강연자 / presenter line. */
  speaker?: string;
  /** Runs the whole fair (상시) rather than at a fixed slot — UI shows "상시". */
  standing?: boolean;
}

export interface WelcomeKit {
  boothId: string;
  enabled: boolean;
  name: string;
  description: string;
  imageUrl?: string;
  remainingCount: number;
}

export interface Review {
  id: string;
  boothId: string;
  /** 작성자 계정(`app_user.id`). 0056에서 익명 세션 → 계정으로 전환됐다. */
  userId: string;
  comment: string;
  authorName: string;
  createdAt: string;
}

export interface UserPreference {
  sessionId: string;
  /** One or more visit goals — the route weighs every selected purpose. */
  visitPurposes: VisitPurpose[];
  interests: string[]; // category slugs
  availableMinutes: number;
  movementPreference: MovementPreference;
  companionType: CompanionType;
  updatedAt: string;
}

export interface VisitorSession {
  id: string;
  exhibitionId: string;
  createdAt: string;
  lastSeenAt: string;
}

export interface RouteLeg {
  from: string; // boothId or "start"
  to: string; // boothId
  minutes: number;
  distance: number;
}

export interface RoutePlan {
  id: string;
  sessionId: string;
  /** Owner once the visitor has signed in (nickname account). */
  userId?: string;
  exhibitionId: string;
  boothIds: string[];
  estimatedMinutes: number;
  legs: RouteLeg[];
  scores: Record<string, number>;
  status: RouteStatus;
  currentBoothId?: string;
  visitedBoothIds: string[];
  /** Sharing: published to the public gallery / shareable link. */
  title?: string;
  isPublic: boolean;
  shareId?: string;
  createdAt: string;
}

/**
 * A visitor identity. Nickname is unique and used as the public key. An account
 * may originate from a nickname (provider undefined) or from an OAuth provider
 * (e.g. "google"); OAuth accounts still carry an auto-generated unique nickname.
 */
export interface User {
  id: string;
  nickname: string;
  createdAt: string;
  /** OAuth provider slug (e.g. "google"), or undefined for nickname-only. */
  provider?: string;
  email?: string;
  avatarUrl?: string;
}

/** Identity read from an OAuth provider, used to find-or-create an app_user. */
export interface OAuthIdentity {
  provider: string;
  providerAccountId: string;
  nickname: string;
  email?: string;
  avatarUrl?: string;
  /** 지정하면 이 값을 app_user.id로 그대로 쓴다(미지정 시 새로 생성) — Supabase
   *  Auth로 직접 로그인하는 경로(iOS Apple)가 auth.uid()와 app_user.id를 같은
   *  값으로 맞춰야 RLS owner-scoped 정책(0041)이 별도 매핑 없이 바로 먹는다. */
  id?: string;
}

/**
 * A signed-in visitor's personal record for a booth (관심 / 판정 / 메모 / 사진).
 *
 * interest와 verdict는 직교한다 — "꼭 갈래로 찍어둔 곳에 다녀와서 좋았어"가 동시에
 * 참일 수 있다. interest는 화면(관람 전)에서 한 판단, verdict는 현장(관람 중·후)에서
 * 한 판단이다. 지도 색은 `verdict ?? interest ?? 존 색`(결과가 예측을 덮는다).
 */
/**
 * 판정 어휘 — 관람 전(interest)·현장(verdict)·확신 등급(judgedClass).
 *
 * 예전엔 BoothNote에 인라인 유니온으로만 있어서 이름이 없었고, 같은 목록이
 * schemas의 z.enum과 DB check 제약에 따로 한 벌씩 더 있었다. 값을 하나 늘리면
 * 세 곳을 각자 찾아 고쳐야 했고, 점수를 매기는 switch(memory/taste.ts)는
 * 빠뜨려도 아무 말 없이 그 반응을 채점에서 흘려버렸다.
 */
export const BOOTH_INTERESTS = ["must", "curious", "pass"] as const;
export type BoothInterest = (typeof BOOTH_INTERESTS)[number];

export const BOOTH_VERDICTS = ["good", "ok", "bad"] as const;
export type BoothVerdict = (typeof BOOTH_VERDICTS)[number];

export const JUDGED_CLASSES = ["confident", "uncertain"] as const;
export type JudgedClass = (typeof JUDGED_CLASSES)[number];

export interface BoothNote {
  userId: string;
  boothId: string;
  /** 관람 전 판단(옛 어휘). 새 클라이언트는 `heart`를 쓴다. must·curious는 하트,
   *  pass는 하트 없음으로 읽는다(2026-11-17, 하트 하나). 옛 iOS가 아직 이 칸을
   *  읽고 쓰므로 계속 채운다. */
  interest?: BoothInterest;
  /** 하트 하나(2026-11-07 결정). `heartedAt`이 있거나 옛 interest가 must·curious면 true. */
  heart?: boolean;
  /** 하트를 남긴 시각. 하트를 빼면 지운다. */
  heartedAt?: string;
  /** 다녀온 뒤 평가. 선택이다 — 평가 없이 다녀왔어요만 있을 수 있다. */
  verdict?: BoothVerdict;
  /** 평가를 남긴 시각. 평가를 지우면 같이 지운다. */
  verdictAt?: string;
  /** 다녀왔어요. 평가와 따로 쓰고 따로 지운다(2026-11-17 결정, 판단 어휘 §3-3 대체).
   *  평가를 지워도 남는다. 다녀왔어요를 끄면 평가도 같이 지운다. */
  visitedAt?: string;
  /** visitedAt이 있으면 true. 앱이 시각 없이 켜짐 여부만 읽을 수 있게. */
  visited?: boolean;
  /** 가장 최근 반응(interest 또는 verdict) 판정 시점의 확신 등급 — 취향 정확도
   *  채점용. verdict 기록이 더 나중이자 최종이다. */
  judgedClass?: JudgedClass;
  memo?: string;
  /** Personal photos (Cloudinary URLs) attached to this booth note. */
  photos?: string[];
  updatedAt: string;
}

/** Public-gallery / shared-link projection of a route. */
export interface SharedRoute {
  id: string;
  shareId: string;
  title: string;
  exhibitionId: string;
  ownerNickname: string;
  boothIds: string[];
  estimatedMinutes: number;
  createdAt: string;
}

export interface Bookmark {
  id: string;
  /** 소유자 = 계정(app_user.id). 세션 만료로 사라지면 안 되는 저장이라 계정에 묶는다. */
  userId: string;
  targetType: BookmarkTarget;
  targetId: string;
  createdAt: string;
}

/** 공개 설문 `/survey` 응답 한 건. 한 사람(설문 쿠키) 한 행 — 다시 보내면 덮어쓴다. */
export interface SurveyResponse {
  surveyId: string;
  respondentId: string;
  /** 질문 key → 고른 값(여러 개 고르는 질문은 배열). 질문 정의는 `lib/survey/questions.ts`. */
  answers: Record<string, string | string[]>;
  comment?: string | null;
  /** 페이지를 연 뒤 제출까지 걸린 시간(ms). 브라우저가 재서 보낸다. */
  durationMs?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsEvent {
  id: string;
  sessionId: string;
  /** 로그인 사용자 id(app_user.id). 방문객 앱은 로그인 게이트 뒤라 실질적으로 항상
   *  채워지지만, 게이트 밖(/admin·/api 직접 호출)에서 온 이벤트는 null이다.
   *  취향(UserSignal, user 기준)과 행동(analytics_event)을 잇는 유일한 키. */
  userId?: string | null;
  exhibitionId: string;
  type: AnalyticsType;
  boothId?: string;
  x?: number;
  y?: number;
  meta?: Record<string, unknown>;
  createdAt: string;
  // --- 앱 이벤트(0066). 웹 옛 행은 비어 있다. ---
  name?: string;
  platform?: "web" | "ios" | "android";
  appVersion?: string;
  anonId?: string;
  appSessionId?: string;
  screenId?: string;
  clientTs?: string;
  eventId?: string;
}

/** APNs 기기 토큰(0067). 브랜드 알림은 userId가 있는 행만 대상이다(2026-11-17). */
export interface PushDevice {
  id: string;
  token: string;
  platform: "ios";
  environment: "sandbox" | "production";
  userId: string | null;
  anonId?: string;
  appVersion?: string;
  createdAt: string;
  lastSeenAt: string;
  revokedAt?: string;
}

/** 브랜드 하트(0068). 부스 하트와 따로, 브랜드(exhibitor)에 건다. */
export interface BrandHeart {
  userId: string;
  exhibitorId: string;
  createdAt: string;
}

/** 브랜드의 다가오는(또는 진행 중) 참가 한 줄. 부스가 없을 수 있다(브랜드 먼저 인입). */
export interface UpcomingParticipation {
  exhibitorId: string;
  participantId: string;
  displayName: string;
  exhibition: {
    id: string;
    slug: string;
    name: string;
    venue: string;
    startDate: string;
    endDate: string;
  };
  /** 대표 부스. 부스 배정 전이면 없다. */
  booth?: { id: string; code?: string; name: string };
}

/** 알림 종류(0071). 지금은 브랜드 알림 하나. iOS PushPref.brandAppear와 같은 이름. */
export type NotificationKind = "brand_appear";
/** queued: 아직 안 보냄(조용한 시간, APNs 미설정, 일시 오류), sent, failed, no_device(기기 없음, 알림함엔 보임),
 *  muted(브랜드 알림을 끔, 푸시 없이 알림함엔 보임, 11-19 Ted), expired(보내기 전에 박람회가 끝남) */
export type NotificationStatus = "queued" | "sent" | "failed" | "no_device" | "muted" | "expired";

/** 알림 한 줄(0071) = (사용자, 브랜드, 박람회) 하나. 푸시는 batchId로 하루 한 번 묶인다. */
export interface NotificationLog {
  id: string;
  userId: string;
  kind: NotificationKind;
  title: string;
  body: string;
  payload: Record<string, unknown>;
  dedupeKey: string;
  batchId?: string;
  status: NotificationStatus;
  error?: string;
  createdAt: string;
  sentAt?: string;
  readAt?: string;
}

export type NotificationInsert = Pick<NotificationLog, "userId" | "kind" | "title" | "body" | "payload" | "dedupeKey">;

/** 새로 생긴 참가 한 줄(브랜드 알림의 재료). 부스 배정 전이면 booth가 없다. */
export interface NewParticipation {
  participantId: string;
  exhibitorId: string;
  displayName: string;
  createdAt: string;
  exhibition: { id: string; slug: string; name: string; startDate: string; endDate: string };
  booth?: { id: string; code?: string; name: string };
}

/** 마이페이지와 내보내기용 — 노트에 부스, 박람회, 브랜드를 붙인 것. */
export interface NoteWithContext extends BoothNote {
  booth: {
    id: string;
    name: string;
    code?: string;
    kind?: BoothKind;
    categoryId: string;
    hallId: string;
  } | null;
  exhibition: {
    id: string;
    slug: string;
    name: string;
    venue: string;
    startDate: string;
    endDate: string;
  } | null;
  brand: { exhibitorId: string; participantId: string; name: string } | null;
}

/** 앱 이벤트 한 줄을 저장소에 넣는 모양. 박람회, 부스는 서버가 확인한 것만 온다. */
export interface AppEventRow {
  eventId: string;
  name: string;
  clientTs: string;
  platform: "web" | "ios" | "android";
  appVersion?: string;
  anonId: string;
  appSessionId?: string;
  screenId?: string;
  userId: string | null;
  exhibitionId: string | null;
  boothId: string | null;
  props: Record<string, unknown>;
}

/** 운영 콘솔 "앱 이벤트"가 읽는 한 줄(속성은 읽지 않는다). */
export interface AppEventBrief {
  name: string;
  platform: string;
  anonId: string | null;
  appVersion: string | null;
  createdAt: string;
}

/**
 * 지도 "AI 추천" 채팅창에 사용자가 입력한 자유 텍스트 로그. 누적해서 자주 나오는
 * 키워드를 추적하고(RAG), 이후 추천 프롬프트에 트렌딩 신호로 주입한다.
 */
export interface AiQueryLog {
  id: string;
  exhibitionId: string;
  sessionId: string;
  text: string;
  /** LLM이 그 쿼리에서 뽑은 대표 키워드(빈도 집계의 단위). */
  keywords: string[];
  createdAt: string;
}

/**
 * 서버·클라이언트 오류 이벤트. source로만 구분 — 구조가 같은 하나의 로그 스트림이다.
 * 데이터 이슈(부스 결측 등)는 여기 안 담는다. "사건"이 아니라 "지금 상태"라서 별도로
 * 조회 시점에 계산한다(src/lib/admin/data-issues.ts).
 */
export interface IssueLog {
  id: string;
  source: "server" | "client";
  message: string;
  stack?: string;
  path?: string;
  digest?: string;
  userId?: string;
  sessionId?: string;
  context?: Record<string, unknown>;
  /** parseUserAgent 결과(예: "iPhone · Safari"). 모르면 undefined. */
  device?: string;
  /** Vercel 지오 헤더 기반 — IP 자체는 저장하지 않는다. */
  country?: string;
  city?: string;
  createdAt: string;
}

// --- L4 사용자 브레인 (종단 메모리) ------------------------------------------
// 원장(UserSignal) → 결정론 증류(confidence 수학, LLM 무) → per-user 브레인(UserBrain).
// userId = app_user.id. 설계: docs/decisions/2026-07-07_knowledge-architecture.md §7

export type SignalKind =
  | "booth_bookmarked"
  | "route_saved"
  | "feed_click"
  | "reaction_must" // 꼭 갈래 — 관람 전, 가겠다고 정한 것
  | "reaction_curious" // 끌려 — 관람 전, 좋은데 확정 아님
  | "reaction_pass" // 패스 — 관람 전, 카드만 보고 내린 거절
  | "verdict_good" // 좋았어 — 현장, 몸으로 확인한 긍정
  | "verdict_ok" // 그냥그랬어 — 현장, 중립
  | "verdict_bad" // 아니었어 — 현장, 가보고 아니었다
  | "search_query" // 특정 부스 검색 = 강한 능동 관심
  | "heart_added" // 하트 하나(2026-11-07) — 관람 전, 관심 표시
  | "heart_removed" // 하트 빼기. 싫어요가 아니다(§4) — 가중치 0
  | "visit_marked" // 다녀왔어요 — 방문 사실일 뿐 좋아함이 아니다(§4) — 가중치 0
  | "visit_unmarked"; // 다녀왔어요 끄기 — 가중치 0

/** 원장 1행 — 사용자 행동 신호. append-only, 재증류 소스. */
/**
 * 목록 조회가 돌려주는 부스. **`images`·`longDescription`이 없다** —
 * `BOOTH_LIST_COLS`가 성능 때문에 그 두 컬럼을 안 가져오기 때문이다.
 *
 * 왜 별도 타입인가: 전엔 목록 조회도 `Booth`를 반환했고, 그래서 안 가져온 필드가
 * 빈 값으로 채워진 채 "완전한 Booth"라고 타입이 말했다. 2026-09-06에 인입이
 * 그걸 믿고 `images`를 늘 빈 칸으로 보고 97개 부스를 덮어쓸 계획을 세웠다
 * (값이 우연히 같아서 무해했을 뿐이다). 타입이 진실을 말하면 컴파일러가 막는다.
 *
 * 전 필드가 필요하면 `listBoothsFull`·`getBoothDetail`을 쓴다.
 */
export type BoothListItem = Omit<Booth, "longDescription">;

/** 워커가 집어 가는 잡 한 건. type·payload는 워커마다 다르다. */
export interface Job {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  /** cancelled — 사람이 중단시킨 잡. 실패가 아니라 적체 알림에서 세지 않는다(2026-10-09). */
  status: "queued" | "running" | "done" | "failed" | "cancelled";
  runAfter: string;
  attempts: number;
  maxAttempts: number;
  lastError?: string | null;
  claimedBy?: string | null;
  claimedAt?: string | null;
  progress: Record<string, unknown>;
  result?: Record<string, unknown> | null;
  createdAt: string;
  finishedAt?: string | null;
}

/** 검수 대기 초안 한 건. 자동 초안·참가사 폼·주최 측 제출이 같은 모양으로 들어온다. */
/**
 * 참가사 그래프 — 0040(exhibitor · exhibition_participant · booth_participant).
 * 부스(이번 회차의 자리)와 참가사(행사를 넘는 정체)를 잇는다. 화면과 로미는
 * 회차별 표기 이름(displayName)을 쓴다(설계 2026-10-02 §3).
 */
export interface ExhibitorGraph {
  exhibitors: {
    id: string;
    canonicalName: string;
    instagramUrl?: string;
    websiteUrl?: string;
    /** exhibitor.aliases — 이름만 같은 기존 브랜드를 찾을 때만 쓴다. */
    aliases?: string[];
    /** exhibitor.metadata.brandKeys — 브랜드 먼저 인입(brands.v1)이 만든 브랜드의 파일 키.
     *  인스타도 도메인도 없는 브랜드를 다시 돌려도 중복으로 만들지 않게 하는 열쇠다. */
    brandKeys?: string[];
  }[];
  participants: {
    id: string;
    exhibitorId: string;
    exhibitionId: string;
    displayName: string;
    /** exhibition_participant.aliases — 같은 행사 부스 이름 맞추기에 쓴다. */
    aliases?: string[];
    /** exhibition_participant.created_at — 브랜드 알림이 "새로 생긴 참가"를 고를 때 쓴다(0071). */
    createdAt?: string;
  }[];
  assignments: { boothId: string; participantId: string; role: "primary" | "co_exhibitor" }[];
  /** 연결 후보(0057, 0073). 판단 단위는 출전(participantId)이고 부스는 붙은 정보일 뿐이라 없을 수 있다. */
  candidates: { boothId: string | null; participantId: string | null; exhibitorId: string; status: string }[];
}

/** 한 부스(=그 브랜드)의 다른 행사 기록 — 로미 2절 재료(설계 2026-10-02 §6). */
export interface BoothBrandMemory {
  /** 이 부스가 이번 행사에 표기된 이름 — 지난 이름과 같은지 비교용. */
  currentName: string;
  past?: { exhibition: string; name: string };
  /** 이 사용자 본인의 긍정 반응만. */
  mine?: { exhibition: string; name: string; kind: "must" | "curious" | "good" };
}

/** 부스 상세 "다른 행사에서도" 한 줄. */
export interface BoothAppearance {
  exhibitionName: string;
  startDate: string;
  displayName: string;
  boothId: string;
  boothCode?: string;
}

/**
 * 브랜드 컨택(0061) — 카드뉴스 등에 사진과 글을 쓰려고 브랜드에 연락한 기록.
 * 한 행 = 한 부스(= 그 브랜드의 그 박람회 회차). 같은 브랜드도 박람회마다 따로 묻기
 * 때문에 참가사(exhibitor)가 아니라 부스에 붙인다. 상태값은 Roam-design
 * `docs/content/engine/runs/moongu-2026-winter/permissions.csv`의 dmStatus와 같다
 * (`replied`만 이쪽에서 더했다). 표시 이름은 `lib/brands/contact.ts`.
 */
export const BRAND_CONTACT_STATUSES = [
  "not-sent",
  "sent",
  "read",
  "replied",
  "granted",
  "partial",
  "declined",
  "no-reply",
  "withdrawn",
] as const;
export type BrandContactStatus = (typeof BRAND_CONTACT_STATUSES)[number];

export const BRAND_CONTACT_CHANNELS = ["instagram", "x", "email", "other"] as const;
export type BrandContactChannel = (typeof BRAND_CONTACT_CHANNELS)[number];

export interface BrandContact {
  boothId: string;
  exhibitionId: string;
  status: BrandContactStatus;
  channel: BrandContactChannel | null;
  /** 연락한 계정이나 주소(@계정, 메일). */
  handle: string | null;
  /** 처음 보낸 날짜 `YYYY-MM-DD`(csv dmSentAt). */
  sentAt: string | null;
  /** 답 요약 한 줄(csv reply). */
  reply: string | null;
  /** 허락 범위 토큰(csv allowedUse를 `;`로 쪼갠 것). */
  allowedUse: string[];
  /** 받은 사진이 있는 곳(경로나 링크, csv photoSource). */
  photoSource: string | null;
  /** 받은 글(작품 소개)이 있는 곳. */
  textSource: string | null;
  notes: string | null;
  /** 체크리스트 항목 key → 완료 시각(ISO). 없는 key = 아직 안 함. */
  checklist: Record<string, string>;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export const BRAND_CONTACT_LOG_DIRECTIONS = ["outbound", "inbound", "internal"] as const;
export type BrandContactLogDirection = (typeof BRAND_CONTACT_LOG_DIRECTIONS)[number];
export const BRAND_CONTACT_LOG_KINDS = [
  "message",
  "permission",
  "edit-request",
  "takedown-request",
  "thanks",
  "other",
] as const;
export type BrandContactLogKind = (typeof BRAND_CONTACT_LOG_KINDS)[number];

/** 컨택 로그(VOC) 한 줄. 지우거나 고치지 않고 쌓는다. */
export interface BrandContactLog {
  id: string;
  boothId: string;
  direction: BrandContactLogDirection;
  kind: BrandContactLogKind;
  channel: BrandContactChannel | null;
  summary: string;
  actor: string | null;
  occurredAt: string;
  createdAt: string;
}

// --- 연락의 목표 모양(스키마 정규화 초안 STEP 1, 2026-11-17, 아직 운영 미적용) -----------
// 연락처와 VOC는 브랜드(exhibitor)에, 회차별 허락은 출전(exhibition_participant)에 붙는다.
// 부스는 필요 없다. 초안: supabase/migrations/_draft/participant-rekey.draft.sql(브랜치 docs/schema-normalization).
// STEP 1 전까지 운영은 옛 brand_contact(부스 키)를 쓰고, 연락 보드는 lib/brands/outreach-store.ts가 둘을 가린다.

/** 브랜드에 누구로 어떻게 닿나. 박람회가 바뀌어도 같다(brand_outreach). */
export interface BrandOutreach {
  exhibitorId: string;
  channel: BrandContactChannel | null;
  handle: string | null;
  /** 더 연락하지 않는다(내려 달라는 요청 등). 모든 박람회에 걸린다. */
  doNotContact: boolean;
  notes: string | null;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 이번 회차 콘텐츠에 무엇을 써도 되나(participant_permission). */
export interface ParticipantPermission {
  participantId: string;
  exhibitionId: string;
  status: BrandContactStatus;
  sentAt: string | null;
  reply: string | null;
  allowedUse: string[];
  photoSource: string | null;
  textSource: string | null;
  notes: string | null;
  checklist: Record<string, string>;
  updatedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 브랜드와 오간 말(brand_outreach_log). 특정 회차 이야기면 participantId. 쌓기만 한다. */
export interface BrandOutreachLog {
  id: string;
  exhibitorId: string;
  participantId: string | null;
  direction: BrandContactLogDirection;
  kind: BrandContactLogKind;
  channel: BrandContactChannel | null;
  summary: string;
  actor: string | null;
  occurredAt: string;
  createdAt: string;
}

/**
 * 브랜드 프로필 칸(0061 brand_profile_field). 기준 문서: Roam-design
 * `docs/content/engine/brand-profile-spec.md` 3~5장. 한 행 = 한 브랜드(exhibitor)나
 * 한 출전(exhibition_participant)의 한 칸. 칸마다 출처, 확인 상태, 갱신일, 누가를 같이 둔다.
 * 칸 정의(라벨, 값 모양)는 `lib/brands/profile.ts`.
 */
export const PROFILE_FIELD_STATUSES = [
  "collected",
  "ai_draft",
  "reviewed",
  "artist_confirmed",
  "stale",
] as const;
export type ProfileFieldStatus = (typeof PROFILE_FIELD_STATUSES)[number];

export type ProfileSubject = { exhibitorId: string } | { participantId: string };

export interface ProfileField {
  /** `ex:<exhibitorId>:<field>` 또는 `pt:<participantId>:<field>` — 결정적이라 upsert 키가 된다. */
  id: string;
  exhibitorId: string | null;
  participantId: string | null;
  field: string;
  value: unknown;
  /** URL 목록. 작가 답이면 `contact-log:<id>`, 부스 정보에서 가져왔으면 `roam:booth/<id>`. */
  sources: string[];
  status: ProfileFieldStatus;
  /** 마지막으로 확인한 시각. */
  verifiedAt: string;
  actor: string | null;
  createdAt: string;
  updatedAt: string;
}

/** "같은 브랜드인가요?" — 이름만 같아서 사람이 판단해야 하는 연결(0057, 0073).
 *  판단 단위는 **출전**(그 박람회의 그 참가)이다. 부스는 나중에 붙는 선택값이라 없어도 된다
 *  (2026-11-20 Ted, docs/decisions/2026-11-20_브랜드-대조는-참가-단위.md). */
export interface ExhibitorLinkCandidate {
  id: string;
  /** 후보를 낸 부스. 부스 인입이 낸 후보만 있고, 브랜드 먼저 인입(brands.v1)이 낸 후보는 null. */
  boothId: string | null;
  /** 후보가 된 출전(0062 칸, 0063, 0073이 대표 배정으로 채움). 옛 행이면 null일 수 있다 — 그때는 부스로 찾는다. */
  participantId: string | null;
  exhibitorId: string;
  reason: string;
  status: "pending" | "approved" | "rejected" | "superseded";
  reviewedAt?: string;
  reviewedBy?: string | null;
  createdAt: string;
}

export interface EnrichmentCandidate {
  id: string;
  boothId: string;
  exhibitionId: string;
  source: string;
  payload: Record<string, unknown>;
  sources: { uri: string; title?: string }[];
  confidence: number;
  issues: { code: string; field?: string; message: string; weight: number }[];
  status: "pending" | "approved" | "rejected" | "superseded";
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  /** 반려 사유(또는 승인 메모). 다음 초안이 읽어 같은 실수를 반복하지 않게 한다. */
  reviewNote?: string | null;
  /** 이 부스의 몇 번째 초안인가(1차·2차·3차…). 저장하지 않고 생성 순서에서
   *  도출한다 — 목록 API가 채워 준다. */
  round?: number;
  createdAt: string;
}

/** 변경 이력 한 줄. 상세 규약은 src/lib/audit/diff.ts. */
export interface ChangeRecord {
  id: string;
  entity: string;
  entityId: string;
  scopeId?: string | null;
  source: string;
  actor?: string | null;
  fieldDiffs: Record<string, { before: unknown; after: unknown }>;
  reason?: string | null;
  createdAt: string;
}

export interface UserSignal {
  id: string;
  userId: string;
  exhibitionId: string;
  kind: SignalKind;
  /** 신호를 유발한 부스의 불변 식별자. 참가사 이력과 정확히 연결하는 키. */
  boothId?: string;
  /** 신호를 유발한 부스의 사람용 코드(회고/표시용). */
  boothCode?: string;
  /** 관심 이전축 = category slug. 부스 tags에서 확장. */
  slugs: string[];
  createdAt: string;
}

/** 증류된 관심 노드 — category slug 단위, confidence 있는. */
export interface InterestNode {
  key: string; // category slug (이전축)
  label: string;
  confidence: number; // 0..1
  signals: { explicit: number; implicit: number; negative: number };
  firstSeenAt: string;
  lastSeenAt: string;
  trend: "up" | "flat" | "down";
}

/** 관람 1회의 약속(개인 목표). 이번 슬라이스 미사용 — 스키마만. */
export interface GoalRecord {
  exhibitionId: string;
  visitId: string;
  statement: string;
  themes: string[]; // category slug[]
  timeBudgetMin: number;
  status: "set" | "met" | "partial" | "missed";
  metRatio: number; // 분모 프레이밍: 관련집합 대비
  createdAt: string;
  closedAt?: string;
}

/** L3 에피소드 → 증류본. 이번 슬라이스 미사용 — 스키마만. */
export interface VisitDigest {
  exhibitionId: string;
  visitId: string;
  date: string;
  boothsVisited: string[]; // booth code[]
  themesEngaged: string[]; // category slug[]
  highlights: string[]; // 자발(메모·사진) + 자동(순간) 합성
  satisfaction?: number; // 0..1 회고 신호
  summary: string; // 결정론 1줄 요약(항상 존재)
  /** Companion(LLM)이 쓴 따뜻한 회고 서술. 조회 시 lazy 생성·캐시. 없으면 summary. */
  narrative?: string;
}

/** per-user 종단 모델 — 증류본(원장 아님). LLM 주입 시 요약해 전달. */
export interface UserBrain {
  userId: string;
  version: number;
  updatedAt: string;
  /** 안목(학습도) — 성장 지표. 초보→고관여 UX 구동. */
  literacy: {
    overall: number; // 0..1
    byTheme: Record<string, number>; // slug → 0..1
    visitsCount: number;
    boothsSeenCount: number;
  };
  interests: InterestNode[]; // top-N만 유지(증류)
  /**
   * 사용자가 "이건 내 취향 아니야"라고 끈 가치 slug.
   *
   * 브레인은 append-only 신호 원장에서 증류되므로 신호를 지울 수 없다. 음의 신호는
   * confidence를 낮출 뿐 0이 안 되고, 전체 목록 멱등 쓰기는 하나 추가하려다 나머지를
   * 부정하게 된다. 그래서 원장은 그대로 두고 여기에만 기록한다 — 끄는 것은 과거
   * 행동의 부정이 아니라 현재 상태 선언이고, 풀면 그동안의 confidence가 그대로 돌아온다.
   *
   * 레거시 행(이 필드 이전에 저장된 브레인)엔 없을 수 있다 — 읽는 쪽이 `?? []`로 받는다.
   */
  mutedSlugs?: string[];
  preferences: {
    movement?: MovementPreference;
    companion?: CompanionType;
    crowdTolerance?: number; // 0..1 (낮을수록 회피)
    waitTolerance?: number; // 0..1
    depthVsBreadth?: number; // 0=깊게 1=넓게
  };
  goals: GoalRecord[];
  visits: VisitDigest[];
  health: {
    lastDistilledAt: string;
    decayHalfLifeDays: number;
  };
}

export interface Organizer {
  id: string;
  email: string;
  name: string;
  createdAt: string;
}

/** A real-time community post visitors share during the exhibition. */
/** 커뮤니티 첨부 매체. CommunityPost·DeletePostResult가 각자 선언하고 있었다. */
export const MEDIA_TYPES = ["image", "video"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export interface CommunityPost {
  id: string;
  exhibitionId: string;
  /** 작성자 계정(`app_user.id`). 0056에서 익명 세션 → 계정으로 전환됐다. */
  userId: string;
  authorName: string;
  body: string;
  boothId?: string; // optional booth the post is about
  /** Attached photo / short clip (display-only, Cloudinary). */
  mediaUrl?: string;
  mediaType?: MediaType;
  mediaPublicId?: string;
  createdAt: string;
}

/** An abuse report against a community post (deduped per reporter session). */
export interface CommunityReport {
  id: string;
  postId: string;
  sessionId: string;
  reason?: string;
  createdAt: string;
}

/** Result of reporting a post. `ok` is false only when the post is missing. */
export interface ReportResult {
  ok: boolean;
  /** This session had already reported the post (idempotent). */
  already: boolean;
}

/**
 * Result of deleting a post. `deleted` is false when no row was removed
 * (wrong session / missing). When a deleted post had media attached, the
 * Cloudinary identifiers are returned so the caller can destroy the asset.
 */
export interface DeletePostResult {
  deleted: boolean;
  mediaPublicId?: string;
  mediaType?: MediaType;
}

// --- Derived / composite DTOs ---------------------------------------------

export interface ScoreBreakdown {
  interest: number;
  popularity: number;
  event: number;
}

export interface ScoredBooth {
  booth: BoothListItem;
  score: number;
  breakdown: ScoreBreakdown;
}

export interface BoothDetail {
  booth: Booth;
  category: Category;
  welcomeKit?: WelcomeKit;
  events: BoothEvent[];
  reviews: Review[];
  reviewSummary: { count: number };
}

export interface ExhibitionDetail {
  exhibition: Exhibition;
  halls: Hall[];
  categories: Category[];
}

// --- API envelope ----------------------------------------------------------

export type ApiErrorCode =
  | "VALIDATION"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "UNPROCESSABLE"
  | "INTERNAL";

export interface ApiError {
  code: ApiErrorCode;
  message: string;
  fields?: Record<string, string[]>;
}

export type ApiResult<T> = { data: T } | { error: ApiError };

export interface Paginated<T> {
  data: T[];
  nextCursor: string | null;
}

// --- 아티클(0070) -------------------------------------------------------------
// 브랜드 아티클 초안 → Ted 승인 → 공개 API. 설계: docs/decisions/2026-11-19_브랜드-아티클-초안-파이프라인.md

export const ARTICLE_KINDS = ["brand_intro", "fair_roundup"] as const;
/** brand_intro = 숨은 브랜드 하나 소개, fair_roundup = 박람회 참가 브랜드 모음. */
export type ArticleKind = (typeof ARTICLE_KINDS)[number];

export const ARTICLE_STATUSES = ["draft", "approved", "rejected"] as const;
/** draft → approved(공개 API에 나감) | rejected(그 주제는 다음 초안에서 뺀다). */
export type ArticleStatus = (typeof ARTICLE_STATUSES)[number];

/**
 * 아티클이 기대는 출처 하나. 본문 문장은 이 id로만 사실을 가리킨다.
 * - profile_field: brand_profile_field 한 칸(확인된 상태만)
 * - exhibition: 행사 행(이름, 날짜, 장소)
 * - participation: 브랜드 × 행사 참가 사실
 * - booth: 부스 번호
 */
export interface ArticleSource {
  id: string;
  /**
   * photo: 브랜드 프로필 대표 사진 칸(사람이 허락 범위를 붙이고 확인한 것). text = 사진 경로 줄 목록.
   * permission: 그 박람회 회차의 사진 허락(brand_contact 또는 participant_permission, 허락 또는 일부 허락).
   */
  kind: "profile_field" | "exhibition" | "participation" | "booth" | "photo" | "permission";
  /** 사람이 읽는 이름. 예: "하치 공식 소개(공식 자료)" */
  label: string;
  /** 원래 출처(URL이나 연락 기록 설명). 칸의 sources 그대로. */
  origin: string[];
  /** 브랜드나 주최 측이 직접 쓴 글이면 true. 이 글은 고치지 않고 인용으로만 쓴다(§1, 11-09). */
  brandWritten?: boolean;
  /** 사실 원문. 인용과 사실 대조(gate)에 쓴다. */
  text: string;
}

/**
 * 아티클 사진 한 장. 허락 받은 사진만 들어온다(lib/articles/facts.ts permittedPhotos).
 * path는 앱 기준 경로("/…")나 https 주소. 화면은 그대로 img src로 쓴다.
 */
export interface ArticlePhoto {
  path: string;
  /** 대체 글(Roam이 쓴 라벨). */
  alt: string;
  /** 사진 표기. 예: "사진 하치" */
  credit: string;
  /** 사람이 붙인 허락 범위 원문(대표 사진 칸의 scope). */
  scope: string;
  /** 대표 사진 칸 출처 id(kind photo). */
  sourceId: string;
  /** 그 회차 사진 허락 출처 id(kind permission). */
  permissionId: string;
}

/**
 * 본문 한 덩어리. Figma 아티클 화면과 1:1로 맞추려고 다섯 가지만 둔다.
 * - text: Roam이 쓴 문단(해요체 게이트 대상)
 * - quote: 브랜드나 주최 측 원문 그대로
 * - photo, photo-group: 허락 받은 사진 한 장, 두세 장
 * - brand-card: 모음 글의 브랜드 한 곳(이름, 부스, 품목, 사진). 사진 없는 브랜드는 카드가 되지 않는다
 */
export type ArticleBlock =
  | { type: "text"; text: string; sourceIds: string[] }
  | { type: "quote"; text: string; sourceId: string; attribution: string }
  | { type: "photo"; photo: ArticlePhoto }
  | { type: "photo-group"; photos: ArticlePhoto[] }
  | {
      type: "brand-card";
      exhibitorId: string;
      name: string;
      boothCode?: string;
      items?: string[];
      photo: ArticlePhoto;
      sourceIds: string[];
    };

export interface ArticleGate {
  ok: boolean;
  /** 어떤 글쓴이가 만든 판본이 통과했나. */
  writer: string;
  issues: string[];
  /** 통과하지 못하고 버린 판본의 문제(예: LLM 판본 실패 → 틀 판본으로). */
  rejectedAttempts: { writer: string; issues: string[] }[];
  checkedAt: string;
  /**
   * 누가 만들게 했나. "schedule" = 점검의 주간 자동 편, "manual" = 관리자 "새 초안".
   * 0070엔 칸이 없어 gate jsonb에 둔다(마이그레이션 없이). 11-19 이전 행엔 없다(자동으로 본다).
   */
  origin?: "schedule" | "manual";
}

export interface Article {
  id: string;
  kind: ArticleKind;
  status: ArticleStatus;
  title: string;
  excerpt: string;
  /** 대표 사진. 없으면 저장하지 않는다(2026-11-19 Ted "아티클에 사진은 당연하게"). */
  hero: ArticlePhoto;
  body: ArticleBlock[];
  sources: ArticleSource[];
  gate: ArticleGate;
  /** 같은 주제를 두 번 내지 않는 열쇠. `brand:<exhibitorId>` | `fair:<exhibitionId>`. */
  subjectKey: string;
  exhibitorIds: string[];
  exhibitionIds: string[];
  /** 이 초안을 만든 날(KST, YYYY-MM-DD). 자동 편은 한 주에 한 편(`articles/schedule.ts`). */
  generatedFor: string;
  decidedBy: string | null;
  decidedAt: string | null;
  rejectReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ArticleInput = Omit<Article, "id" | "status" | "decidedBy" | "decidedAt" | "rejectReason" | "createdAt" | "updatedAt">;
