import type { AuditContext, ChangeEntry } from "@/lib/audit/diff";
import { diffFields } from "@/lib/audit/diff";
import { AUDIT_SPECS } from "@/lib/audit/entities";
import type { CurveInput } from "@/lib/memory/learning-curve";
import { uid } from "@/lib/utils";
import { computeJourneyFunnel } from "@/lib/admin/journey-funnel";
import { computeFlowEdges } from "@/lib/admin/flow";
import { REPORT_HIDE_THRESHOLD } from "@/lib/constants";
import { deriveValueTags } from "@/lib/values/derive";
import {
  createBearerClient,
  createServerClient,
  createServiceClient,
  getRequestBearerToken,
} from "@/lib/supabase/server";
import { computeTasteAccuracy, type TasteAccuracy } from "@/lib/memory/taste";
import type {
  AdminRead,
  ListBoothQuery,
  Repository,
} from "@/lib/repositories/types";
import type {
  AnalyticsEvent,
  AnalyticsType,
  Booth,
  BoothListItem,
  BoothDetail,
  BoothEnrichment,
  BoothValueTag,
  BoothEvent,
  Bookmark,
  BookmarkTarget,
  BoothNote,
  Category,
  ChangeRecord,
  EnrichmentCandidate,
  Job,
  CommunityPost,
  DeletePostResult,
  ReportResult,
  CompanionType,
  Exhibition,
  ExhibitionDetail,
  ExhibitionTips,
  Hall,
  IssueLog,
  MovementPreference,
  Paginated,
  Review,
  RouteLeg,
  RoutePlan,
  RouteStatus,
  SharedRoute,
  User,
  OAuthIdentity,
  SignalKind,
  UserBrain,
  UserPreference,
  UserSignal,
  VisitDigest,
  VisitPurpose,
  VisitorSession,
  WelcomeKit,
} from "@/lib/types";
import type {
  AnalyticsEventInput,
  BookmarkInput,
  BoothEnrichmentPatch,
  BoothInput,
  BoothNoteInput,
  CommunityPostInput,
  EventInput,
  ExhibitionInput,
  ReviewInput,
  RoutePatch,
  RoutePublishInput,
  UserPreferenceInput,
  WelcomeKitInput,
} from "@/lib/schemas";

type SupabaseClient = Awaited<ReturnType<typeof createServerClient>>;
type Row = Record<string, unknown>;

function now(): string {
  return new Date().toISOString();
}

/**
 * 쓰기 결과 게이트. PostgREST는 실패해도 예외를 던지지 않고 `{ data: null, error }`를
 * 돌려주므로, error를 안 보면 실패가 조용히 성공으로 위장된다(FK 위반·스키마 드리프트가
 * 201 응답으로 나가고 로그에도 안 남는다). 도메인 쓰기는 전부 이걸 통과시킨다.
 */
type WriteResult<T> = {
  data: T | null;
  error: { message: string; code?: string } | null;
};

/** 대상 행이 없을 수 있는 쓰기(update/delete). 에러만 던지고 미매치는 null. */
/** PostgREST의 `.in()`은 값을 전부 URL에 담는다. 전시 하나치 부스 id(서울일러스트
 *  레이션페어는 914개)를 한 번에 넣으면 요청 URL이 10KB에 가까워져 길이 상한에
 *  걸리는데, **실패해도 예외가 아니라 data:null로 돌아오므로 `?? []`가 그걸 "0건"
 *  으로 위장한다.** 쓰기의 wrote() 게이트가 막는 것과 같은 종류의 침묵이다.
 *
 *  나눠서 부르고 합친다. 그리고 어느 조각이든 에러면 던진다 — 조용히 비는 것보다
 *  시끄럽게 실패하는 편이 낫다. enrichment가 조용히 비면 로미의 근거 카드가
 *  통째로 사라지고, 인입은 그걸 "빈 칸"으로 오해해 사람이 쓴 값을 덮어쓴다. */
const IN_CHUNK = 200;
async function inChunks<T>(
  ids: string[],
  what: string,
  run: (slice: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
): Promise<T[]> {
  if (ids.length === 0) return [];
  const slices: string[][] = [];
  for (let i = 0; i < ids.length; i += IN_CHUNK) {
    slices.push(ids.slice(i, i + IN_CHUNK));
  }
  // 병렬 — 순차로 돌리면 부스 900개짜리 전시에서 왕복이 5번 쌓여 방문객 지도가
  // 그만큼 느려진다(측정: 342ms → 812ms). 조각끼리 의존이 없으니 같이 던진다.
  const results = await Promise.all(slices.map((slice) => run(slice)));
  const out: T[] = [];
  for (const [i, { data, error }] of results.entries()) {
    if (error) {
      throw new Error(
        `${what} 조회 실패(조각 ${i + 1}/${slices.length}, ${ids.length}건 중): ${String(
          (error as { message?: string })?.message ?? error,
        )}`,
      );
    }
    out.push(...(data ?? []));
  }
  return out;
}

function maybeWrote<T>(res: WriteResult<T>, what: string): T | null {
  if (res.error) {
    throw new Error(
      `${what} 실패: ${res.error.message}${res.error.code ? ` (${res.error.code})` : ""}`,
    );
  }
  return res.data;
}

/** 반드시 행이 남아야 하는 쓰기(insert/upsert). */
function wrote<T>(res: WriteResult<T>, what: string): T {
  const data = maybeWrote(res, what);
  if (data == null) throw new Error(`${what} 실패: 저장된 행이 없습니다`);
  return data;
}

/**
 * 텔레메트리 전용. 유실돼도 사용자 요청을 깨뜨리진 않지만, `wrote`와 달리 조용히 넘기지
 * 않고 반드시 흔적을 남긴다.
 */
function loggedWrite(
  res: { error: { message: string } | null },
  what: string,
): void {
  if (res.error) console.error(`[repo] ${what} 실패: ${res.error.message}`);
}

// snake_case 키셋 페이지네이션. MockRepository.paginate 와 동일 의미.
function paginate<T extends { id: string }>(
  items: T[],
  cursor?: string,
  limit = 50,
): Paginated<T> {
  const start = cursor ? items.findIndex((i) => i.id === cursor) + 1 : 0;
  const slice = items.slice(start, start + limit);
  const nextCursor =
    start + limit < items.length ? (slice[slice.length - 1]?.id ?? null) : null;
  return { data: slice, nextCursor };
}

// --- row → 도메인 매퍼 ------------------------------------------------------

function str(v: unknown): string {
  return v == null ? "" : String(v);
}
/** Nullable text column → string | undefined (keeps optional fields absent). */
function optStr(v: unknown): string | undefined {
  return v == null || v === "" ? undefined : String(v);
}
function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map((x) => String(x)) : [];
}

/** booth_enrichment 행 → BoothEnrichment(굿즈/요약/팁 + 근거 카드 저작 필드). */
function mapEnrichment(e: Row): BoothEnrichment {
  const und = (v: unknown) => (v == null ? undefined : String(v));
  const valueTags = Array.isArray(e.value_tags)
    ? (e.value_tags as Record<string, unknown>[]).map((v): BoothValueTag => ({
        slug: String(v.slug),
        strength: Number(v.strength) || 0,
      }))
    : undefined;
  const reasons =
    e.recommendation_reasons && typeof e.recommendation_reasons === "object"
      ? (e.recommendation_reasons as Record<string, string>)
      : undefined;
  return {
    goodsKeywords: strArr(e.goods_keywords),
    themeTags: strArr(e.theme_tags),
    summary: und(e.summary),
    tips: und(e.tips),
    sourceUrl: und(e.source_url),
    valueTags: valueTags?.length ? valueTags : undefined,
    roamInterpretation: und(e.roam_interpretation),
    recommendationReasons:
      reasons && Object.keys(reasons).length ? reasons : undefined,
    thingsToDo: strArr(e.things_to_do).length
      ? strArr(e.things_to_do)
      : undefined,
    timing: strArr(e.timing).length ? strArr(e.timing) : undefined,
    memoryHooks: strArr(e.memory_hooks).length
      ? strArr(e.memory_hooks)
      : undefined,
    conversationPrompts: strArr(e.conversation_prompts).length
      ? strArr(e.conversation_prompts)
      : undefined,
    confidence: und(e.confidence) as BoothEnrichment["confidence"],
  };
}

/** enrichment을 부스에 붙이고 가치 태그를 재파생(수동 valueTags 우선). */
function attachEnrichment(booth: BoothListItem, e: Row): void {
  booth.enrichment = mapEnrichment(e);
  booth.valueTags = deriveValueTags({
    categorySlugs: booth.tags,
    goodsKeywords: booth.enrichment.goodsKeywords,
    tips: booth.enrichment.tips,
    manual: booth.enrichment.valueTags,
  });
}

function mapExhibition(r: Row): Exhibition {
  return {
    id: str(r.id),
    slug: str(r.slug),
    name: str(r.name),
    venue: str(r.venue),
    description: str(r.description),
    startDate: str(r.start_date),
    endDate: str(r.end_date),
    coverImageUrl:
      r.cover_image_url == null ? undefined : String(r.cover_image_url),
    mapImageUrl: r.map_image_url == null ? undefined : String(r.map_image_url),
    mapWidth: num(r.map_width),
    mapHeight: num(r.map_height),
    tips: (r.tips ?? {}) as ExhibitionTips,
    organizerId: r.organizer_id == null ? undefined : String(r.organizer_id),
    createdAt: str(r.created_at),
  };
}

function mapHall(r: Row): Hall {
  return {
    id: str(r.id),
    exhibitionId: str(r.exhibition_id),
    name: str(r.name),
    floor: num(r.floor),
    sort: num(r.sort),
  };
}

function mapCategory(r: Row): Category {
  return {
    id: str(r.id),
    slug: str(r.slug),
    name: str(r.name),
    color: str(r.color),
    icon: str(r.icon),
  };
}

// Columns needed to render a booth in lists / on the map / for recommendation —
// everything EXCEPT the heavy detail-only fields (long_description, images).
// Those load only on the booth detail (getBoothDetail), so list/map queries stay
// lean. mapBooth defaults the omitted fields to "" / [].
const BOOTH_LIST_COLS =
  "id,exhibition_id,hall_id,category_id,code,kind,name,company,aliases,description,logo_url,instagram_url,website_url,tags,x,y,popularity,created_at";

function mapJob(r: Row): Job {
  return {
    id: str(r.id),
    type: str(r.type),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    status: str(r.status) as Job["status"],
    runAfter: str(r.run_after),
    attempts: num(r.attempts),
    maxAttempts: num(r.max_attempts),
    lastError: r.last_error == null ? null : String(r.last_error),
    claimedBy: r.claimed_by == null ? null : String(r.claimed_by),
    claimedAt: r.claimed_at == null ? null : String(r.claimed_at),
    progress: (r.progress ?? {}) as Record<string, unknown>,
    result: (r.result ?? null) as Record<string, unknown> | null,
    createdAt: str(r.created_at),
    finishedAt: r.finished_at == null ? null : String(r.finished_at),
  };
}

function mapCandidate(r: Row): EnrichmentCandidate {
  return {
    id: str(r.id),
    boothId: str(r.booth_id),
    exhibitionId: str(r.exhibition_id),
    source: str(r.source),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    sources: (r.sources ?? []) as EnrichmentCandidate["sources"],
    confidence: num(r.confidence),
    issues: (r.issues ?? []) as EnrichmentCandidate["issues"],
    status: str(r.status) as EnrichmentCandidate["status"],
    reviewedAt: r.reviewed_at == null ? null : String(r.reviewed_at),
    reviewedBy: r.reviewed_by == null ? null : String(r.reviewed_by),
    reviewNote: r.review_note == null ? null : String(r.review_note),
    createdAt: str(r.created_at),
  };
}

/** 목록 조회 결과 매핑 — 안 가져온 두 컬럼을 **빈 값으로 지어내지 않고 뺀다.**
 *  전엔 mapBooth가 strArr(undefined)→[] 로 채워서 "값이 비었다"처럼 보였다. */
function mapBoothListItem(r: Row): BoothListItem {
  const { images: _images, longDescription: _long, ...rest } = mapBooth(r);
  return rest;
}

function mapBooth(r: Row): Booth {
  const tags = strArr(r.tags);
  return {
    id: str(r.id),
    exhibitionId: str(r.exhibition_id),
    hallId: str(r.hall_id),
    categoryId: str(r.category_id),
    code: r.code == null ? undefined : String(r.code),
    kind: r.kind === "facility" ? "facility" : "exhibitor",
    name: str(r.name),
    company: str(r.company),
    aliases: r.aliases == null ? undefined : strArr(r.aliases),
    description: str(r.description),
    longDescription: str(r.long_description),
    images: strArr(r.images),
    logoUrl: r.logo_url == null ? undefined : String(r.logo_url),
    instagramUrl: r.instagram_url == null ? undefined : String(r.instagram_url),
    websiteUrl: r.website_url == null ? undefined : String(r.website_url),
    tags,
    // 가치 태그: DB 컬럼 없이 분야 tags에서 read 시 파생(seed 재생성 회피).
    // enrichment 있는 상세(getBoothDetail)는 굿즈·팁까지 반영해 더 풍부.
    valueTags: deriveValueTags({ categorySlugs: tags }),
    x: num(r.x),
    y: num(r.y),
    popularity: num(r.popularity),
    createdAt: str(r.created_at),
  };
}

function mapEvent(r: Row): BoothEvent {
  return {
    id: str(r.id),
    boothId: str(r.booth_id),
    title: str(r.title),
    description: str(r.description),
    startTime: str(r.start_time),
    endTime: str(r.end_time),
    rewardInfo: r.reward_info == null ? undefined : String(r.reward_info),
    capacity: r.capacity == null ? undefined : num(r.capacity),
    tag: r.tag == null ? undefined : String(r.tag),
    subtitle: r.subtitle == null ? undefined : String(r.subtitle),
    speaker: r.speaker == null ? undefined : String(r.speaker),
    standing: r.standing === true,
  };
}

function mapWelcomeKit(r: Row): WelcomeKit {
  return {
    boothId: str(r.booth_id),
    enabled: Boolean(r.enabled),
    name: str(r.name),
    description: str(r.description),
    imageUrl: r.image_url == null ? undefined : String(r.image_url),
    remainingCount: num(r.remaining_count),
  };
}

function mapReview(r: Row): Review {
  return {
    id: str(r.id),
    boothId: str(r.booth_id),
    sessionId: str(r.session_id),
    comment: str(r.comment),
    authorName: str(r.author_name),
    createdAt: str(r.created_at),
  };
}

function mapSession(r: Row): VisitorSession {
  return {
    id: str(r.id),
    exhibitionId: str(r.exhibition_id),
    createdAt: str(r.created_at),
    lastSeenAt: str(r.last_seen_at),
  };
}

function mapPreference(r: Row): UserPreference {
  return {
    sessionId: str(r.session_id),
    visitPurposes: (Array.isArray(r.visit_purposes)
      ? r.visit_purposes
      : []) as VisitPurpose[],
    interests: strArr(r.interests),
    availableMinutes: num(r.available_minutes),
    movementPreference: str(r.movement_preference) as MovementPreference,
    companionType: str(r.companion_type) as CompanionType,
    updatedAt: str(r.updated_at),
  };
}

function mapRoute(r: Row): RoutePlan {
  return {
    id: str(r.id),
    sessionId: str(r.session_id),
    userId: r.user_id == null ? undefined : String(r.user_id),
    exhibitionId: str(r.exhibition_id),
    boothIds: strArr(r.booth_ids),
    estimatedMinutes: num(r.estimated_minutes),
    legs: (Array.isArray(r.legs) ? r.legs : []) as RouteLeg[],
    scores: (r.scores ?? {}) as Record<string, number>,
    status: str(r.status) as RouteStatus,
    currentBoothId:
      r.current_booth_id == null ? undefined : String(r.current_booth_id),
    visitedBoothIds: strArr(r.visited_booth_ids),
    title: r.title == null ? undefined : String(r.title),
    isPublic: Boolean(r.is_public),
    shareId: r.share_id == null ? undefined : String(r.share_id),
    createdAt: str(r.created_at),
  };
}

function mapUser(r: Row): User {
  return {
    id: str(r.id),
    nickname: str(r.nickname),
    createdAt: str(r.created_at),
    provider: optStr(r.provider),
    email: optStr(r.email),
    avatarUrl: optStr(r.avatar_url),
  };
}

function mapIssueLog(r: Row): IssueLog {
  return {
    id: str(r.id),
    source: String(r.source) as IssueLog["source"],
    message: str(r.message),
    stack: r.stack == null ? undefined : str(r.stack),
    path: r.path == null ? undefined : str(r.path),
    digest: r.digest == null ? undefined : str(r.digest),
    userId: r.user_id == null ? undefined : str(r.user_id),
    sessionId: r.session_id == null ? undefined : str(r.session_id),
    context: (r.context as Record<string, unknown> | null) ?? undefined,
    device: r.device == null ? undefined : str(r.device),
    country: r.country == null ? undefined : str(r.country),
    city: r.city == null ? undefined : str(r.city),
    createdAt: str(r.created_at),
  };
}

function mapNote(r: Row): BoothNote {
  return {
    userId: str(r.user_id),
    boothId: str(r.booth_id),
    interest:
      r.interest == null
        ? undefined
        : (String(r.interest) as BoothNote["interest"]),
    verdict:
      r.verdict == null
        ? undefined
        : (String(r.verdict) as BoothNote["verdict"]),
    visitedAt: r.visited_at == null ? undefined : str(r.visited_at),
    judgedClass:
      r.judged_class == null
        ? undefined
        : (String(r.judged_class) as BoothNote["judgedClass"]),
    memo: r.memo == null ? undefined : String(r.memo),
    photos: Array.isArray(r.photos) ? r.photos.map(String) : undefined,
    updatedAt: str(r.updated_at),
  };
}

function mapBookmark(r: Row): Bookmark {
  return {
    id: str(r.id),
    userId: str(r.user_id),
    targetType: str(r.target_type) as BookmarkTarget,
    targetId: str(r.target_id),
    createdAt: str(r.created_at),
  };
}

function mapPost(r: Row): CommunityPost {
  return {
    id: str(r.id),
    exhibitionId: str(r.exhibition_id),
    sessionId: str(r.session_id),
    authorName: str(r.author_name),
    body: str(r.body),
    boothId: r.booth_id == null ? undefined : String(r.booth_id),
    mediaUrl: r.media_url == null ? undefined : String(r.media_url),
    mediaType:
      r.media_type === "image" || r.media_type === "video"
        ? r.media_type
        : undefined,
    mediaPublicId:
      r.media_public_id == null ? undefined : String(r.media_public_id),
    createdAt: str(r.created_at),
  };
}

function mapAnalytics(r: Row): AnalyticsEvent {
  return {
    id: str(r.id),
    sessionId: str(r.session_id),
    userId: r.user_id == null ? undefined : String(r.user_id),
    exhibitionId: str(r.exhibition_id),
    type: str(r.type) as AnalyticsType,
    boothId: r.booth_id == null ? undefined : String(r.booth_id),
    x: r.x == null ? undefined : num(r.x),
    y: r.y == null ? undefined : num(r.y),
    meta: r.meta == null ? undefined : (r.meta as Record<string, unknown>),
    createdAt: str(r.created_at),
  };
}

// --- 도메인 input → row (snake_case) ---------------------------------------

function exhibitionToRow(input: Partial<ExhibitionInput>): Row {
  const row: Row = {};
  if (input.slug !== undefined) row.slug = input.slug;
  if (input.name !== undefined) row.name = input.name;
  if (input.venue !== undefined) row.venue = input.venue;
  if (input.description !== undefined) row.description = input.description;
  if (input.startDate !== undefined) row.start_date = input.startDate;
  if (input.endDate !== undefined) row.end_date = input.endDate;
  if (input.coverImageUrl !== undefined)
    row.cover_image_url = input.coverImageUrl;
  if (input.mapImageUrl !== undefined) row.map_image_url = input.mapImageUrl;
  if (input.mapWidth !== undefined) row.map_width = input.mapWidth;
  if (input.mapHeight !== undefined) row.map_height = input.mapHeight;
  if (input.tips !== undefined) row.tips = input.tips;
  return row;
}

function boothToRow(input: Partial<BoothInput>): Row {
  const row: Row = {};
  if (input.exhibitionId !== undefined) row.exhibition_id = input.exhibitionId;
  if (input.hallId !== undefined) row.hall_id = input.hallId;
  if (input.categoryId !== undefined) row.category_id = input.categoryId;
  if (input.code !== undefined) row.code = input.code;
  if (input.kind !== undefined) row.kind = input.kind;
  if (input.name !== undefined) row.name = input.name;
  if (input.company !== undefined) row.company = input.company;
  if (input.description !== undefined) row.description = input.description;
  if (input.longDescription !== undefined)
    row.long_description = input.longDescription;
  if (input.images !== undefined) row.images = input.images;
  if (input.logoUrl !== undefined) row.logo_url = input.logoUrl;
  if (input.instagramUrl !== undefined) row.instagram_url = input.instagramUrl;
  if (input.websiteUrl !== undefined) row.website_url = input.websiteUrl;
  if (input.tags !== undefined) row.tags = input.tags;
  if (input.x !== undefined) row.x = input.x;
  if (input.y !== undefined) row.y = input.y;
  if (input.popularity !== undefined) row.popularity = input.popularity;
  return row;
}

function eventToRow(input: Partial<EventInput>): Row {
  const row: Row = {};
  if (input.boothId !== undefined) row.booth_id = input.boothId;
  if (input.title !== undefined) row.title = input.title;
  if (input.description !== undefined) row.description = input.description;
  if (input.startTime !== undefined) row.start_time = input.startTime;
  if (input.endTime !== undefined) row.end_time = input.endTime;
  if (input.rewardInfo !== undefined) row.reward_info = input.rewardInfo;
  if (input.capacity !== undefined) row.capacity = input.capacity;
  return row;
}

export class SupabaseRepository implements Repository {
  readonly mode = "supabase" as const;

  /**
   * 기본은 anon 키다 — 방문객 요청은 Supabase JWT 브릿지로 세션을 달고 오므로
   * 0041의 owner-scoped RLS가 "자기 것만"을 지켜준다. 그 방어선은 그대로 둔다.
   *
   * asAdmin은 그 반대편이다. 운영 콘솔은 Supabase Auth 세션이 아니라 자체 코드
   * 게이트(requireAdmin)라 auth.uid()가 null이고, 0041 이후 app_user·booth_note·
   * user_signal_log·user_brain을 anon으로 읽으면 정책이 아무것도 매칭하지 못해
   * **에러 없이 0행**이 돌아온다(analytics_event는 애초에 select 정책이 없다).
   * PostgREST가 이걸 실패로 안 던지고 `data ?? []`가 흡수하는 탓에 관리자 화면이
   * "데이터가 전부 사라진 것처럼" 비었다 — 쓰기 쪽 wrote() 규약과 같은 함정이다.
   * 인가는 라우트에서 이미 끝났으니 그 뒤 읽기는 RLS 대신 이 클라이언트로 한다.
   */
  private async db(asAdmin = false): Promise<SupabaseClient> {
    if (asAdmin) return createServiceClient();
    // iOS는 Supabase 세션을 쿠키가 아니라 Bearer 헤더로 들고 온다 — 그 토큰으로
    // 접근해야 auth.uid()가 풀려 owner-scoped RLS가 의도대로 통과한다(안 그러면
    // 에러 없이 0행). 웹(쿠키 세션)은 기존 경로 그대로.
    const bearer = await getRequestBearerToken();
    return bearer ? createBearerClient(bearer) : createServerClient();
  }

  // --- exhibitions ---------------------------------------------------------

  async listExhibitions(opts?: {
    cursor?: string;
    limit?: number;
  }): Promise<Paginated<Exhibition>> {
    const db = await this.db();
    const { data } = await db
      .from("exhibition")
      .select("*")
      .order("id", { ascending: true });
    const list = (data ?? []).map(mapExhibition);
    return paginate(list, opts?.cursor, opts?.limit);
  }

  async getExhibition(slug: string): Promise<ExhibitionDetail | null> {
    const db = await this.db();
    const { data: ex } = await db
      .from("exhibition")
      .select("*")
      .eq("slug", slug)
      .maybeSingle();
    if (!ex) return null;
    const exhibition = mapExhibition(ex as Row);
    const { data: halls } = await db
      .from("hall")
      .select("*")
      .eq("exhibition_id", exhibition.id)
      .order("sort", { ascending: true });
    // 멀티 전시: 카테고리는 전역 테이블이라 이 전시 부스가 실제 쓰는 것만 노출
    // (다른 전시 카테고리가 온보딩·필터에 새는 것 방지). MockRepository와 동일.
    const [{ data: categories }, { data: boothCats }] = await Promise.all([
      db.from("category").select("*"),
      db.from("booth").select("category_id").eq("exhibition_id", exhibition.id),
    ]);
    const usedCatIds = new Set(
      (boothCats ?? []).map((r) => (r as { category_id: string }).category_id),
    );
    return {
      exhibition,
      halls: (halls ?? []).map(mapHall),
      categories: (categories ?? [])
        .map(mapCategory)
        .filter((c) => usedCatIds.has(c.id)),
    };
  }

  async getExhibitionIdBySlug(slug: string): Promise<string | null> {
    const db = await this.db();
    const { data } = await db
      .from("exhibition")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    return (data as { id: string } | null)?.id ?? null;
  }

  // 전시 쓰기 3종도 admin 콘솔 전용 — createBooth 주석과 같은 이유로 서비스 롤.
  async createExhibition(input: ExhibitionInput): Promise<Exhibition> {
    const db = createServiceClient();
    const row = {
      id: uid("exh"),
      created_at: now(),
      ...exhibitionToRow(input),
    };
    const res = await db.from("exhibition").insert(row).select("*").single();
    return mapExhibition(wrote(res, "전시 생성") as Row);
  }

  async updateExhibition(
    id: string,
    input: Partial<ExhibitionInput>,
  ): Promise<Exhibition | null> {
    const db = createServiceClient();
    const res = await db
      .from("exhibition")
      .update(exhibitionToRow(input))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = maybeWrote(res, "전시 수정");
    return data ? mapExhibition(data as Row) : null;
  }

  async deleteExhibition(id: string): Promise<boolean> {
    const db = createServiceClient();
    const { error, count } = await db
      .from("exhibition")
      .delete({ count: "exact" })
      .eq("id", id);
    return !error && (count ?? 0) > 0;
  }

  // --- booths --------------------------------------------------------------

  async listBooths(
    slug: string,
    query?: ListBoothQuery,
  ): Promise<Paginated<BoothListItem>> {
    const db = await this.db();
    const { data: ex } = await db
      .from("exhibition")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!ex) return { data: [], nextCursor: null };
    const exId = String((ex as Row).id);
    let q = db.from("booth").select(BOOTH_LIST_COLS).eq("exhibition_id", exId);
    if (query?.hallId) q = q.eq("hall_id", query.hallId);
    if (query?.categoryId) q = q.eq("category_id", query.categoryId);
    // 검색은 서버(ilike)로 — 부스가 많으면(예: SIF 913) fetch-all 후 JS 필터는
    // PostgREST 기본 row 제한에 걸려 일부만 걸러진다. 이름·상호를 DB에서 직접 매칭.
    if (query?.q) {
      // PostgREST .or() 안의 ilike 와일드카드는 %가 아니라 * (raw 필터 문법).
      // 필터 구분자를 깨는 문자는 공백 처리.
      const term = query.q.replace(/[%*,()]/g, " ").trim();
      if (term) q = q.or(`name.ilike.*${term}*,company.ilike.*${term}*`);
    }
    const { data } = await q;
    const list = (data ?? [])
      .map(mapBooth)
      .sort((a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id));
    return paginate(list, query?.cursor, query?.limit);
  }

  async listBoothsByExhibitionId(
    exhibitionId: string,
  ): Promise<BoothListItem[]> {
    const db = await this.db();
    const { data } = await db
      .from("booth")
      .select(BOOTH_LIST_COLS)
      .eq("exhibition_id", exhibitionId);
    const booths = (data ?? []).map(mapBoothListItem);
    // 근거 카드·추천에 쓰이는 enrichment를 한 번에 join해 붙인다(피드 경로).
    const enrichRows = await inChunks<Row>(
      booths.map((b) => b.id),
      "부스 저작 정보",
      (slice) =>
        db.from("booth_enrichment").select("*").in("booth_id", slice),
    );
    const byId = new Map(
      enrichRows.map((e) => [String(e.booth_id), e]),
    );
    for (const b of booths) {
      const e = byId.get(b.id);
      if (e) attachEnrichment(b, e);
    }
    return booths;
  }

  async listBoothsFull(exhibitionId: string): Promise<Booth[]> {
    const db = await this.db();
    // select("*") — BOOTH_LIST_COLS는 images·long_description을 뺀다. 인입이
    // 그걸로 읽으면 그 두 필드를 늘 빈 칸으로 보고 조용히 덮어쓴다.
    const { data, error } = await db
      .from("booth")
      .select("*")
      .eq("exhibition_id", exhibitionId);
    if (error) throw new Error(`인입용 부스 조회 실패: ${error.message}`);
    const booths = (data ?? []).map(mapBooth);
    const enrichRows = await inChunks<Row>(
      booths.map((b) => b.id),
      "부스 저작 정보",
      (slice) => db.from("booth_enrichment").select("*").in("booth_id", slice),
    );
    const byId = new Map(enrichRows.map((e) => [String(e.booth_id), e]));
    for (const b of booths) {
      const e = byId.get(b.id);
      if (e) attachEnrichment(b, e);
    }
    return booths;
  }

  async getBoothDetail(id: string): Promise<BoothDetail | null> {
    const db = await this.db();
    const { data: boothRow } = await db
      .from("booth")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    if (!boothRow) return null;
    const booth = mapBooth(boothRow as Row);
    // category / reviews / welcome kit / events are independent once we have the
    // booth — fetch them together (one round-trip wall-clock) instead of four
    // sequential queries, which made the booth detail noticeably slow to open.
    const [
      { data: catRow },
      { data: reviewRows },
      { data: kitRow },
      { data: eventRows },
      { data: enrichRow },
    ] = await Promise.all([
      db.from("category").select("*").eq("id", booth.categoryId).maybeSingle(),
      db.from("review").select("*").eq("booth_id", id),
      db.from("welcome_kit").select("*").eq("booth_id", id).maybeSingle(),
      db.from("event").select("*").eq("booth_id", id),
      db.from("booth_enrichment").select("*").eq("booth_id", id).maybeSingle(),
    ]);

    // 수동 주입 추가정보(있으면)를 부스에 붙여 상세에서 노출 + 가치 태그 재파생.
    if (enrichRow) attachEnrichment(booth, enrichRow as Row);

    const reviews = (reviewRows ?? [])
      .map(mapReview)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const count = reviews.length;
    return {
      booth,
      category: mapCategory((catRow ?? {}) as Row),
      welcomeKit: kitRow ? mapWelcomeKit(kitRow as Row) : undefined,
      events: (eventRows ?? [])
        .map(mapEvent)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      reviews,
      reviewSummary: { count },
    };
  }

  // 부스 쓰기 3종은 관리자 콘솔 전용(호출부는 /api/booths·[id] 뿐, requireAdmin으로
  // 이미 서버측 인가를 마친다) — anon 키(this.db())가 아니라 서비스 롤로 쓴다.
  // anon 키로 쓰면 booth 테이블 RLS가 방문객 세션엔 쓰기를 안 줘서 조용히 0행으로
  // 끝나고(PostgREST는 그걸 에러로 안 던진다), 위 update가 null을 돌려줘 라우트가
  // "부스를 못 찾음"으로 오인해 404를 냈다(createServiceClient 주석 참고).
  async createHall(exhibitionId: string, name: string): Promise<Hall> {
    const db = createServiceClient();
    const { count } = await db
      .from("hall")
      .select("id", { count: "exact", head: true })
      .eq("exhibition_id", exhibitionId);
    const res = await db
      .from("hall")
      .insert({
        id: uid("hall"),
        exhibition_id: exhibitionId,
        name,
        floor: 1,
        sort: count ?? 0,
      })
      .select("*")
      .single();
    const r = wrote(res, "홀 생성") as Row;
    return {
      id: str(r.id),
      exhibitionId: str(r.exhibition_id),
      name: str(r.name),
      floor: num(r.floor),
      sort: num(r.sort),
    };
  }

  async createCategory(input: {
    slug: string;
    name: string;
    color?: string;
    icon?: string;
  }): Promise<Category> {
    const db = createServiceClient();
    const res = await db
      .from("category")
      .insert({
        id: uid("cat"),
        slug: input.slug,
        name: input.name,
        color: input.color ?? "#6b7280",
        icon: input.icon ?? "tag",
      })
      .select("*")
      .single();
    const r = wrote(res, "카테고리 생성") as Row;
    return {
      id: str(r.id),
      slug: str(r.slug),
      name: str(r.name),
      color: str(r.color),
      icon: str(r.icon),
    };
  }

  async createBooth(input: BoothInput): Promise<Booth> {
    const db = createServiceClient();
    const row = { id: uid("booth"), created_at: now(), ...boothToRow(input) };
    const res = await db.from("booth").insert(row).select("*").single();
    return mapBooth(wrote(res, "부스 생성") as Row);
  }

  async updateBooth(
    id: string,
    input: Partial<BoothInput>,
    audit?: AuditContext,
  ): Promise<Booth | null> {
    const db = createServiceClient();
    if (audit) {
      // before를 저장소가 직접 읽는다. select("*") — 목록 조회는 images·
      // long_description을 빼기 때문에 그걸로 읽으면 그 필드가 늘 "빈 칸에서
      // 채워짐"으로 기록된다(2026-09-06 인입에서 실제로 겪은 함정).
      const { data: prev } = await db
        .from("booth")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (prev) {
        await this.recordChange({
          entity: "booth",
          entityId: id,
          scopeId: str((prev as Row).exhibition_id),
          source: audit.source,
          actor: audit.actor,
          reason: audit.reason,
          fieldDiffs: diffFields(
            mapBooth(prev as Row) as unknown as Record<string, unknown>,
            input as Record<string, unknown>,
            AUDIT_SPECS.booth.fields,
          ),
        });
      }
    }
    const res = await db
      .from("booth")
      .update(boothToRow(input))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = maybeWrote(res, "부스 수정");
    return data ? mapBooth(data as Row) : null;
  }

  async createEnrichmentCandidates(
    rows: Omit<EnrichmentCandidate, "id" | "createdAt" | "status">[],
  ): Promise<number> {
    if (rows.length === 0) return 0;
    const db = createServiceClient();
    // .select()를 붙여야 저장된 행이 돌아온다 — 없으면 wrote()가 성공을 "저장된
    // 행이 없음"으로 오판한다(파일럿에서 실제로 9건이 들어갔는데 500이 났다).
    const res = await db
      .from("enrichment_candidate")
      .insert(
      rows.map((r) => ({
        id: uid("cand"),
        booth_id: r.boothId,
        exhibition_id: r.exhibitionId,
        source: r.source,
        payload: r.payload,
        sources: r.sources,
        confidence: r.confidence,
        issues: r.issues,
        created_at: now(),
      })),
      )
      .select("id");
    const saved = wrote(res, "초안 적재") as unknown[];
    return saved.length;
  }

  async listEnrichmentCandidates(opts?: {
    exhibitionId?: string;
    boothId?: string;
    boothIds?: string[];
    status?: EnrichmentCandidate["status"];
    limit?: number;
  }): Promise<EnrichmentCandidate[]> {
    const db = await this.db(true);
    let q = db
      .from("enrichment_candidate")
      .select("*")
      // 신뢰도 높은 것부터 — 검수자가 쉬운 것부터 치우고 어려운 것에 시간을 쓴다.
      .order("confidence", { ascending: false })
      .limit(opts?.limit ?? 100);
    if (opts?.exhibitionId) q = q.eq("exhibition_id", opts.exhibitionId);
    if (opts?.boothId) q = q.eq("booth_id", opts.boothId);
    if (opts?.boothIds?.length) q = q.in("booth_id", opts.boothIds);
    if (opts?.status) q = q.eq("status", opts.status);
    const { data, error } = await q;
    if (error) throw new Error(`초안 조회 실패: ${error.message}`);
    return (data ?? []).map((r) => mapCandidate(r as Row));
  }

  async getEnrichmentCandidate(id: string): Promise<EnrichmentCandidate | null> {
    const db = await this.db(true);
    const { data } = await db
      .from("enrichment_candidate")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? mapCandidate(data as Row) : null;
  }

  async supersedePendingCandidates(boothIds: string[]): Promise<number> {
    if (boothIds.length === 0) return 0;
    const db = createServiceClient();
    const rows = await inChunks<Row>(boothIds, "이전 초안 내리기", (slice) =>
      db
        .from("enrichment_candidate")
        .update({ status: "superseded" })
        .eq("status", "pending")
        .in("booth_id", slice)
        .select("id"),
    );
    return rows.length;
  }

  async setCandidateStatus(
    id: string,
    status: EnrichmentCandidate["status"],
    reviewedBy?: string | null,
    note?: string | null,
  ): Promise<void> {
    const db = createServiceClient();
    const res = await db
      .from("enrichment_candidate")
      .update({
        status,
        reviewed_at: now(),
        reviewed_by: reviewedBy ?? null,
        ...(note !== undefined ? { review_note: note } : {}),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    maybeWrote(res, "초안 검수 결과 저장");
  }

  async enqueueJob(input: {
    type: string;
    payload?: Record<string, unknown>;
    runAfter?: string;
    maxAttempts?: number;
  }): Promise<Job> {
    const db = createServiceClient();
    const res = await db
      .from("job")
      .insert({
        id: uid("job"),
        type: input.type,
        payload: input.payload ?? {},
        run_after: input.runAfter ?? now(),
        max_attempts: input.maxAttempts ?? 3,
        created_at: now(),
      })
      .select("*")
      .single();
    return mapJob(wrote(res, "잡 등록") as Row);
  }

  /**
   * ⚠️ 반드시 RPC를 쓴다. select→update 두 번으로 집으면 워커 둘이 같은 잡을
   * 집는다 — `for update skip locked`는 SQL 함수 안에서만 가능하다(0052).
   */
  async claimJob(worker: string, types?: string[]): Promise<Job | null> {
    const db = createServiceClient();
    const { data, error } = await db.rpc("claim_job", {
      p_worker: worker,
      p_types: types?.length ? types : null,
    });
    if (error) throw new Error(`잡 집기 실패: ${error.message}`);
    const rows = (data ?? []) as Row[];
    return rows.length ? mapJob(rows[0]) : null;
  }

  async updateJobProgress(
    id: string,
    progress: Record<string, unknown>,
  ): Promise<void> {
    const db = createServiceClient();
    // 진행 표시는 자주 갱신된다. 실패해도 잡 자체를 멈출 이유는 없다.
    const res = await db.from("job").update({ progress }).eq("id", id);
    loggedWrite(res, "잡 진행 갱신");
  }

  async finishJob(
    id: string,
    outcome:
      | { ok: true; result?: Record<string, unknown> }
      | { ok: false; error: string; retryAfterMs?: number },
  ): Promise<void> {
    const db = createServiceClient();
    if (outcome.ok) {
      const res = await db
        .from("job")
        .update({
          status: "done",
          result: outcome.result ?? null,
          finished_at: now(),
        })
        .eq("id", id)
        .select("id")
        .maybeSingle();
      maybeWrote(res, "잡 완료");
      return;
    }
    // 재시도 여지가 남았는지는 현재 attempts로 판단한다 — claim이 이미 +1 했다.
    const { data: cur } = await db
      .from("job")
      .select("attempts, max_attempts")
      .eq("id", id)
      .maybeSingle();
    const attempts = cur ? num((cur as Row).attempts) : 99;
    const maxAttempts = cur ? num((cur as Row).max_attempts) : 0;
    const retry = attempts < maxAttempts;
    const res = await db
      .from("job")
      .update({
        status: retry ? "queued" : "failed",
        last_error: outcome.error,
        claimed_by: null,
        run_after: retry
          ? new Date(Date.now() + (outcome.retryAfterMs ?? 0)).toISOString()
          : undefined,
        finished_at: retry ? null : now(),
      })
      .eq("id", id)
      .select("id")
      .maybeSingle();
    maybeWrote(res, "잡 실패 기록");
  }

  async listJobs(opts?: {
    status?: Job["status"];
    type?: string;
    limit?: number;
  }): Promise<Job[]> {
    const db = await this.db(true);
    let q = db
      .from("job")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 50);
    if (opts?.status) q = q.eq("status", opts.status);
    if (opts?.type) q = q.eq("type", opts.type);
    const { data, error } = await q;
    if (error) throw new Error(`잡 조회 실패: ${error.message}`);
    return (data ?? []).map((r) => mapJob(r as Row));
  }

  async recordChange(entry: ChangeEntry): Promise<void> {
    if (Object.keys(entry.fieldDiffs).length === 0) return; // 바뀐 게 없으면 안 남긴다
    const db = createServiceClient();
    const res = await db.from("change_log").insert({
      id: uid("chg"),
      entity: entry.entity,
      entity_id: entry.entityId,
      scope_id: entry.scopeId ?? null,
      source: entry.source,
      actor: entry.actor ?? null,
      field_diffs: entry.fieldDiffs,
      reason: entry.reason ?? null,
      created_at: now(),
    });
    // 이력 실패가 도메인 쓰기를 막으면 900부스 인입이 통째로 멈춘다. 대신 반드시
    // 로그에 남긴다 — 조용히 사라지면 원장이 있는 의미가 없다.
    loggedWrite(res, "변경 이력 적재");
  }

  async listChanges(opts?: {
    entity?: string;
    entityId?: string;
    scopeId?: string;
    limit?: number;
  }): Promise<ChangeRecord[]> {
    const db = await this.db();
    let q = db
      .from("change_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 100);
    if (opts?.entity) q = q.eq("entity", opts.entity);
    if (opts?.entityId) q = q.eq("entity_id", opts.entityId);
    if (opts?.scopeId) q = q.eq("scope_id", opts.scopeId);
    const { data, error } = await q;
    if (error) throw new Error(`변경 이력 조회 실패: ${error.message}`);
    return (data ?? []).map((row) => {
      const r = row as Row;
      return {
        id: str(r.id),
        entity: str(r.entity),
        entityId: str(r.entity_id),
        scopeId: r.scope_id == null ? null : String(r.scope_id),
        source: str(r.source),
        actor: r.actor == null ? null : String(r.actor),
        fieldDiffs: (r.field_diffs ?? {}) as ChangeRecord["fieldDiffs"],
        reason: r.reason == null ? null : String(r.reason),
        createdAt: str(r.created_at),
      };
    });
  }

  async upsertBoothEnrichment(
    boothId: string,
    input: BoothEnrichmentPatch,
    audit?: AuditContext,
  ): Promise<void> {
    const db = createServiceClient();
    if (audit) {
      // before를 저장소가 직접 읽는다. 호출부가 넘기게 하면 낡거나 빠진 값을
      // 그대로 이력에 적게 되고, 그건 없는 이력보다 나쁘다.
      const { data: prev } = await db
        .from("booth_enrichment")
        .select("*")
        .eq("booth_id", boothId)
        .maybeSingle();
      const { data: booth } = await db
        .from("booth")
        .select("exhibition_id")
        .eq("id", boothId)
        .maybeSingle();
      await this.recordChange({
        entity: "booth_enrichment",
        entityId: boothId,
        scopeId: booth ? str((booth as Row).exhibition_id) : null,
        source: audit.source,
        actor: audit.actor,
        reason: audit.reason,
        fieldDiffs: diffFields(
          prev ? (mapEnrichment(prev as Row) as unknown as Record<string, unknown>) : null,
          input as unknown as Record<string, unknown>,
          AUDIT_SPECS.booth_enrichment.fields,
        ),
      });
    }
    // **undefined인 필드는 페이로드에서 통째로 뺀다.** PostgREST upsert는 실린
    // 컬럼만 ON CONFLICT DO UPDATE 하므로, 빼면 기존 값이 그대로 남는다.
    //
    // 예전엔 roamInterpretation·sourceUrl만 이렇게 다뤘는데, 그 사이 초안 승인
    // 경로가 `schema.partial()`로 페이로드를 만들면서 사고가 났다 — Zod의
    // partial()은 default()를 막지 않아서, 안 보낸 summary가 ""로 채워져 들어와
    // 운영 부스의 요약을 지웠다(2026-09-06, change_log로 복구). 호출부마다
    // 조심하는 대신 쓰기 경로가 막는다.
    const row: Record<string, unknown> = { booth_id: boothId };
    const put = (col: string, v: unknown, emptyToNull = false) => {
      if (v === undefined) return;
      row[col] = emptyToNull ? v || null : v;
    };
    put("summary", input.summary);
    put("value_tags", input.valueTags);
    put("recommendation_reasons", input.recommendationReasons);
    put("things_to_do", input.thingsToDo);
    put("timing", input.timing);
    put("memory_hooks", input.memoryHooks);
    put("roam_interpretation", input.roamInterpretation, true);
    put("source_url", input.sourceUrl, true);
    const res = await db
      .from("booth_enrichment")
      .upsert(row, { onConflict: "booth_id" })
      .select("booth_id")
      .single();
    wrote(res, "부스 저작 정보 저장");
  }

  async deleteBooth(id: string): Promise<boolean> {
    const db = createServiceClient();
    const { error, count } = await db
      .from("booth")
      .delete({ count: "exact" })
      .eq("id", id);
    return !error && (count ?? 0) > 0;
  }

  // --- categories / halls --------------------------------------------------

  async listCategories(): Promise<Category[]> {
    const db = await this.db();
    const { data } = await db.from("category").select("*");
    return (data ?? []).map(mapCategory);
  }

  async listHalls(exhibitionId: string): Promise<Hall[]> {
    const db = await this.db();
    const { data } = await db
      .from("hall")
      .select("*")
      .eq("exhibition_id", exhibitionId)
      .order("sort", { ascending: true });
    return (data ?? []).map(mapHall);
  }

  // --- events --------------------------------------------------------------

  async listEvents(
    slug: string,
    opts?: { boothId?: string; from?: string; to?: string },
  ): Promise<BoothEvent[]> {
    const db = await this.db();
    const { data: ex } = await db
      .from("exhibition")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();
    if (!ex) return [];
    const exId = String((ex as Row).id);
    const { data: boothRows } = await db
      .from("booth")
      .select("id")
      .eq("exhibition_id", exId);
    const boothIds = new Set(
      (boothRows ?? []).map((b) => String((b as Row).id)),
    );
    const { data: eventRows } = await db.from("event").select("*");
    let list = (eventRows ?? [])
      .map(mapEvent)
      .filter((e) => boothIds.has(e.boothId));
    if (opts?.boothId) list = list.filter((e) => e.boothId === opts.boothId);
    if (opts?.from) list = list.filter((e) => e.endTime >= opts.from!);
    if (opts?.to) list = list.filter((e) => e.startTime <= opts.to!);
    return list.sort((a, b) => a.startTime.localeCompare(b.startTime));
  }

  // 이벤트 쓰기 3종도 부스 쓰기(createBooth 주석 참고)와 같은 이유로 서비스 롤을
  // 쓴다 — admin 콘솔 전용이고, anon 키(this.db())로 쓰면 event 테이블 RLS가
  // 막아 "네트워크 오류"로 보이는 조용한 실패가 난다(2026-08-13 admin 이벤트
  // 저장 실패 회귀).
  async createEvent(input: EventInput): Promise<BoothEvent> {
    const db = createServiceClient();
    const row = { id: uid("ev"), ...eventToRow(input) };
    const res = await db.from("event").insert(row).select("*").single();
    return mapEvent(wrote(res, "이벤트 생성") as Row);
  }

  async updateEvent(
    id: string,
    input: Partial<EventInput>,
  ): Promise<BoothEvent | null> {
    const db = createServiceClient();
    const res = await db
      .from("event")
      .update(eventToRow(input))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = maybeWrote(res, "이벤트 수정");
    return data ? mapEvent(data as Row) : null;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const db = createServiceClient();
    const { error, count } = await db
      .from("event")
      .delete({ count: "exact" })
      .eq("id", id);
    return !error && (count ?? 0) > 0;
  }

  // --- welcome kit ---------------------------------------------------------

  async getWelcomeKit(boothId: string): Promise<WelcomeKit | null> {
    const db = await this.db();
    const { data } = await db
      .from("welcome_kit")
      .select("*")
      .eq("booth_id", boothId)
      .maybeSingle();
    return data ? mapWelcomeKit(data as Row) : null;
  }

  // 웰컴키트 쓰기도 부스 쓰기 3종과 같은 카테고리(관리자 콘솔 전용) — anon 키로
  // 쓰면 RLS에 막힌다. 위 createBooth 주석 참고.
  async upsertWelcomeKit(
    boothId: string,
    input: WelcomeKitInput,
  ): Promise<WelcomeKit> {
    const db = createServiceClient();
    const row = {
      booth_id: boothId,
      enabled: input.enabled,
      name: input.name,
      description: input.description,
      image_url: input.imageUrl ?? null,
      remaining_count: input.remainingCount,
    };
    const res = await db
      .from("welcome_kit")
      .upsert(row, { onConflict: "booth_id" })
      .select("*")
      .single();
    return mapWelcomeKit(wrote(res, "웰컴키트 저장") as Row);
  }

  // --- reviews -------------------------------------------------------------

  async listReviews(
    boothId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<Paginated<Review> & { summary: { count: number } }> {
    const db = await this.db();
    const { data } = await db
      .from("review")
      .select("*")
      .eq("booth_id", boothId);
    const all = (data ?? [])
      .map(mapReview)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const count = all.length;
    return {
      ...paginate(all, opts?.cursor, opts?.limit),
      summary: { count },
    };
  }

  async createReview(
    boothId: string,
    sessionId: string,
    input: ReviewInput,
  ): Promise<Review> {
    const db = await this.db();
    const row = {
      id: uid("rv"),
      booth_id: boothId,
      session_id: sessionId,
      comment: input.comment,
      author_name: input.authorName,
      created_at: now(),
    };
    const res = await db.from("review").insert(row).select("*").single();
    return mapReview(wrote(res, "리뷰 작성") as Row);
  }

  // --- sessions / preference -----------------------------------------------

  async createSession(exhibitionId: string): Promise<VisitorSession> {
    const db = await this.db();
    const ts = now();
    const row = {
      id: uid("sess"),
      exhibition_id: exhibitionId,
      created_at: ts,
      last_seen_at: ts,
    };
    const res = await db
      .from("visitor_session")
      .insert(row)
      .select("*")
      .single();
    return mapSession(wrote(res, "세션 생성") as Row);
  }

  async getSession(id: string): Promise<VisitorSession | null> {
    const db = await this.db();
    const { data } = await db
      .from("visitor_session")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? mapSession(data as Row) : null;
  }

  async getPreference(sessionId: string): Promise<UserPreference | null> {
    const db = await this.db();
    const { data } = await db
      .from("user_preference")
      .select("*")
      .eq("session_id", sessionId)
      .maybeSingle();
    return data ? mapPreference(data as Row) : null;
  }

  async savePreference(
    sessionId: string,
    input: UserPreferenceInput,
  ): Promise<UserPreference> {
    const db = await this.db();
    const row = {
      session_id: sessionId,
      visit_purposes: input.visitPurposes,
      interests: input.interests,
      available_minutes: input.availableMinutes,
      movement_preference: input.movementPreference,
      companion_type: input.companionType,
      updated_at: now(),
    };
    const res = await db
      .from("user_preference")
      .upsert(row, { onConflict: "session_id" })
      .select("*")
      .single();
    return mapPreference(wrote(res, "선호 저장") as Row);
  }

  // --- route ---------------------------------------------------------------

  async saveRoute(
    sessionId: string,
    exhibitionId: string,
    plan: Omit<
      RoutePlan,
      | "id"
      | "sessionId"
      | "userId"
      | "exhibitionId"
      | "createdAt"
      | "status"
      | "visitedBoothIds"
      | "title"
      | "isPublic"
      | "shareId"
    >,
    userId?: string,
    title?: string,
  ): Promise<RoutePlan> {
    const db = await this.db();
    const row = {
      id: uid("route"),
      session_id: sessionId,
      user_id: userId ?? null,
      exhibition_id: exhibitionId,
      booth_ids: plan.boothIds,
      estimated_minutes: plan.estimatedMinutes,
      legs: plan.legs,
      scores: plan.scores,
      status: "active",
      current_booth_id: plan.currentBoothId ?? null,
      visited_booth_ids: [],
      is_public: false,
      title: title ?? null,
      created_at: now(),
    };
    const res = await db.from("route_plan").insert(row).select("*").single();
    return mapRoute(wrote(res, "동선 저장") as Row);
  }

  async getRoute(id: string): Promise<RoutePlan | null> {
    const db = await this.db();
    const { data } = await db
      .from("route_plan")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? mapRoute(data as Row) : null;
  }

  async listMyRoutes(owner: {
    sessionId: string;
    userId?: string;
  }): Promise<RoutePlan[]> {
    const db = await this.db();
    let q = db
      .from("route_plan")
      .select("*")
      .not("title", "is", null)
      .order("created_at", { ascending: false });
    q = owner.userId
      ? q.eq("user_id", owner.userId)
      : q.eq("session_id", owner.sessionId);
    const { data } = await q;
    return (data ?? []).map((r) => mapRoute(r as Row));
  }

  async deleteRoute(
    id: string,
    owner: { sessionId: string; userId?: string },
  ): Promise<boolean> {
    const existing = await this.getRoute(id);
    if (!existing) return false;
    const owned = owner.userId
      ? existing.userId === owner.userId
      : existing.sessionId === owner.sessionId;
    if (!owned) return false;
    const db = await this.db();
    const res = await db.from("route_plan").delete().eq("id", id).select("id");
    return (maybeWrote(res, "동선 삭제")?.length ?? 0) > 0;
  }

  async patchRoute(id: string, patch: RoutePatch): Promise<RoutePlan | null> {
    const db = await this.db();
    const update: Row = {};
    if (patch.currentBoothId !== undefined)
      update.current_booth_id = patch.currentBoothId;
    if (patch.visitedBoothIds !== undefined)
      update.visited_booth_ids = patch.visitedBoothIds;
    if (patch.status !== undefined) update.status = patch.status;
    if (patch.boothIds !== undefined) update.booth_ids = patch.boothIds;
    if (patch.legs !== undefined) update.legs = patch.legs;
    if (patch.estimatedMinutes !== undefined)
      update.estimated_minutes = patch.estimatedMinutes;
    if (Object.keys(update).length === 0) {
      return this.getRoute(id);
    }
    const res = await db
      .from("route_plan")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = maybeWrote(res, "동선 수정");
    return data ? mapRoute(data as Row) : null;
  }

  async publishRoute(
    id: string,
    input: RoutePublishInput & { shareId: string; userId?: string },
  ): Promise<RoutePlan | null> {
    const db = await this.db();
    const existing = await this.getRoute(id);
    if (!existing) return null;
    const update: Row = {
      title: input.title,
      is_public: input.isPublic,
      share_id: existing.shareId ?? input.shareId,
    };
    if (input.userId && !existing.userId) update.user_id = input.userId;
    const res = await db
      .from("route_plan")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = maybeWrote(res, "동선 공개");
    return data ? mapRoute(data as Row) : null;
  }

  async getRouteByShareId(shareId: string): Promise<RoutePlan | null> {
    const db = await this.db();
    const { data } = await db
      .from("route_plan")
      .select("*")
      .eq("share_id", shareId)
      .maybeSingle();
    return data ? mapRoute(data as Row) : null;
  }

  async listPublicRoutes(exhibitionId: string): Promise<SharedRoute[]> {
    const db = await this.db();
    const { data } = await db
      .from("route_plan")
      .select("*")
      .eq("exhibition_id", exhibitionId)
      .eq("is_public", true)
      .not("share_id", "is", null)
      .order("created_at", { ascending: false });
    const routes = (data ?? []).map(mapRoute);
    const userIds = [...new Set(routes.map((r) => r.userId).filter(Boolean))];
    const nickById = new Map<string, string>();
    if (userIds.length) {
      const { data: users } = await db
        .from("app_user")
        .select("*")
        .in("id", userIds as string[]);
      for (const u of users ?? []) {
        const mapped = mapUser(u as Row);
        nickById.set(mapped.id, mapped.nickname);
      }
    }
    return routes.map((r) => ({
      id: r.id,
      shareId: r.shareId!,
      title: r.title ?? "이름 없는 동선",
      exhibitionId: r.exhibitionId,
      ownerNickname: r.userId ? (nickById.get(r.userId) ?? "익명") : "익명",
      boothIds: r.boothIds,
      estimatedMinutes: r.estimatedMinutes,
      createdAt: r.createdAt,
    }));
  }

  async boothHeatmap(exhibitionId: string): Promise<{
    booths: Record<string, number>;
    pairs: { from: string; to: string; count: number }[];
  }> {
    const db = await this.db();
    const { data } = await db
      .from("route_plan")
      .select("booth_ids")
      .eq("exhibition_id", exhibitionId);
    const booths: Record<string, number> = {};
    const pairs = new Map<string, number>();
    for (const row of data ?? []) {
      const ids = strArr((row as Row).booth_ids);
      for (const id of ids) booths[id] = (booths[id] ?? 0) + 1;
      for (let i = 1; i < ids.length; i++) {
        const key = `${ids[i - 1]}→${ids[i]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
    return {
      booths,
      pairs: [...pairs.entries()].map(([k, count]) => {
        const [from, to] = k.split("→");
        return { from, to, count };
      }),
    };
  }

  // --- users (nickname auth) -----------------------------------------------

  async createUser(nickname: string): Promise<User> {
    const db = await this.db();
    const row = { id: uid("user"), nickname, created_at: now() };
    const res = await db.from("app_user").insert(row).select("*").single();
    return mapUser(wrote(res, "계정 생성") as Row);
  }

  async listUsers(opts?: { limit?: number; offset?: number }): Promise<User[]> {
    const db = await this.db(true);
    let q = db
      .from("app_user")
      .select("*")
      .order("created_at", { ascending: false });
    if (opts?.limit) {
      const offset = opts.offset ?? 0;
      q = q.range(offset, offset + opts.limit - 1);
    }
    const { data } = await q;
    return (data ?? []).map((row) => mapUser(row as Row));
  }

  /**
   * 계정 삭제(관리자). bookmark는 FK cascade(0025)로 자동 정리되지만
   * user_signal_log·route_plan·user_brain·booth_note는 cascade 여부가
   * 마이그레이션 히스토리로 확인 안 돼(로컬에 0001~0023 없음) 여기서
   * 직접 먼저 지운다 — 안 그러면 app_user만 지워지고 나머지가 고아로 남을 수 있다.
   * anon 키(this.db())는 이 테이블들 RLS가 UPDATE/DELETE엔 권한을 안 줘서 조용히
   * 0행으로 끝난다(updateNickname과 같은 패턴, createServiceClient 주석 참고) — 그러면
   * app_user는 안 지워졌는데 자식 행만 지워지거나, 반대로 자식이 고아로 남을 수 있다.
   * requireAdmin()으로 이미 인가를 마쳤으니 서비스 롤로 전부 같은 트랜잭션 경로로 쓴다.
   */
  async deleteUser(id: string): Promise<boolean> {
    const db = createServiceClient();
    maybeWrote(
      await db.from("booth_note").delete().eq("user_id", id),
      "계정 삭제(노트 정리)",
    );
    maybeWrote(
      await db.from("route_plan").delete().eq("user_id", id),
      "계정 삭제(동선 정리)",
    );
    maybeWrote(
      await db.from("user_brain").delete().eq("user_id", id),
      "계정 삭제(브레인 정리)",
    );
    loggedWrite(
      await db.from("user_signal_log").delete().eq("user_id", id),
      "계정 삭제(신호 로그 정리)",
    );
    const { error, count } = await db
      .from("app_user")
      .delete({ count: "exact" })
      .eq("id", id);
    return !error && (count ?? 0) > 0;
  }

  async getUser(id: string, opts?: AdminRead): Promise<User | null> {
    const db = await this.db(opts?.asAdmin);
    const { data } = await db
      .from("app_user")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? mapUser(data as Row) : null;
  }

  async getUserByNickname(nickname: string): Promise<User | null> {
    const db = await this.db();
    const { data } = await db
      .from("app_user")
      .select("*")
      .ilike("nickname", nickname)
      .maybeSingle();
    return data ? mapUser(data as Row) : null;
  }

  // anon 키(this.db())로 쓰면 app_user RLS가 UPDATE엔 권한을 안 줘서 조용히
  // 0행으로 끝나고(PostgREST는 에러로 안 던진다), 아래 select가 null을 돌려줘
  // 라우트가 "계정을 찾을 수 없음"으로 오인한다 — 이미 booth 쓰기에서 겪은 것과
  // 같은 패턴(createServiceClient 주석 참고). 라우트가 getCurrentUser()로 이미
  // 인가를 마쳤으니 서비스 롤로 쓴다.
  async updateNickname(id: string, nickname: string): Promise<User | null> {
    const db = createServiceClient();
    const res = await db
      .from("app_user")
      .update({ nickname })
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = maybeWrote(res, "닉네임 변경");
    return data ? mapUser(data as Row) : null;
  }

  async getUserByProvider(
    provider: string,
    providerAccountId: string,
  ): Promise<User | null> {
    const db = await this.db();
    const { data } = await db
      .from("app_user")
      .select("*")
      .eq("provider", provider)
      .eq("provider_account_id", providerAccountId)
      .maybeSingle();
    return data ? mapUser(data as Row) : null;
  }

  async createOAuthUser(identity: OAuthIdentity): Promise<User> {
    const db = await this.db();
    const row = {
      id: identity.id ?? uid("user"),
      nickname: identity.nickname,
      created_at: now(),
      provider: identity.provider,
      provider_account_id: identity.providerAccountId,
      email: identity.email ?? null,
      avatar_url: identity.avatarUrl ?? null,
    };
    const res = await db.from("app_user").insert(row).select("*").single();
    return mapUser(wrote(res, "소셜 계정 생성") as Row);
  }

  // --- booth notes ---------------------------------------------------------

  async listNotes(userId: string): Promise<BoothNote[]> {
    const db = await this.db();
    const { data } = await db
      .from("booth_note")
      .select("*")
      .eq("user_id", userId);
    return (data ?? []).map(mapNote);
  }

  async listNotesByBoothIds(boothIds: string[]): Promise<BoothNote[]> {
    if (boothIds.length === 0) return [];
    // 양쪽 다 필요하다 — db(true)는 0041 RLS 이후 관리자 읽기가 조용히 0행이 되던
    // 문제(#88), inChunks는 전시 하나치 부스 id가 URL 길이 상한에 걸리면 역시
    // 조용히 0행이 되는 문제. 같은 증상의 원인이 둘이었다.
    const db = await this.db(true);
    const rows = await inChunks<Row>(boothIds, "부스 노트", (slice) =>
      db.from("booth_note").select("*").in("booth_id", slice),
    );
    return rows.map(mapNote);
  }

  async upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
    judgedClass: "confident" | "uncertain" | null | undefined,
  ): Promise<BoothNote> {
    const db = await this.db();
    // 존재하는 노트를 먼저 읽는다 — 이번 요청이 안 건드리는 필드(undefined)는
    // 기존 값을 그대로 들고 있어야 "이 쓰기 후 최종 상태가 비었는지"를 옳게
    // 판단할 수 있다. 원본 input만 보면 메모만 고치는 요청이 매번 interest·
    // verdict를 null로 오판해 기존 노트를 통째로 지워버린다.
    const { data: existingData } = await db
      .from("booth_note")
      .select("*")
      .eq("user_id", userId)
      .eq("booth_id", boothId)
      .maybeSingle();
    const existingRow = existingData as Row | null;

    const interest =
      input.interest !== undefined
        ? (input.interest ?? null)
        : (existingRow?.interest ?? null);
    const verdict =
      input.verdict !== undefined
        ? (input.verdict ?? null)
        : (existingRow?.verdict ?? null);
    const memo =
      input.memo !== undefined
        ? (input.memo ?? null)
        : (existingRow?.memo ?? null);
    const photos =
      input.photos !== undefined
        ? input.photos
        : ((existingRow?.photos as string[] | undefined) ?? []);
    // Empty note (after applying this write on top of the existing row) →
    // delete so the gallery/back-end stays clean.
    if (
      !interest &&
      !verdict &&
      (memo == null || !(memo as string).trim()) &&
      photos.length === 0
    ) {
      maybeWrote(
        await db
          .from("booth_note")
          .delete()
          .eq("user_id", userId)
          .eq("booth_id", boothId),
        "메모 삭제",
      );
      return { userId, boothId, updatedAt: now() };
    }
    const row: Row = {
      user_id: userId,
      booth_id: boothId,
      memo,
      photos,
      updated_at: now(),
    };
    // interest·verdict는 각각 "이 요청이 그 필드를 건드리는지"에 따라 SET 절에
    // 넣을지 뺄지 정한다 — undefined면 아예 안 넣어서 upsert 충돌 시 기존 값을
    // 그대로 둔다(메모만 고치는 쓰기가 반응을 조용히 안 건드리게).
    if (input.interest !== undefined) row.interest = interest;
    if (input.verdict !== undefined) {
      row.verdict = verdict;
      // verdict를 새로 쓰는 순간이 곧 방문 시각. 해제하면 같이 지운다 — 판정이
      // 곧 방문 기록이므로 둘을 분리해서 남기지 않는다(judgment-vocabulary §8-2).
      row.visited_at = verdict ? now() : null;
    }
    if (judgedClass !== undefined) row.judged_class = judgedClass;
    const res = await db
      .from("booth_note")
      .upsert(row, { onConflict: "user_id,booth_id" })
      .select("*")
      .single();
    return mapNote(wrote(res, "메모 저장") as Row);
  }

  async getBooth(id: string): Promise<Booth | null> {
    const db = await this.db();
    const { data } = await db
      .from("booth")
      .select(BOOTH_LIST_COLS)
      .eq("id", id)
      .maybeSingle();
    if (!data) return null;
    const booth = mapBooth(data as Row);
    const { data: enrichRow } = await db
      .from("booth_enrichment")
      .select("*")
      .eq("booth_id", id)
      .maybeSingle();
    if (enrichRow) attachEnrichment(booth, enrichRow as Row);
    return booth;
  }

  async listJudgmentsForCurve(): Promise<CurveInput[]> {
    const db = await this.db(true);
    const { data: booths, error: be } = await db
      .from("booth")
      .select("id, exhibition_id");
    if (be) throw new Error(`부스 조회 실패: ${be.message}`);
    const exOf = new Map(
      (booths ?? []).map((b) => [str((b as Row).id), str((b as Row).exhibition_id)]),
    );
    const { data, error } = await db
      .from("booth_note")
      .select("user_id, booth_id, interest, verdict, judged_class, updated_at");
    if (error) throw new Error(`판정 노트 조회 실패: ${error.message}`);
    return (data ?? [])
      .map((row) => {
        const r = row as Row;
        return {
          userId: str(r.user_id),
          exhibitionId: exOf.get(str(r.booth_id)) ?? "",
          at: str(r.updated_at),
          interest: (r.interest ?? null) as CurveInput["interest"],
          verdict: (r.verdict ?? null) as CurveInput["verdict"],
          judgedClass: (r.judged_class ?? null) as CurveInput["judgedClass"],
        };
      })
      .filter((r) => r.exhibitionId && r.userId);
  }

  async getTasteAccuracy(
    userId: string,
    exhibitionId: string,
  ): Promise<TasteAccuracy> {
    const db = await this.db();
    const { data: booths } = await db
      .from("booth")
      .select("id")
      .eq("exhibition_id", exhibitionId);
    const ids = (booths ?? []).map((b) => str((b as Row).id));
    if (ids.length === 0) return { judgedCount: 0, pct: null };
    const data = await inChunks<Row>(ids, "판정 노트", (slice) =>
      db
        .from("booth_note")
        .select("interest, verdict, judged_class")
        .eq("user_id", userId)
        .in("booth_id", slice),
    );
    return computeTasteAccuracy(
      data.map((r) => ({
        interest:
          (r as Row).interest == null
            ? undefined
            : (String((r as Row).interest) as BoothNote["interest"]),
        verdict:
          (r as Row).verdict == null
            ? undefined
            : (String((r as Row).verdict) as BoothNote["verdict"]),
        judgedClass:
          (r as Row).judged_class == null
            ? undefined
            : (String((r as Row).judged_class) as BoothNote["judgedClass"]),
      })),
    );
  }

  async listPendingRetro(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]> {
    const db = await this.db();
    const { data: booths } = await db
      .from("booth")
      .select("id, name")
      .eq("exhibition_id", exhibitionId);
    const nameById = new Map(
      (booths ?? []).map((b) => [str((b as Row).id), str((b as Row).name)]),
    );
    if (nameById.size === 0) return [];
    const data = await inChunks<Row>(
      [...nameById.keys()],
      "회고 대기 노트",
      (slice) =>
        db
          .from("booth_note")
          .select("booth_id")
          .eq("user_id", userId)
          .not("visited_at", "is", null)
          .is("verdict", null)
          .in("booth_id", slice)
          .limit(limit),
    );
    return data
      .map((r) => str(r.booth_id))
      .filter((id) => nameById.has(id))
      .map((id) => ({ boothId: id, boothName: nameById.get(id)! }))
      .slice(0, limit);
  }

  async listMustNotVisited(
    userId: string,
    exhibitionId: string,
    limit: number,
  ): Promise<{ boothId: string; boothName: string }[]> {
    const db = await this.db();
    const { data: booths } = await db
      .from("booth")
      .select("id, name")
      .eq("exhibition_id", exhibitionId);
    const nameById = new Map(
      (booths ?? []).map((b) => [str((b as Row).id), str((b as Row).name)]),
    );
    if (nameById.size === 0) return [];
    const data = await inChunks<Row>(
      [...nameById.keys()],
      "꼭 갈 곳 노트",
      (slice) =>
        db
          .from("booth_note")
          .select("booth_id")
          .eq("user_id", userId)
          .eq("interest", "must")
          .is("visited_at", null)
          .in("booth_id", slice)
          .limit(limit),
    );
    return data
      .map((r) => str(r.booth_id))
      .filter((id) => nameById.has(id))
      .map((id) => ({ boothId: id, boothName: nameById.get(id)! }))
      .slice(0, limit);
  }

  async listExhibitionNotes(
    exhibitionId: string,
  ): Promise<{ boothId: string; memo: string }[]> {
    const db = await this.db();
    const { data: booths } = await db
      .from("booth")
      .select("id")
      .eq("exhibition_id", exhibitionId);
    const ids = (booths ?? []).map((b) => str((b as Row).id));
    if (ids.length === 0) return [];
    const data = await inChunks<Row>(ids, "전시 메모", (slice) =>
      db
        .from("booth_note")
        .select("booth_id, memo")
        .in("booth_id", slice)
        .not("memo", "is", null),
    );
    return data
      .map((r) => ({
        boothId: str(r.booth_id),
        memo: str(r.memo),
      }))
      .filter((n) => n.memo.trim());
  }

  // --- bookmarks -----------------------------------------------------------

  async listBookmarks(userId: string, opts?: AdminRead): Promise<Bookmark[]> {
    const db = await this.db(opts?.asAdmin);
    const { data } = await db
      .from("bookmark")
      .select("*")
      .eq("user_id", userId);
    return (data ?? []).map(mapBookmark);
  }

  async addBookmark(userId: string, input: BookmarkInput): Promise<Bookmark> {
    const db = await this.db();
    const { data: existing } = await db
      .from("bookmark")
      .select("*")
      .eq("user_id", userId)
      .eq("target_type", input.targetType)
      .eq("target_id", input.targetId)
      .maybeSingle();
    if (existing) return mapBookmark(existing as Row);
    const row = {
      id: uid("bm"),
      user_id: userId,
      target_type: input.targetType,
      target_id: input.targetId,
      created_at: now(),
    };
    const res = await db.from("bookmark").insert(row).select("*").single();
    return mapBookmark(wrote(res, "북마크 저장") as Row);
  }

  async removeBookmark(userId: string, input: BookmarkInput): Promise<boolean> {
    const db = await this.db();
    const { error, count } = await db
      .from("bookmark")
      .delete({ count: "exact" })
      .eq("user_id", userId)
      .eq("target_type", input.targetType)
      .eq("target_id", input.targetId);
    return !error && (count ?? 0) > 0;
  }

  // --- community -----------------------------------------------------------

  async listPosts(
    exhibitionId: string,
    opts?: { cursor?: string; limit?: number },
  ): Promise<Paginated<CommunityPost>> {
    const db = await this.db();
    const { data } = await db
      .from("community_post")
      .select("*")
      .eq("exhibition_id", exhibitionId)
      .order("created_at", { ascending: false });
    let list = (data ?? []).map(mapPost);
    // Hide posts that reached the report threshold (deduped per session by the
    // table's unique constraint, so a row count == distinct reporters).
    if (list.length) {
      const { data: reps } = await db
        .from("community_report")
        .select("post_id")
        .in(
          "post_id",
          list.map((p) => p.id),
        );
      const count = new Map<string, number>();
      for (const r of reps ?? []) {
        const pid = (r as Row).post_id as string;
        count.set(pid, (count.get(pid) ?? 0) + 1);
      }
      list = list.filter((p) => (count.get(p.id) ?? 0) < REPORT_HIDE_THRESHOLD);
    }
    return paginate(list, opts?.cursor, opts?.limit);
  }

  async createPost(
    sessionId: string,
    exhibitionId: string,
    input: CommunityPostInput,
  ): Promise<CommunityPost> {
    const db = await this.db();
    const row = {
      id: uid("cp"),
      exhibition_id: exhibitionId,
      session_id: sessionId,
      author_name: input.authorName,
      body: input.body,
      booth_id: input.boothId ?? null,
      media_url: input.mediaUrl ?? null,
      media_type: input.mediaType ?? null,
      media_public_id: input.mediaPublicId ?? null,
      created_at: now(),
    };
    const res = await db
      .from("community_post")
      .insert(row)
      .select("*")
      .single();
    return mapPost(wrote(res, "글 작성") as Row);
  }

  async getPost(id: string): Promise<CommunityPost | null> {
    const db = await this.db();
    const { data } = await db
      .from("community_post")
      .select("*")
      .eq("id", id)
      .maybeSingle();
    return data ? mapPost(data as Row) : null;
  }

  async deletePost(id: string, sessionId: string): Promise<DeletePostResult> {
    const db = await this.db();
    const res = await db
      .from("community_post")
      .delete()
      .eq("id", id)
      .eq("session_id", sessionId)
      .select("media_public_id, media_type");
    const row = maybeWrote(res, "글 삭제")?.[0];
    if (!row) return { deleted: false };
    return {
      deleted: true,
      mediaPublicId:
        row.media_public_id == null ? undefined : String(row.media_public_id),
      mediaType:
        row.media_type === "video"
          ? "video"
          : row.media_type === "image"
            ? "image"
            : undefined,
    };
  }

  async reportPost(
    postId: string,
    sessionId: string,
    reason?: string,
  ): Promise<ReportResult> {
    const db = await this.db();
    const { data: post } = await db
      .from("community_post")
      .select("id")
      .eq("id", postId)
      .maybeSingle();
    if (!post) return { ok: false, already: false };
    const { error } = await db.from("community_report").insert({
      id: uid("rep"),
      post_id: postId,
      session_id: sessionId,
      reason: reason ?? null,
      created_at: now(),
    });
    // 23505 = unique_violation → this session already reported the post.
    if (error) {
      if (error.code === "23505") return { ok: true, already: true };
      throw error;
    }
    return { ok: true, already: false };
  }

  // --- analytics -----------------------------------------------------------

  async recordAnalytics(
    sessionId: string,
    exhibitionId: string,
    input: AnalyticsEventInput,
    userId?: string | null,
  ): Promise<void> {
    const db = await this.db();
    const res = await db.from("analytics_event").insert({
      id: uid("an"),
      session_id: sessionId,
      user_id: userId ?? null,
      exhibition_id: exhibitionId,
      type: input.type,
      booth_id: input.boothId ?? null,
      x: input.x ?? null,
      y: input.y ?? null,
      meta: input.meta ?? null,
      created_at: now(),
    });
    loggedWrite(res, "분석 이벤트 적재");
  }

  async _allAnalytics(exhibitionId: string): Promise<AnalyticsEvent[]> {
    const db = await this.db(true);
    const { data } = await db
      .from("analytics_event")
      .select("*")
      .eq("exhibition_id", exhibitionId)
      .order("created_at", { ascending: false })
      .limit(2000);
    return (data ?? []).map(mapAnalytics);
  }

  async logAiQuery(
    sessionId: string,
    exhibitionId: string,
    input: { text: string; keywords: string[] },
  ): Promise<void> {
    const db = await this.db();
    const res = await db.from("ai_query_log").insert({
      id: uid("aq"),
      session_id: sessionId,
      exhibition_id: exhibitionId,
      text: input.text,
      keywords: input.keywords,
      created_at: now(),
    });
    loggedWrite(res, "AI 쿼리 로그 적재");
  }

  async topQueryKeywords(
    exhibitionId: string,
    limit = 12,
  ): Promise<{ keyword: string; count: number }[]> {
    const db = await this.db();
    // 최근 쿼리의 키워드를 가져와 앱에서 빈도 집계(스키마 단순 유지).
    const { data } = await db
      .from("ai_query_log")
      .select("keywords")
      .eq("exhibition_id", exhibitionId)
      .order("created_at", { ascending: false })
      .limit(500);
    const counts = new Map<string, number>();
    for (const row of data ?? []) {
      const kws = Array.isArray((row as { keywords?: unknown }).keywords)
        ? ((row as { keywords: unknown[] }).keywords as unknown[])
        : [];
      for (const k of kws) {
        const key = typeof k === "string" ? k.trim() : "";
        if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([keyword, count]) => ({ keyword, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);
  }

  // --- 오류/이슈 로그 --------------------------------------------------------

  async logIssue(input: {
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
  }): Promise<void> {
    // 로깅 자체가 실패해도 원래 요청·화면엔 절대 영향을 주면 안 된다 — service-role
    // 키가 없는 환경(로컬 개발 등)에서도 조용히 넘어간다.
    try {
      const db = createServiceClient();
      const res = await db.from("issue_log").insert({
        id: uid("issue"),
        source: input.source,
        message: input.message,
        stack: input.stack ?? null,
        path: input.path ?? null,
        digest: input.digest ?? null,
        user_id: input.userId ?? null,
        session_id: input.sessionId ?? null,
        context: input.context ?? null,
        device: input.device ?? null,
        country: input.country ?? null,
        city: input.city ?? null,
        created_at: now(),
      });
      loggedWrite(res, "이슈 로그 적재");
    } catch (e) {
      console.error("[repo] 이슈 로그 적재 실패:", e);
    }
  }

  async listIssues(opts?: {
    source?: "server" | "client";
    limit?: number;
    sinceDays?: number;
  }): Promise<IssueLog[]> {
    const db = createServiceClient();
    let q = db
      .from("issue_log")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(opts?.limit ?? 100);
    if (opts?.source) q = q.eq("source", opts.source);
    if (opts?.sinceDays) {
      const cutoff = new Date(
        Date.now() - opts.sinceDays * 24 * 60 * 60 * 1000,
      ).toISOString();
      q = q.gte("created_at", cutoff);
    }
    const { data } = await q;
    return (data ?? []).map((r) => mapIssueLog(r as Row));
  }

  async deleteOldIssues(olderThanDays: number): Promise<number> {
    const db = createServiceClient();
    const cutoff = new Date(
      Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
    ).toISOString();
    // 쓰기 게이트를 반드시 통과시킨다 — error를 안 보면 실패가 "0건 삭제"(성공)로
    // 위장돼 admin이 정리됐다고 착각한다.
    const res = await db
      .from("issue_log")
      .delete()
      .lt("created_at", cutoff)
      .select("id");
    const rows = maybeWrote(res, "이슈 로그 정리");
    return rows?.length ?? 0;
  }

  async appendUserSignal(
    sig: Omit<UserSignal, "id" | "createdAt">,
  ): Promise<void> {
    const db = await this.db();
    const res = await db.from("user_signal_log").insert({
      id: uid("sig"),
      user_id: sig.userId,
      exhibition_id: sig.exhibitionId,
      kind: sig.kind,
      booth_id: sig.boothId ?? null,
      booth_code: sig.boothCode ?? null,
      slugs: sig.slugs,
      created_at: now(),
    });
    maybeWrote(res, "사용자 신호 적재");
  }

  async listUserSignals(
    userId: string,
    opts?: { exhibitionId?: string; limit?: number } & AdminRead,
  ): Promise<UserSignal[]> {
    const db = await this.db(opts?.asAdmin);
    let q = db
      .from("user_signal_log")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (opts?.exhibitionId) q = q.eq("exhibition_id", opts.exhibitionId);
    if (opts?.limit) q = q.limit(opts.limit);
    const { data } = await q;
    return (data ?? []).map((row) => {
      const r = row as Row;
      return {
        id: String(r.id),
        userId: String(r.user_id),
        exhibitionId: String(r.exhibition_id),
        kind: String(r.kind) as SignalKind,
        boothId: r.booth_id == null ? undefined : String(r.booth_id),
        boothCode: r.booth_code == null ? undefined : String(r.booth_code),
        slugs: strArr(r.slugs),
        createdAt: String(r.created_at),
      };
    });
  }

  async listExhibitionSignals(
    exhibitionId: string,
    opts?: { limit?: number },
  ): Promise<UserSignal[]> {
    const db = await this.db(true);
    let q = db
      .from("user_signal_log")
      .select("*")
      .eq("exhibition_id", exhibitionId)
      .order("created_at", { ascending: false });
    if (opts?.limit) q = q.limit(opts.limit);
    const { data } = await q;
    return (data ?? []).map((row) => {
      const r = row as Row;
      return {
        id: String(r.id),
        userId: String(r.user_id),
        exhibitionId: String(r.exhibition_id),
        kind: String(r.kind) as SignalKind,
        boothId: r.booth_id == null ? undefined : String(r.booth_id),
        boothCode: r.booth_code == null ? undefined : String(r.booth_code),
        slugs: strArr(r.slugs),
        createdAt: String(r.created_at),
      };
    });
  }

  async getUserBrain(
    userId: string,
    opts?: AdminRead,
  ): Promise<UserBrain | null> {
    const db = await this.db(opts?.asAdmin);
    const { data } = await db
      .from("user_brain")
      .select("data")
      .eq("user_id", userId)
      .maybeSingle();
    if (!data) return null;
    const raw = (data as Row).data;
    return raw ? (raw as UserBrain) : null;
  }

  async saveUserBrain(brain: UserBrain): Promise<void> {
    const db = await this.db();
    const res = await db.from("user_brain").upsert({
      user_id: brain.userId,
      data: brain,
      updated_at: now(),
    });
    maybeWrote(res, "브레인 저장");
  }

  async listUserBrains(): Promise<UserBrain[]> {
    // 브레인은 사용자당 한 행이고 크로스-전시(L4)라 전시로 못 좁힌다 — 전 스캔은
    // listReflectedUserIds와 같은 관례. 운영 콘솔 전용이므로 service로 읽는다.
    const db = await this.db(true);
    const { data } = await db.from("user_brain").select("data");
    return (data ?? [])
      .map((row) => (row as Row).data)
      .filter((raw): raw is UserBrain => raw != null) as UserBrain[];
  }

  async listReflectedUserIds(exhibitionId: string): Promise<string[]> {
    const db = await this.db(true);
    // user_brain은 사용자당 한 행, visits는 JSONB 배열이라 DB 단에서 정확히
    // 못 걸러 전부 읽어 앱에서 거른다(다른 analytics 메서드들과 같은 전 스캔
    // 관례 — admin-analytics-pm-layer §1의 집계 성능 항목은 구조적 해결로 미뤄둠).
    // visits 하위 경로만 뽑아 나머지 브레인 페이로드(관심사·전체 요약)는 안 읽는다.
    const { data } = await db
      .from("user_brain")
      .select("user_id, data->visits");
    const ids: string[] = [];
    for (const row of (data ?? []) as Row[]) {
      const visits = row.visits as VisitDigest[] | null;
      if (visits?.some((v) => v.exhibitionId === exhibitionId)) {
        ids.push(str(row.user_id));
      }
    }
    return ids;
  }

  async analyticsHeatmap(
    exhibitionId: string,
  ): Promise<{ x: number; y: number; weight: number }[]> {
    const booths = await this.listBoothsByExhibitionId(exhibitionId);
    const base = booths.map((b) => ({
      x: b.x,
      y: b.y,
      weight: b.popularity / 100,
    }));
    const an = await this._allAnalytics(exhibitionId);
    const live = an
      .filter((a) => a.x != null && a.y != null)
      .map((a) => ({ x: a.x!, y: a.y!, weight: 0.5 }));
    return [...base, ...live];
  }

  async analyticsPopular(
    exhibitionId: string,
    limit = 10,
  ): Promise<
    { boothId: string; name: string; views: number; arrivals: number }[]
  > {
    // 정적 popularity 가산을 뺐다 — 실제 조회가 없으면 정직하게 0으로 보인다.
    const booths = await this.listBoothsByExhibitionId(exhibitionId);
    const an = await this._allAnalytics(exhibitionId);
    return booths
      .map((b) => {
        const views = an.filter(
          (a) => a.boothId === b.id && a.type === "view",
        ).length;
        const arrivals = an.filter(
          (a) => a.boothId === b.id && a.type === "booth_arrive",
        ).length;
        return { boothId: b.id, name: b.name, views, arrivals };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }

  async analyticsFlow(
    exhibitionId: string,
  ): Promise<{ from: string; to: string; count: number }[]> {
    return computeFlowEdges(await this._allAnalytics(exhibitionId));
  }

  async analyticsConversion(
    exhibitionId: string,
  ): Promise<{ stage: string; count: number; rate: number }[]> {
    // 죽은 소스(user_preference 전역 카운트 — 전시 필터도 없었다·route_plan)를
    // 읽던 걸 실제 여정 퍼널로 교체한다.
    const signals = await this.listExhibitionSignals(exhibitionId);
    const reflected = await this.listReflectedUserIds(exhibitionId);
    return computeJourneyFunnel(signals, new Set(reflected));
  }
}
