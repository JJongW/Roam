import { uid } from "@/lib/utils";
import { computeJourneyFunnel } from "@/lib/admin/journey-funnel";
import { REPORT_HIDE_THRESHOLD } from "@/lib/constants";
import { deriveValueTags } from "@/lib/values/derive";
import { createServerClient, createServiceClient } from "@/lib/supabase/server";
import { computeTasteAccuracy, type TasteAccuracy } from "@/lib/memory/taste";
import type { ListBoothQuery, Repository } from "@/lib/repositories/types";
import type {
  AnalyticsEvent,
  AnalyticsType,
  Booth,
  BoothDetail,
  BoothEnrichment,
  BoothValueTag,
  BoothEvent,
  Bookmark,
  BookmarkTarget,
  BoothNote,
  Category,
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
  BoothEnrichmentAuthorInput,
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
function attachEnrichment(booth: Booth, e: Row): void {
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

  private async db(): Promise<SupabaseClient> {
    return createServerClient();
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
  ): Promise<Paginated<Booth>> {
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

  async listBoothsByExhibitionId(exhibitionId: string): Promise<Booth[]> {
    const db = await this.db();
    const { data } = await db
      .from("booth")
      .select(BOOTH_LIST_COLS)
      .eq("exhibition_id", exhibitionId);
    const booths = (data ?? []).map(mapBooth);
    // 근거 카드·추천에 쓰이는 enrichment를 한 번에 join해 붙인다(피드 경로).
    const { data: enrichRows } = await db
      .from("booth_enrichment")
      .select("*")
      .in(
        "booth_id",
        booths.map((b) => b.id),
      );
    const byId = new Map(
      (enrichRows ?? []).map((e) => [String((e as Row).booth_id), e as Row]),
    );
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
  async createBooth(input: BoothInput): Promise<Booth> {
    const db = createServiceClient();
    const row = { id: uid("booth"), created_at: now(), ...boothToRow(input) };
    const res = await db.from("booth").insert(row).select("*").single();
    return mapBooth(wrote(res, "부스 생성") as Row);
  }

  async updateBooth(
    id: string,
    input: Partial<BoothInput>,
  ): Promise<Booth | null> {
    const db = createServiceClient();
    const res = await db
      .from("booth")
      .update(boothToRow(input))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    const data = maybeWrote(res, "부스 수정");
    return data ? mapBooth(data as Row) : null;
  }

  async upsertBoothEnrichment(
    boothId: string,
    input: BoothEnrichmentAuthorInput,
  ): Promise<void> {
    const db = createServiceClient();
    const row = {
      booth_id: boothId,
      summary: input.summary,
      value_tags: input.valueTags,
      recommendation_reasons: input.recommendationReasons,
      things_to_do: input.thingsToDo,
      timing: input.timing,
      memory_hooks: input.memoryHooks,
    };
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

  async upsertWelcomeKit(
    boothId: string,
    input: WelcomeKitInput,
  ): Promise<WelcomeKit> {
    const db = await this.db();
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
    const db = await this.db();
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

  async getUser(id: string): Promise<User | null> {
    const db = await this.db();
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
      id: uid("user"),
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
    const db = await this.db();
    const { data } = await db
      .from("booth_note")
      .select("*")
      .in("booth_id", boothIds);
    return (data ?? []).map(mapNote);
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
    const { data } = await db
      .from("booth_note")
      .select("interest, verdict, judged_class")
      .eq("user_id", userId)
      .in("booth_id", ids);
    return computeTasteAccuracy(
      (data ?? []).map((r) => ({
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
    const { data } = await db
      .from("booth_note")
      .select("booth_id")
      .eq("user_id", userId)
      .not("visited_at", "is", null)
      .is("verdict", null)
      .in("booth_id", [...nameById.keys()])
      .limit(limit);
    return (data ?? [])
      .map((r) => str((r as Row).booth_id))
      .filter((id) => nameById.has(id))
      .map((id) => ({ boothId: id, boothName: nameById.get(id)! }));
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
    const { data } = await db
      .from("booth_note")
      .select("booth_id")
      .eq("user_id", userId)
      .eq("interest", "must")
      .is("visited_at", null)
      .in("booth_id", [...nameById.keys()])
      .limit(limit);
    return (data ?? [])
      .map((r) => str((r as Row).booth_id))
      .filter((id) => nameById.has(id))
      .map((id) => ({ boothId: id, boothName: nameById.get(id)! }));
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
    const { data } = await db
      .from("booth_note")
      .select("booth_id, memo")
      .in("booth_id", ids)
      .not("memo", "is", null);
    return (data ?? [])
      .map((r) => ({
        boothId: str((r as Row).booth_id),
        memo: str((r as Row).memo),
      }))
      .filter((n) => n.memo.trim());
  }

  // --- bookmarks -----------------------------------------------------------

  async listBookmarks(userId: string): Promise<Bookmark[]> {
    const db = await this.db();
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
  ): Promise<void> {
    const db = await this.db();
    const res = await db.from("analytics_event").insert({
      id: uid("an"),
      session_id: sessionId,
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
    const db = await this.db();
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
      booth_code: sig.boothCode ?? null,
      slugs: sig.slugs,
      created_at: now(),
    });
    maybeWrote(res, "사용자 신호 적재");
  }

  async listUserSignals(
    userId: string,
    opts?: { exhibitionId?: string; limit?: number },
  ): Promise<UserSignal[]> {
    const db = await this.db();
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
    const db = await this.db();
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
        boothCode: r.booth_code == null ? undefined : String(r.booth_code),
        slugs: strArr(r.slugs),
        createdAt: String(r.created_at),
      };
    });
  }

  async getUserBrain(userId: string): Promise<UserBrain | null> {
    const db = await this.db();
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

  async listReflectedUserIds(exhibitionId: string): Promise<string[]> {
    const db = await this.db();
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
    // booth_arrive는 발화가 없다 — 유일하게 살아있는 view를 같은 세션 안에서
    // 시간순으로 이어 근사한다.
    const all = await this._allAnalytics(exhibitionId);
    const an = all
      .filter((a) => a.type === "view" && a.boothId)
      .sort(
        (a, b) =>
          a.sessionId.localeCompare(b.sessionId) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const edges = new Map<string, number>();
    const MAX_GAP_MS = 30 * 60 * 1000;
    for (let i = 1; i < an.length; i++) {
      if (an[i].sessionId !== an[i - 1].sessionId) continue;
      if (an[i].boothId === an[i - 1].boothId) continue;
      const gap =
        new Date(an[i].createdAt).getTime() -
        new Date(an[i - 1].createdAt).getTime();
      // 세션 쿠키가 30일까지 살아있어 같은 세션이라도 며칠 뒤 재방문이 섞일 수
      // 있다 — 실제 한 번의 관람 흐름만 잡히게 시간 간격도 좁힌다.
      if (gap > MAX_GAP_MS) continue;
      const key = `${an[i - 1].boothId}→${an[i].boothId}`;
      edges.set(key, (edges.get(key) ?? 0) + 1);
    }
    return [...edges.entries()].map(([k, count]) => {
      const [from, to] = k.split("→");
      return { from, to, count };
    });
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
