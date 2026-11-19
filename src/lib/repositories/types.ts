import type { ChangeEntry, AuditContext } from "@/lib/audit/diff";
import type { CurveInput } from "@/lib/memory/learning-curve";
import type {
  AnalyticsEvent,
  AppEventRow,
  PushDevice,
  BrandHeart,
  UpcomingParticipation,
  NoteWithContext,
  SurveyResponse,
  Booth,
  BoothListItem,
  BoothDetail,
  BoothEvent,
  Bookmark,
  BoothNote,
  Category,
  ChangeRecord,
  EnrichmentCandidate,
  Job,
  Article,
  ArticleInput,
  ArticleStatus,
  CommunityPost,
  DeletePostResult,
  ReportResult,
  Exhibition,
  ExhibitionDetail,
  Hall,
  IssueLog,
  Paginated,
  Review,
  RoutePlan,
  SharedRoute,
  User,
  OAuthIdentity,
  UserBrain,
  UserSignal,
  UserPreference,
  VisitorSession,
  WelcomeKit,
  ExhibitorGraph,
  ExhibitorLinkCandidate,
  BoothBrandMemory,
  BoothAppearance,
  BrandContact,
  BrandContactLog,
  BrandOutreach,
  BrandOutreachLog,
  ParticipantPermission,
  ProfileField,
  ProfileFieldStatus,
  ProfileSubject,
} from "@/lib/types";
import type { TasteAccuracy } from "@/lib/memory/taste";
import type { ExhibitorPlan } from "@/lib/exhibitor/plan";
import type {
  AnalyticsEventInput,
  BookmarkInput,
  BoothEnrichmentPatch,
  BoothInput,
  BoothNoteInput,
  BrandContactLogInput,
  BrandContactPatch,
  BrandOutreachPatch,
  ParticipantPermissionPatch,
  CommunityPostInput,
  EventInput,
  ExhibitionInput,
  ReviewInput,
  RouteInput,
  RoutePatch,
  RoutePublishInput,
  UserPreferenceInput,
  WelcomeKitInput,
} from "@/lib/schemas";

export interface ListBoothQuery {
  hallId?: string;
  categoryId?: string;
  q?: string;
  cursor?: string;
  limit?: number;
}

/**
 * 방문객과 운영 콘솔이 같이 쓰는 읽기에 붙는 옵션. 방문객은 이 옵션 없이
 * 호출해 owner-scoped RLS를 그대로 받고, requireAdmin()을 통과한 라우트만
 * asAdmin으로 전체를 본다. Supabase 구현에서만 의미가 있다(mock은 RLS 없음).
 */
export type AdminRead = { asAdmin?: boolean };

export interface Repository {
  mode: "mock" | "supabase";

  // exhibitions
  listExhibitions(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<Paginated<Exhibition>>;
  getExhibition(slug: string): Promise<ExhibitionDetail | null>;
  /** 전시 slug → id만(전체 상세 없이) — getExhibition()의 halls·categories·booths
   *  병렬조회는 이 용도(클릭 계측 귀속)엔 낭비다. */
  getExhibitionIdBySlug(slug: string): Promise<string | null>;
  createExhibition(input: ExhibitionInput): Promise<Exhibition>;
  updateExhibition(
    id: string,
    input: Partial<ExhibitionInput>,
  ): Promise<Exhibition | null>;
  deleteExhibition(id: string): Promise<boolean>;

  // booths
  /** ⚠️ images·longDescription이 없다(BOOTH_LIST_COLS). 전 필드는 listBoothsFull. */
  listBooths(
    slug: string,
    query?: ListBoothQuery,
  ): Promise<Paginated<BoothListItem>>;
  /** ⚠️ 위와 같다 — 목록 조회는 두 컬럼을 안 가져온다. */
  listBoothsByExhibitionId(exhibitionId: string): Promise<BoothListItem[]>;
  /** 인입 전용 — 목록 조회가 성능 때문에 빼는 컬럼(images·longDescription)까지
   *  전부 읽는다. "빈 칸만 채운다"는 규칙은 안 보이는 컬럼을 빈 칸으로 오해하는
   *  순간 깨지고, 충돌 판정도 없이 덮어쓴다. mock은 컬럼을 안 좁혀서 이 차이가
   *  테스트에 안 잡힌다 — 운영 dry-run에서 잡혔다. */
  listBoothsFull(exhibitionId: string): Promise<Booth[]>;
  getBoothDetail(id: string): Promise<BoothDetail | null>;
  createBooth(input: BoothInput): Promise<Booth>;
  updateBooth(
    id: string,
    input: Partial<BoothInput>,
    audit?: AuditContext,
  ): Promise<Booth | null>;
  /** 저작 필드(근거 카드용 summary/valueTags/recommendationReasons/thingsToDo/
   *  timing/memoryHooks) 전체 교체 UPSERT — 부분 필드만 보내지 않는다(폼이 항상
   *  6개 전부를 함께 제출). */
  /** 검수 대기 초안 적재. 여러 건을 한 번에 — 초안기는 배치로 돈다. */
  createEnrichmentCandidates(
    rows: Omit<EnrichmentCandidate, "id" | "createdAt" | "status">[],
  ): Promise<number>;
  // 참가사(행사를 넘는 브랜드) — 0040 + 0057
  /** 그래프 전체. 1천 행을 넘는다 — 구현은 끝까지 페이지를 넘겨 읽고, 실패하면 던진다
   *  (잘린 채 돌려주면 "배정된 부스"를 놓쳐 중복 참가사가 생긴다). */
  loadExhibitorGraph(): Promise<ExhibitorGraph>;
  /** 계획을 그대로 쓴다. 새 참가사 → 참가 사실 → 배정 → 후보 순.
   *  `ids`는 계획의 새 키(`new:`) → 만든 행 id. 뒤따르는 쓰기(프로필 칸)가 이걸로 행을 찾는다. */
  applyExhibitorPlan(plan: ExhibitorPlan): Promise<{
    exhibitors: number;
    participants: number;
    assignments: number;
    candidates: number;
    ids: { exhibitors: Record<string, string>; participants: Record<string, string> };
  }>;
  listExhibitorLinkCandidates(status?: string): Promise<ExhibitorLinkCandidate[]>;
  /** 이 행사 부스마다 같은 브랜드의 **이전** 회차 출전과, userId가 있으면 그 사용자의
   *  긍정 반응(user_exhibitor_judgment_history). key = boothId. */
  exhibitorHistory(exhibitionId: string, userId: string | null): Promise<Record<string, BoothBrandMemory>>;
  /** 이 부스와 같은 브랜드의 다른 회차 부스들(최근 회차 먼저). */
  boothAppearances(boothId: string): Promise<BoothAppearance[]>;
  /** 승인 = 그 부스의 참가사를 대상 참가사에 **통째로 합친다**(모든 회차의 참가 사실).
   *  프로필 칸(0061)도 옮긴다 — 대상에 없는 칸만, 겹치면 대상 것을 지킨다(planFieldMerge).
   *  반려 = 따로 둔다. 반려한 짝은 다음 백필이 다시 내지 않는다(decidedCandidates). */
  decideExhibitorLinkCandidate(
    id: string,
    decision: "approved" | "rejected",
    actor: string | null,
  ): Promise<ExhibitorLinkCandidate | null>;

  // 브랜드 컨택(0061) — 운영자 전용. 읽기도 서비스 롤(정책 없음 = anon 차단).
  /** 컨택 행 목록. 행이 없는 부스는 안 나온다 — "미연락"은 호출부가 채운다. */
  listBrandContacts(opts?: { exhibitionId?: string }): Promise<BrandContact[]>;
  getBrandContact(boothId: string): Promise<BrandContact | null>;
  /** 보낸 키만 바꾼다. 행이 없으면 만든다. 부스가 없으면 null.
   *  체크리스트는 토글을 기존 완료 시각에 합친다(`applyChecklist`). */
  upsertBrandContact(
    boothId: string,
    patch: BrandContactPatch,
    actor: string | null,
  ): Promise<BrandContact | null>;
  /** 최근 것 먼저(occurredAt 내림차순). */
  listBrandContactLogs(boothId: string): Promise<BrandContactLog[]>;
  /** 여러 부스의 기록을 한 번에(연락 현황 보드). 순서는 정하지 않는다. */
  listBrandContactLogsForBooths(boothIds: string[]): Promise<BrandContactLog[]>;

  // 연락의 목표 모양(스키마 정규화 초안 STEP 1) — 브랜드 연락처와 VOC, 출전 허락. 부스 없이 된다.
  // 운영은 STEP 1 적용 전까지 테이블이 없다 → hasParticipantOutreach()가 false고, 연락 보드는
  // 옛 brand_contact로 돌아간다(lib/brands/outreach-store.ts). 이 함수들은 그때 부르지 않는다.
  /** 목표 모양 테이블이 있나. mock은 늘 true. */
  hasParticipantOutreach(): Promise<boolean>;
  listParticipantPermissions(exhibitionId: string): Promise<ParticipantPermission[]>;
  /** 보낸 키만 바꾼다. 행이 없으면 만든다. 출전이 없으면 null. 체크리스트는 applyChecklist로 합친다. */
  upsertParticipantPermission(
    participantId: string,
    patch: ParticipantPermissionPatch,
    actor: string | null,
  ): Promise<ParticipantPermission | null>;
  listBrandOutreach(exhibitorIds: string[]): Promise<BrandOutreach[]>;
  /** 보낸 키만 바꾼다. 행이 없으면 만든다. 브랜드가 없으면 null. */
  upsertBrandOutreach(exhibitorId: string, patch: BrandOutreachPatch, actor: string | null): Promise<BrandOutreach | null>;
  /** 브랜드들의 VOC. 순서는 정하지 않는다. */
  listBrandOutreachLogs(exhibitorIds: string[]): Promise<BrandOutreachLog[]>;
  /** VOC 한 줄. 브랜드가 없으면 null. participantId는 그 브랜드의 출전이어야 한다. */
  addBrandOutreachLog(
    input: BrandContactLogInput & { exhibitorId: string; participantId?: string | null },
    actor: string | null,
  ): Promise<BrandOutreachLog | null>;
  /** VOC 한 줄 추가. 컨택 행이 없으면 빈 행을 먼저 만든다. 부스가 없으면 null. */
  addBrandContactLog(
    boothId: string,
    input: BrandContactLogInput,
    actor: string | null,
  ): Promise<BrandContactLog | null>;

  // 브랜드 프로필 칸(0061 brand_profile_field) — 운영자와 워커 전용, 서비스 롤.
  /** 인자 없으면 전부. exhibitorIds와 participantIds를 같이 주면 합집합. */
  listProfileFields(q?: { exhibitorIds?: string[]; participantIds?: string[] }): Promise<ProfileField[]>;
  /** 칸 하나를 통째로 쓴다(값, 출처, 상태). 값 검사는 호출부가 parseFieldValue로 먼저 한다.
   *  브랜드나 출전이 없으면 null. */
  upsertProfileField(input: {
    subject: ProfileSubject;
    field: string;
    value: unknown;
    sources: string[];
    status: ProfileFieldStatus;
    actor: string | null;
  }): Promise<ProfileField | null>;
  /**
   * 조건부 쓰기(compare-and-set). 워커처럼 읽고 → 오래 걸리는 일(LLM) → 쓰는 쪽이 쓴다.
   * `expected`는 읽을 때 본 그 칸의 상태와 updated_at이다(행이 없었으면 null).
   * DB에서 그 칸이 그대로일 때만 쓰고, 그사이 사람이 확인하거나 고쳤으면 아무것도 쓰지 않고
   * `changed`를 돌려준다. 브랜드나 출전이 없으면 `no-subject`.
   */
  upsertProfileFieldIfUnchanged(
    input: {
      subject: ProfileSubject;
      field: string;
      value: unknown;
      sources: string[];
      status: ProfileFieldStatus;
      actor: string | null;
    },
    expected: Pick<ProfileField, "status" | "updatedAt"> | null,
  ): Promise<{ ok: true; field: ProfileField } | { ok: false; reason: "changed" | "no-subject" }>;
  /** 칸을 비운다. 지운 행이 있었으면 true. */
  deleteProfileField(subject: ProfileSubject, field: string): Promise<boolean>;
  /** 이 부스(대표 배정)의 브랜드 공식 소개 칸. 방문객 화면이 부르므로 서비스 롤로 읽고,
   *  앱에 보일지(publicValue)는 호출부가 brandIntroFromField로 거른다. 없으면 null. */
  getBrandIntroFieldForBooth(boothId: string): Promise<ProfileField | null>;
  /** 부스 → 대표(primary) 참가와 브랜드. 배정 없는 부스는 빠진다. 실패는 throw. */
  listPrimaryBrandLinks(
    boothIds: string[],
  ): Promise<Record<string, { exhibitorId: string; participantId: string }>>;

  listEnrichmentCandidates(opts?: {
    exhibitionId?: string;
    boothId?: string;
    /** 여러 부스를 한 번에 — 초안기가 배치 대상의 지난 반려 사유를 모을 때 쓴다. */
    boothIds?: string[];
    status?: EnrichmentCandidate["status"];
    limit?: number;
  }): Promise<EnrichmentCandidate[]>;
  getEnrichmentCandidate(id: string): Promise<EnrichmentCandidate | null>;
  /** 게이트 규칙이 바뀐 뒤 점수를 다시 매긴다. LLM은 안 부른다. */
  regradeCandidate(
    id: string,
    confidence: number,
    issues: EnrichmentCandidate["issues"],
  ): Promise<void>;
  /** 이 부스들의 기존 pending 초안을 superseded로 내린다. 다시 돌릴 때마다 큐에
   *  같은 부스가 쌓이면 검수자가 무엇이 최신인지 모른다. */
  supersedePendingCandidates(boothIds: string[]): Promise<number>;
  /** 검수 결과 기록. 반영 자체는 upsertBoothEnrichment가 따로 한다. */
  setCandidateStatus(
    id: string,
    status: EnrichmentCandidate["status"],
    reviewedBy?: string | null,
    /** 왜 반려했나. 이게 없으면 반려는 한 비트만 남고 학습이 안 된다. */
    note?: string | null,
  ): Promise<void>;

  /** 잡을 큐에 넣는다. 같은 일을 두 번 넣지 않으려면 호출부가 dedupeKey를
   *  payload에 담고 먼저 조회한다 — 큐 자체는 중복을 막지 않는다. */
  enqueueJob(input: {
    type: string;
    payload?: Record<string, unknown>;
    runAfter?: string;
    maxAttempts?: number;
  }): Promise<Job>;
  /** 원자적으로 잡 하나를 집는다(SQL `for update skip locked`). 없으면 null.
   *  ⚠️ 애플리케이션 코드로 select→update 하면 워커 둘이 같은 잡을 집는다. */
  claimJob(worker: string, types?: string[]): Promise<Job | null>;
  /** 진행 표시 갱신. 오래 도는 잡이 살아 있는지 보려면 이게 움직여야 한다. */
  updateJobProgress(id: string, progress: Record<string, unknown>): Promise<void>;
  /** 성공/실패 마감. 실패는 재시도 여지가 있으면 다시 큐로 돌린다. */
  finishJob(
    id: string,
    outcome:
      | { ok: true; result?: Record<string, unknown> }
      | { ok: false; error: string; retryAfterMs?: number },
  ): Promise<void>;
  /** 죽은 워커가 들고 있던 잡을 큐로 되돌린다. 반환은 회수한 건수. */
  requeueStaleJobs(olderThan?: string): Promise<number>;
  listJobs(opts?: {
    status?: Job["status"];
    type?: string;
    limit?: number;
  }): Promise<Job[]>;

  // 아티클(0070) — 운영자와 워커 전용, 서비스 롤. 공개 API는 approved만 부른다.
  /** 최근 것 먼저(createdAt 내림차순). status를 주면 그 상태만. */
  listArticles(opts?: { status?: ArticleStatus[]; limit?: number }): Promise<Article[]>;
  getArticle(id: string): Promise<Article | null>;
  /** draft로 만든다. 같은 주제(subjectKey)의 draft나 approved가 이미 있으면 만들지 않고 null
   *  (DB의 부분 unique 인덱스와 같은 규칙). */
  createArticle(input: ArticleInput): Promise<Article | null>;
  /**
   * 승인 또는 반려. **draft일 때만** 바꾼다(compare-and-set) — 슬랙 버튼과 링크를 두 번
   * 눌러도, 둘이 동시에 와도 한 번만 바뀐다. 이미 결정된 행이면 그 행과 함께 not-draft.
   */
  decideArticle(
    id: string,
    decision: { status: "approved" | "rejected"; actor: string | null; reason?: string | null },
  ): Promise<
    | { ok: true; article: Article }
    | { ok: false; reason: "not-found" }
    | { ok: false; reason: "not-draft"; article: Article }
  >;

  /** 변경 이력 적재. **실패해도 도메인 쓰기를 막지 않는다**(loggedWrite) —
   *  900부스 인입이 이력 한 줄 때문에 통째로 멈추면 도구로서 못 쓴다. 대신
   *  실패는 반드시 에러 로그로 남는다. */
  recordChange(entry: ChangeEntry): Promise<void>;
  /** 이력 조회. entity·entityId·scopeId로 좁힌다. */
  listChanges(opts?: {
    entity?: string;
    entityId?: string;
    scopeId?: string;
    limit?: number;
  }): Promise<ChangeRecord[]>;

  upsertBoothEnrichment(
    boothId: string,
    input: BoothEnrichmentPatch,
    /** 누가·어디서 바꿨나. 없으면 이력이 안 남는다 — 호출부가 출처를 밝히게 한다. */
    audit?: AuditContext,
  ): Promise<void>;
  deleteBooth(id: string): Promise<boolean>;

  // categories / halls
  listCategories(exhibitionId: string): Promise<Category[]>;
  listHalls(exhibitionId: string): Promise<Hall[]>;
  /** 전시 인입이 파일에 적힌 이름으로 홀을 만든다. */
  createHall(exhibitionId: string, name: string): Promise<Hall>;
  /** 전시 인입이 카테고리를 만든다. slug은 전역 unique이고 booth.tags에 그대로
   *  들어가 추천 스코어링이 읽는 값이라 파일이 명시한 것만 쓴다. */
  createCategory(input: {
    slug: string;
    name: string;
    color?: string;
    icon?: string;
  }): Promise<Category>;

  // events
  listEvents(
    slug: string,
    opts?: { boothId?: string; from?: string; to?: string },
  ): Promise<BoothEvent[]>;
  createEvent(input: EventInput): Promise<BoothEvent>;
  updateEvent(
    id: string,
    input: Partial<EventInput>,
  ): Promise<BoothEvent | null>;
  deleteEvent(id: string): Promise<boolean>;

  // welcome kit
  getWelcomeKit(boothId: string): Promise<WelcomeKit | null>;
  upsertWelcomeKit(
    boothId: string,
    input: WelcomeKitInput,
  ): Promise<WelcomeKit>;

  // reviews
  listReviews(
    boothId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<Paginated<Review> & { summary: { count: number } }>;
  createReview(
    boothId: string,
    userId: string,
    input: ReviewInput,
  ): Promise<Review>;

  // sessions / preference
  createSession(exhibitionId: string): Promise<VisitorSession>;
  getSession(id: string): Promise<VisitorSession | null>;
  getPreference(sessionId: string): Promise<UserPreference | null>;
  savePreference(
    sessionId: string,
    input: UserPreferenceInput,
  ): Promise<UserPreference>;

  /** 부스 인기 히트맵. 동선(saved route) 제거로 소스가 없어져 현재는 빈 값 스텁.
   *  지도 히트맵·랭킹 crowd 신호가 소비하나 없으면 0으로 degrade. */
  boothHeatmap(exhibitionId: string): Promise<{
    booths: Record<string, number>;
    pairs: { from: string; to: string; count: number }[];
  }>;

  // AI 추천 쿼리 로그 (RAG / 트렌딩 키워드 추적)
  /** AI 추천 채팅창 입력 텍스트 + 추출 키워드를 적재. */
  logAiQuery(
    sessionId: string,
    exhibitionId: string,
    input: { text: string; keywords: string[] },
  ): Promise<void>;
  /** 전시별 누적 쿼리에서 자주 나온 키워드 상위 N개(빈도순). */
  topQueryKeywords(
    exhibitionId: string,
    limit?: number,
  ): Promise<{ keyword: string; count: number }[]>;

  // 오류/이슈 로그 (admin 모니터링)
  /** 서버 또는 클라이언트에서 발생한 오류 이벤트를 적재. 절대 throw하지 않는다 —
   *  로깅 실패가 원래 요청에 영향을 주면 안 된다. */
  logIssue(input: {
    source: "server" | "client";
    message: string;
    stack?: string;
    path?: string;
    digest?: string;
    userId?: string;
    sessionId?: string;
    context?: Record<string, unknown>;
    device?: string;
    country?: string;
    city?: string;
  }): Promise<void>;
  /** 오류 이벤트 최신순 조회(admin 전용). sinceDays를 주면 그 기간 안의 것만. */
  listIssues(opts?: {
    source?: "server" | "client";
    limit?: number;
    sinceDays?: number;
  }): Promise<IssueLog[]>;
  /** olderThanDays보다 오래된 로그를 지운다(admin 수동 정리). 반환값 = 삭제된 행 수. */
  deleteOldIssues(olderThanDays: number): Promise<number>;

  // L4 사용자 메모리 (원장 + 증류 브레인)
  /** 사용자 행동 신호를 원장에 append. 증류는 호출부(memory service)가 수행. */
  appendUserSignal(sig: Omit<UserSignal, "id" | "createdAt">): Promise<void>;
  /** 재증류 소스 — 사용자 신호 로그 조회(최신순). */
  listUserSignals(
    userId: string,
    opts?: { exhibitionId?: string; limit?: number } & AdminRead,
  ): Promise<UserSignal[]>;
  /** 전시 전체 사용자 신호 조회(관리자 타임라인용) — userId로 안 좁힘. */
  listExhibitionSignals(
    exhibitionId: string,
    opts?: { limit?: number },
  ): Promise<UserSignal[]>;
  /** 증류된 종단 브레인 조회. 없으면 null. */
  getUserBrain(userId: string, opts?: AdminRead): Promise<UserBrain | null>;
  /** 증류된 브레인 upsert. */
  saveUserBrain(brain: UserBrain): Promise<void>;
  /** 증류된 브레인 전체 — 취향 × 행동 교차(운영 콘솔)용. 브레인은 크로스-전시라
   *  전시로 좁히지 않는다. */
  listUserBrains(): Promise<UserBrain[]>;
  /** 이 전시에서 회고(관람 마치기 → VisitDigest)를 남긴 사용자 id 목록.
   *  여정 퍼널의 마지막 단계 소스. */
  listReflectedUserIds(exhibitionId: string): Promise<string[]>;

  // users (nickname + OAuth auth)
  createUser(nickname: string): Promise<User>;
  /** 계정 목록(관리자용, 최신 가입순). */
  listUsers(opts?: { limit?: number; offset?: number }): Promise<User[]>;
  /** 계정 삭제(관리자, 그리고 본인 DELETE /api/me). 존재 안 하면 false.
   *  노트, 신호, 브레인, 동선, 브랜드 하트, 기기 토큰을 지우고 오류 로그와 이벤트의
   *  계정 연결을 끊는다. auth.users는 지우지 않는다(라우트가 한다). */
  deleteUser(id: string): Promise<boolean>;
  /** 이 계정과 같은 사람인 Supabase auth 사용자 id들(uuid 모양만). 없으면 빈 배열. */
  getAuthUserIds(id: string): Promise<string[]>;
  getUser(id: string, opts?: AdminRead): Promise<User | null>;
  getUserByNickname(nickname: string): Promise<User | null>;
  /** 닉네임 변경(로그인 후 언제든) — 다른 계정이 이미 쓰는 닉네임이면 null.
   *  대소문자 무시 중복 검사는 호출부(route)가 getUserByNickname으로 먼저
   *  한다 — 여기선 그 확인이 끝났다는 전제로 단순 업데이트만 한다. */
  updateNickname(id: string, nickname: string): Promise<User | null>;
  /** Find an OAuth-linked account by provider identity, or null. */
  getUserByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<User | null>;
  /** Create an account linked to an OAuth identity (nickname pre-deduped). */
  createOAuthUser(identity: OAuthIdentity): Promise<User>;

  // booth notes (signed-in personal records)
  listNotes(userId: string): Promise<BoothNote[]>;
  upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
    /** 이 쓰기의 확신 등급. interest(must·curious·pass) 또는 verdict(good·ok·bad)를
     *  실제로 바꾸는 쓰기일 때만 값(해제면 null)을 준다. undefined면 저장소가 기존
     *  judged_class를 건드리지 않는다(메모·사진만 고치는 등 interest·verdict 자체가
     *  안 바뀌는 쓰기) — 그래야 메모만 고칠 때 이미 답한 판정이 조용히 지워지지 않는다. */
    judgedClass: "confident" | "uncertain" | null | undefined,
  ): Promise<BoothNote>;
  /** 특정 부스 id 목록에 해당하는 모든 사용자의 노트(admin 데이터 이슈 계산용). */
  listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]>;
  /** 내 노트에 부스, 박람회, 대표 브랜드를 붙여서(마이페이지, 내보내기). 실패는 throw. */
  listNotesWithContext(userId: string): Promise<NoteWithContext[]>;

  // push (0067) — 보내기는 아직 없다.
  /** 같은 토큰이면 한 줄을 고친다. userId는 이번 요청의 로그인 상태 그대로(없으면 null). */
  upsertPushDevice(input: {
    token: string;
    environment: "sandbox" | "production";
    userId: string | null;
    anonId?: string;
    appVersion?: string;
  }): Promise<PushDevice>;
  /** 이 기기 토큰을 끊는다(revoked_at). 없으면 false. */
  revokePushDevice(token: string): Promise<boolean>;

  // brand hearts (0068)
  listBrandHearts(userId: string): Promise<BrandHeart[]>;
  /** 이미 있으면 그 줄을 돌려준다. 없는 브랜드면 null. */
  addBrandHeart(userId: string, exhibitorId: string): Promise<BrandHeart | null>;
  removeBrandHeart(userId: string, exhibitorId: string): Promise<boolean>;
  /** 브랜드 이름(exhibitor.canonical_name). 없는 id는 빠진다. */
  getExhibitorNames(exhibitorIds: string[]): Promise<Record<string, string>>;
  /** 이 브랜드들의 참가 중 박람회가 아직 안 끝난 것(end_date >= today). 부스 없는 참가도 포함. */
  listUpcomingParticipations(exhibitorIds: string[], today: string): Promise<UpcomingParticipation[]>;
  /** 부스 하나(가벼운 조회 — 목록 컬럼 + enrichment). getBoothDetail과 달리
   *  리뷰·이벤트·웰컴키트는 안 읽는다. 반응 판정 시 확신도 대조에 쓴다. */
  getBooth(id: string): Promise<Booth | null>;
  /** 전시 스코프 취향 정확도. */
  /** N회차 정확도 곡선의 재료 — 전 사용자·전 전시의 판정 노트.
   *  루프 B의 유일한 증거라 전시로 좁히지 않는다. */
  listJudgmentsForCurve(): Promise<CurveInput[]>;

  getTasteAccuracy(
    userId: string,
    exhibitionId: string,
  ): Promise<TasteAccuracy>;
  /** verdict가 있는데 아직 방문 기록(visitedAt)이 없는 부스는 존재할 수 없다 — verdict
   *  자체가 방문 기록이다(judgment-vocabulary §3-3). 그래서 되묻기 대상은 오직
   *  "visitedAt은 있는데 verdict가 없는" 부스뿐이다(레거시 행 + 현장에서 안 누른 것).
   *  관람 마치기용, 최대 limit개. */
  listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]>;
  /** interest='must'로 찍어뒀는데 아직 안 간(visitedAt 없는) 부스 — 관람 마치기에서
   *  "여기 가봤어?"로 단정 없이 묻는 두 번째 되묻기 묶음(judgment-vocabulary §7-2).
   *  최대 limit개. */
  listMustNotVisited(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]>;
  /** Every visitor memo for booths in this exhibition (boothId + memo text).
   *  Powers crowd-sourced keyword extraction for onboarding. */
  listExhibitionNotes(
    exhibitionId: string,
  ): Promise<{ boothId: string; memo: string }[]>;

  // bookmarks
  listBookmarks(userId: string, opts?: AdminRead): Promise<Bookmark[]>;
  addBookmark(userId: string, input: BookmarkInput): Promise<Bookmark>;
  removeBookmark(userId: string, input: BookmarkInput): Promise<boolean>;

  // community
  listPosts(
    exhibitionId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<Paginated<CommunityPost>>;
  createPost(
    userId: string,
    exhibitionId: string,
    input: CommunityPostInput,
  ): Promise<CommunityPost>;
  getPost(id: string): Promise<CommunityPost | null>;
  /**
   * Delete a post only if it belongs to the given account. Returns whether a
   * row was removed, plus any attached media so the caller can clean it up.
   */
  deletePost(id: string, userId: string): Promise<DeletePostResult>;
  /**
   * Report a post for abuse. Deduped per reporter session. Once
   * REPORT_HIDE_THRESHOLD distinct sessions report it, listPosts hides it.
   */
  reportPost(
    postId: string,
    sessionId: string,
    reason?: string,
  ): Promise<ReportResult>;

  // public survey (/survey)
  /** 한 사람 한 행 — 같은 (surveyId, respondentId)면 덮어쓴다. */
  upsertSurveyResponse(input: {
    surveyId: string;
    respondentId: string;
    answers: Record<string, string | string[]>;
    comment?: string | null;
    durationMs?: number | null;
  }): Promise<SurveyResponse>;
  /** 관리자 집계용 전체 응답. 실패는 던진다(빈 배열로 위장하지 않는다). */
  listSurveyResponses(surveyId: string): Promise<SurveyResponse[]>;

  // analytics
  /** `userId`는 로그인 사용자 id. 취향 세그먼트 × 행동 교차 분석의 조인 키이므로
   *  로그인 상태면 반드시 함께 넘긴다(누락되면 소급 복구가 불가능하다). */
  recordAnalytics(
    sessionId: string,
    exhibitionId: string,
    input: AnalyticsEventInput,
    userId?: string | null,
  ): Promise<void>;
  analyticsHeatmap(
    exhibitionId: string,
  ): Promise<{ x: number; y: number; weight: number }[]>;
  analyticsPopular(
    exhibitionId: string,
    limit?: number,
  ): Promise<
    { boothId: string; name: string; views: number; arrivals: number }[]
  >;
  analyticsFlow(
    exhibitionId: string,
  ): Promise<{ from: string; to: string; count: number }[]>;
  analyticsConversion(
    exhibitionId: string,
  ): Promise<{ stage: string; count: number; rate: number }[]>;
  _allAnalytics?(exhibitionId: string): Promise<AnalyticsEvent[]>;
  /** 이름 붙은 앱 이벤트 묶음(0066). event_id가 이미 있으면 건너뛴다. 텔레메트리라 실패는
   *  로그만 남긴다(화면을 막지 않는다). */
  recordAppEvents(rows: AppEventRow[]): Promise<void>;
}
