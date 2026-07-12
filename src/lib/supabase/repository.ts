import { uid } from "@/lib/utils";
import { REPORT_HIDE_THRESHOLD } from "@/lib/constants";
import { deriveValueTags } from "@/lib/values/derive";
import { createServerClient } from "@/lib/supabase/server";
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
  VisitPurpose,
  VisitorSession,
  WelcomeKit,
} from "@/lib/types";
import type {
  AnalyticsEventInput,
  BookmarkInput,
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

function mapNote(r: Row): BoothNote {
  return {
    userId: str(r.user_id),
    boothId: str(r.booth_id),
    status:
      r.status == null
        ? undefined
        : (String(r.status) as "visited" | "skipped"),
    memo: r.memo == null ? undefined : String(r.memo),
    photos: Array.isArray(r.photos) ? r.photos.map(String) : undefined,
    updatedAt: str(r.updated_at),
  };
}

function mapBookmark(r: Row): Bookmark {
  return {
    id: str(r.id),
    sessionId: str(r.session_id),
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

  async createExhibition(input: ExhibitionInput): Promise<Exhibition> {
    const db = await this.db();
    const row = {
      id: uid("exh"),
      created_at: now(),
      ...exhibitionToRow(input),
    };
    const { data } = await db
      .from("exhibition")
      .insert(row)
      .select("*")
      .single();
    return mapExhibition((data ?? row) as Row);
  }

  async updateExhibition(
    id: string,
    input: Partial<ExhibitionInput>,
  ): Promise<Exhibition | null> {
    const db = await this.db();
    const { data } = await db
      .from("exhibition")
      .update(exhibitionToRow(input))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    return data ? mapExhibition(data as Row) : null;
  }

  async deleteExhibition(id: string): Promise<boolean> {
    const db = await this.db();
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
      const term = query.q.replace(/[%,]/g, " ").trim();
      if (term) q = q.or(`name.ilike.%${term}%,company.ilike.%${term}%`);
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

  async createBooth(input: BoothInput): Promise<Booth> {
    const db = await this.db();
    const row = { id: uid("booth"), created_at: now(), ...boothToRow(input) };
    const { data } = await db.from("booth").insert(row).select("*").single();
    return mapBooth((data ?? row) as Row);
  }

  async updateBooth(
    id: string,
    input: Partial<BoothInput>,
  ): Promise<Booth | null> {
    const db = await this.db();
    const { data } = await db
      .from("booth")
      .update(boothToRow(input))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    return data ? mapBooth(data as Row) : null;
  }

  async deleteBooth(id: string): Promise<boolean> {
    const db = await this.db();
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

  async createEvent(input: EventInput): Promise<BoothEvent> {
    const db = await this.db();
    const row = { id: uid("ev"), ...eventToRow(input) };
    const { data } = await db.from("event").insert(row).select("*").single();
    return mapEvent((data ?? row) as Row);
  }

  async updateEvent(
    id: string,
    input: Partial<EventInput>,
  ): Promise<BoothEvent | null> {
    const db = await this.db();
    const { data } = await db
      .from("event")
      .update(eventToRow(input))
      .eq("id", id)
      .select("*")
      .maybeSingle();
    return data ? mapEvent(data as Row) : null;
  }

  async deleteEvent(id: string): Promise<boolean> {
    const db = await this.db();
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
    const { data } = await db
      .from("welcome_kit")
      .upsert(row, { onConflict: "booth_id" })
      .select("*")
      .single();
    return mapWelcomeKit((data ?? row) as Row);
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
    const { data } = await db.from("review").insert(row).select("*").single();
    return mapReview((data ?? row) as Row);
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
    const { data } = await db
      .from("visitor_session")
      .insert(row)
      .select("*")
      .single();
    return mapSession((data ?? row) as Row);
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
    const { data } = await db
      .from("user_preference")
      .upsert(row, { onConflict: "session_id" })
      .select("*")
      .single();
    return mapPreference((data ?? row) as Row);
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
    const { data } = await db
      .from("route_plan")
      .insert(row)
      .select("*")
      .single();
    return mapRoute((data ?? row) as Row);
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
    const { data } = await db
      .from("route_plan")
      .delete()
      .eq("id", id)
      .select("id");
    return (data?.length ?? 0) > 0;
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
    const { data } = await db
      .from("route_plan")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
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
    const { data } = await db
      .from("route_plan")
      .update(update)
      .eq("id", id)
      .select("*")
      .maybeSingle();
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
    const { data } = await db.from("app_user").insert(row).select("*").single();
    return mapUser((data ?? row) as Row);
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
    const { data } = await db.from("app_user").insert(row).select("*").single();
    return mapUser((data ?? row) as Row);
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

  async upsertNote(
    userId: string,
    boothId: string,
    input: BoothNoteInput,
  ): Promise<BoothNote> {
    const db = await this.db();
    const status = input.status ?? null;
    const memo = input.memo ?? null;
    const photos = input.photos ?? [];
    // Empty note → delete so the gallery/back-end stays clean.
    if (!status && (memo == null || !memo.trim()) && photos.length === 0) {
      await db
        .from("booth_note")
        .delete()
        .eq("user_id", userId)
        .eq("booth_id", boothId);
      return { userId, boothId, updatedAt: now() };
    }
    const row = {
      user_id: userId,
      booth_id: boothId,
      status,
      memo,
      photos,
      updated_at: now(),
    };
    const { data } = await db
      .from("booth_note")
      .upsert(row, { onConflict: "user_id,booth_id" })
      .select("*")
      .single();
    return mapNote((data ?? row) as Row);
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

  async listBookmarks(sessionId: string): Promise<Bookmark[]> {
    const db = await this.db();
    const { data } = await db
      .from("bookmark")
      .select("*")
      .eq("session_id", sessionId);
    return (data ?? []).map(mapBookmark);
  }

  async addBookmark(
    sessionId: string,
    input: BookmarkInput,
  ): Promise<Bookmark> {
    const db = await this.db();
    const { data: existing } = await db
      .from("bookmark")
      .select("*")
      .eq("session_id", sessionId)
      .eq("target_type", input.targetType)
      .eq("target_id", input.targetId)
      .maybeSingle();
    if (existing) return mapBookmark(existing as Row);
    const row = {
      id: uid("bm"),
      session_id: sessionId,
      target_type: input.targetType,
      target_id: input.targetId,
      created_at: now(),
    };
    const { data } = await db.from("bookmark").insert(row).select("*").single();
    return mapBookmark((data ?? row) as Row);
  }

  async removeBookmark(
    sessionId: string,
    input: BookmarkInput,
  ): Promise<boolean> {
    const db = await this.db();
    const { error, count } = await db
      .from("bookmark")
      .delete({ count: "exact" })
      .eq("session_id", sessionId)
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
    const { data } = await db
      .from("community_post")
      .insert(row)
      .select("*")
      .single();
    return mapPost((data ?? row) as Row);
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
    const { data } = await db
      .from("community_post")
      .delete()
      .eq("id", id)
      .eq("session_id", sessionId)
      .select("media_public_id, media_type");
    const row = data?.[0];
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
    await db.from("analytics_event").insert({
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
  }

  async _allAnalytics(exhibitionId: string): Promise<AnalyticsEvent[]> {
    const db = await this.db();
    const { data } = await db
      .from("analytics_event")
      .select("*")
      .eq("exhibition_id", exhibitionId);
    return (data ?? []).map(mapAnalytics);
  }

  async logAiQuery(
    sessionId: string,
    exhibitionId: string,
    input: { text: string; keywords: string[] },
  ): Promise<void> {
    const db = await this.db();
    await db.from("ai_query_log").insert({
      id: uid("aq"),
      session_id: sessionId,
      exhibition_id: exhibitionId,
      text: input.text,
      keywords: input.keywords,
      created_at: now(),
    });
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

  async appendUserSignal(
    sig: Omit<UserSignal, "id" | "createdAt">,
  ): Promise<void> {
    const db = await this.db();
    await db.from("user_signal_log").insert({
      id: uid("sig"),
      user_id: sig.userId,
      exhibition_id: sig.exhibitionId,
      kind: sig.kind,
      booth_code: sig.boothCode ?? null,
      slugs: sig.slugs,
      created_at: now(),
    });
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
    await db.from("user_brain").upsert({
      user_id: brain.userId,
      data: brain,
      updated_at: now(),
    });
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
        return {
          boothId: b.id,
          name: b.name,
          views: views + Math.round(b.popularity * 1.2),
          arrivals: arrivals + Math.round(b.popularity * 0.4),
        };
      })
      .sort((a, b) => b.views - a.views)
      .slice(0, limit);
  }

  async analyticsFlow(
    exhibitionId: string,
  ): Promise<{ from: string; to: string; count: number }[]> {
    const all = await this._allAnalytics(exhibitionId);
    const an = all
      .filter((a) => a.type === "booth_arrive" && a.boothId)
      .sort(
        (a, b) =>
          a.sessionId.localeCompare(b.sessionId) ||
          a.createdAt.localeCompare(b.createdAt),
      );
    const edges = new Map<string, number>();
    for (let i = 1; i < an.length; i++) {
      if (an[i].sessionId !== an[i - 1].sessionId) continue;
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
    const db = await this.db();
    const an = await this._allAnalytics(exhibitionId);
    const { data: sessionRows } = await db
      .from("visitor_session")
      .select("id")
      .eq("exhibition_id", exhibitionId);
    const sessions = (sessionRows ?? []).length || 1;
    const { count: prefCount } = await db
      .from("user_preference")
      .select("session_id", { count: "exact", head: true });
    const prefs = prefCount ?? 0;
    const { data: routeRows } = await db
      .from("route_plan")
      .select("status")
      .eq("exhibition_id", exhibitionId);
    const routes = (routeRows ?? []) as Row[];
    const routeStart =
      an.filter((a) => a.type === "route_start").length || routes.length;
    const routeDone =
      an.filter((a) => a.type === "route_complete").length ||
      routes.filter((r) => str(r.status) === "completed").length;
    const stages = [
      { stage: "세션 시작", count: sessions },
      { stage: "온보딩 완료", count: prefs },
      { stage: "경로 시작", count: routeStart },
      { stage: "경로 완료", count: routeDone },
    ];
    const top = stages[0].count || 1;
    return stages.map((s) => ({
      ...s,
      rate: Number(((s.count / top) * 100).toFixed(1)),
    }));
  }
}
