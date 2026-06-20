import { uid } from "@/lib/utils";
import { REPORT_HIDE_THRESHOLD } from "@/lib/constants";
import { createServerClient } from "@/lib/supabase/server";
import type { ListBoothQuery, Repository } from "@/lib/repositories/types";
import type {
  AnalyticsEvent,
  AnalyticsType,
  Booth,
  BoothDetail,
  BoothEvent,
  Bookmark,
  BookmarkTarget,
  BoothNote,
  Category,
  CommunityPost,
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
  UserPreference,
  VisitPurpose,
  VisitorSession,
  Waiting,
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
  WaitingInput,
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
function num(v: unknown): number {
  return typeof v === "number" ? v : Number(v ?? 0);
}
function strArr(v: unknown): string[] {
  return Array.isArray(v) ? (v as unknown[]).map((x) => String(x)) : [];
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

function mapBooth(r: Row): Booth {
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
    tags: strArr(r.tags),
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

function mapWaiting(r: Row): Waiting {
  return {
    boothId: str(r.booth_id),
    enabled: Boolean(r.enabled),
    queueCount: num(r.queue_count),
    estimatedMinutes: num(r.estimated_minutes),
    updatedAt: str(r.updated_at),
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
    rating: num(r.rating),
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
    visitPurpose: str(r.visit_purpose) as VisitPurpose,
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
    const { data: categories } = await db.from("category").select("*");
    return {
      exhibition,
      halls: (halls ?? []).map(mapHall),
      categories: (categories ?? []).map(mapCategory),
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
    let q = db.from("booth").select("*").eq("exhibition_id", exId);
    if (query?.hallId) q = q.eq("hall_id", query.hallId);
    if (query?.categoryId) q = q.eq("category_id", query.categoryId);
    const { data } = await q;
    let list = (data ?? []).map(mapBooth);
    if (query?.q) {
      const term = query.q.toLowerCase();
      list = list.filter(
        (b) =>
          b.name.toLowerCase().includes(term) ||
          b.company.toLowerCase().includes(term),
      );
    }
    list = list.sort(
      (a, b) => b.popularity - a.popularity || a.id.localeCompare(b.id),
    );
    return paginate(list, query?.cursor, query?.limit);
  }

  async listBoothsByExhibitionId(exhibitionId: string): Promise<Booth[]> {
    const db = await this.db();
    const { data } = await db
      .from("booth")
      .select("*")
      .eq("exhibition_id", exhibitionId);
    return (data ?? []).map(mapBooth);
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
    const { data: catRow } = await db
      .from("category")
      .select("*")
      .eq("id", booth.categoryId)
      .maybeSingle();
    const { data: reviewRows } = await db
      .from("review")
      .select("*")
      .eq("booth_id", id);
    const { data: waitingRow } = await db
      .from("waiting")
      .select("*")
      .eq("booth_id", id)
      .maybeSingle();
    const { data: kitRow } = await db
      .from("welcome_kit")
      .select("*")
      .eq("booth_id", id)
      .maybeSingle();
    const { data: eventRows } = await db
      .from("event")
      .select("*")
      .eq("booth_id", id);

    const reviews = (reviewRows ?? [])
      .map(mapReview)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const count = reviews.length;
    const avg = count
      ? Number((reviews.reduce((s, r) => s + r.rating, 0) / count).toFixed(2))
      : 0;
    return {
      booth,
      category: mapCategory((catRow ?? {}) as Row),
      waiting: waitingRow ? mapWaiting(waitingRow as Row) : undefined,
      welcomeKit: kitRow ? mapWelcomeKit(kitRow as Row) : undefined,
      events: (eventRows ?? [])
        .map(mapEvent)
        .sort((a, b) => a.startTime.localeCompare(b.startTime)),
      reviews,
      reviewSummary: { avg, count },
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

  // --- waiting / welcome kit ----------------------------------------------

  async getWaiting(boothId: string): Promise<Waiting | null> {
    const db = await this.db();
    const { data } = await db
      .from("waiting")
      .select("*")
      .eq("booth_id", boothId)
      .maybeSingle();
    return data ? mapWaiting(data as Row) : null;
  }

  async listWaitings(exhibitionId: string): Promise<Waiting[]> {
    const db = await this.db();
    const { data: boothRows } = await db
      .from("booth")
      .select("id")
      .eq("exhibition_id", exhibitionId);
    const ids = (boothRows ?? []).map((b) => String((b as Row).id));
    if (ids.length === 0) return [];
    const { data } = await db.from("waiting").select("*").in("booth_id", ids);
    return (data ?? []).map(mapWaiting);
  }

  async upsertWaiting(boothId: string, input: WaitingInput): Promise<Waiting> {
    const db = await this.db();
    const row = {
      booth_id: boothId,
      enabled: input.enabled,
      queue_count: input.queueCount,
      estimated_minutes: input.estimatedMinutes,
      updated_at: now(),
    };
    const { data } = await db
      .from("waiting")
      .upsert(row, { onConflict: "booth_id" })
      .select("*")
      .single();
    return mapWaiting((data ?? row) as Row);
  }

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
  ): Promise<Paginated<Review> & { summary: { avg: number; count: number } }> {
    const db = await this.db();
    const { data } = await db
      .from("review")
      .select("*")
      .eq("booth_id", boothId);
    const all = (data ?? [])
      .map(mapReview)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    const count = all.length;
    const avg = count
      ? Number((all.reduce((s, r) => s + r.rating, 0) / count).toFixed(2))
      : 0;
    return {
      ...paginate(all, opts?.cursor, opts?.limit),
      summary: { avg, count },
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
      rating: input.rating,
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
      visit_purpose: input.visitPurpose,
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
    // Empty note → delete so the gallery/back-end stays clean.
    if (!status && (memo == null || !memo.trim())) {
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
      updated_at: now(),
    };
    const { data } = await db
      .from("booth_note")
      .upsert(row, { onConflict: "user_id,booth_id" })
      .select("*")
      .single();
    return mapNote((data ?? row) as Row);
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

  async deletePost(id: string, sessionId: string): Promise<boolean> {
    const db = await this.db();
    const { data } = await db
      .from("community_post")
      .delete()
      .eq("id", id)
      .eq("session_id", sessionId)
      .select("id");
    return (data?.length ?? 0) > 0;
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
