import { z } from "zod";
import {
  AGE_GROUPS,
  ANALYTICS_TYPES,
  BOOKMARK_TARGETS,
  COMPANION_TYPES,
  MOVEMENT_PREFERENCES,
  ROUTE_STATUSES,
  VISIT_PURPOSES,
} from "@/lib/types";

export const visitPurposeSchema = z.enum(VISIT_PURPOSES);
export const movementSchema = z.enum(MOVEMENT_PREFERENCES);
export const companionSchema = z.enum(COMPANION_TYPES);

export const userPreferenceInputSchema = z.object({
  visitPurposes: z
    .array(visitPurposeSchema)
    .min(1, "방문 목적을 1개 이상 선택해 주세요")
    .max(VISIT_PURPOSES.length),
  interests: z
    .array(z.string())
    .min(1, "관심사를 1개 이상 선택해 주세요")
    .max(12),
  // The onboarding now only asks interests · age · purpose; pace/companion are
  // no longer prompted, so they fall back to sensible defaults here.
  availableMinutes: z.number().int().min(30).max(600).default(180),
  movementPreference: movementSchema.default("balanced"),
  companionType: companionSchema.default("alone"),
  /** Visitor age group (optional; collected in onboarding for future tuning). */
  age: z.enum(AGE_GROUPS).optional(),
  /** Keywords picked under interests — extra context (optional). */
  keywords: z.array(z.string()).max(40).optional(),
});
export type UserPreferenceInput = z.infer<typeof userPreferenceInputSchema>;

export const createSessionSchema = z.object({
  exhibitionId: z.string().min(1),
});

export const recommendationInputSchema = z.object({
  exhibitionSlug: z.string().min(1),
  preference: userPreferenceInputSchema,
});
export type RecommendationInput = z.infer<typeof recommendationInputSchema>;

export const routeInputSchema = z.object({
  exhibitionSlug: z.string().min(1),
  preference: userPreferenceInputSchema,
  startBoothId: z.string().optional(),
});
export type RouteInput = z.infer<typeof routeInputSchema>;

export const routePatchSchema = z.object({
  currentBoothId: z.string().optional(),
  visitedBoothIds: z.array(z.string()).optional(),
  status: z.enum(ROUTE_STATUSES).optional(),
  deviated: z.boolean().optional(),
  position: z.object({ x: z.number(), y: z.number() }).optional(),
  // manual route editing (add/remove booth → reordered set)
  boothIds: z.array(z.string()).optional(),
  estimatedMinutes: z.number().optional(),
  legs: z
    .array(
      z.object({
        from: z.string(),
        to: z.string(),
        minutes: z.number(),
        distance: z.number(),
      }),
    )
    .optional(),
});
export type RoutePatch = z.infer<typeof routePatchSchema>;

const routeLegSchema = z.object({
  from: z.string(),
  to: z.string(),
  minutes: z.number(),
  distance: z.number(),
});

/** Save the current route under a name (private; no login required). */
export const routeSaveSchema = z.object({
  exhibitionId: z.string().min(1),
  title: z.string().trim().min(1, "이름을 입력해 주세요").max(60),
  boothIds: z.array(z.string()).min(1, "담은 부스가 없어요"),
  estimatedMinutes: z.number().nonnegative().default(0),
  legs: z.array(routeLegSchema).default([]),
});
export type RouteSaveInput = z.infer<typeof routeSaveSchema>;

export const reviewInputSchema = z.object({
  comment: z.string().min(2, "내용을 입력해 주세요").max(500),
  authorName: z.string().min(1).max(30).default("익명"),
});
export type ReviewInput = z.infer<typeof reviewInputSchema>;

export const welcomeKitInputSchema = z.object({
  enabled: z.boolean(),
  name: z.string().min(1).max(60),
  description: z.string().max(300).default(""),
  imageUrl: z.string().url().optional(),
  remainingCount: z.number().int().min(0).max(99999),
});
export type WelcomeKitInput = z.infer<typeof welcomeKitInputSchema>;

export const bookmarkInputSchema = z.object({
  targetType: z.enum(BOOKMARK_TARGETS),
  targetId: z.string().min(1),
});
export type BookmarkInput = z.infer<typeof bookmarkInputSchema>;

export const exhibitionInputSchema = z.object({
  slug: z
    .string()
    .min(2)
    .regex(/^[a-z0-9-]+$/, "소문자·숫자·하이픈만"),
  name: z.string().min(2).max(120),
  venue: z.string().min(1).max(120),
  description: z.string().max(2000).default(""),
  startDate: z.string(),
  endDate: z.string(),
  coverImageUrl: z.string().url().optional(),
  mapImageUrl: z.string().url().optional(),
  mapWidth: z.number().int().min(100).max(10000).default(1000),
  mapHeight: z.number().int().min(100).max(10000).default(700),
  tips: z
    .object({
      transportation: z.string().optional(),
      parking: z.string().optional(),
      ticket: z.string().optional(),
      guide: z.string().optional(),
    })
    .default({}),
});
export type ExhibitionInput = z.infer<typeof exhibitionInputSchema>;

export const boothInputSchema = z.object({
  exhibitionId: z.string().min(1),
  hallId: z.string().min(1),
  categoryId: z.string().min(1),
  code: z.string().max(20).optional(),
  name: z.string().min(1).max(120),
  company: z.string().min(1).max(120),
  description: z.string().max(300).default(""),
  longDescription: z.string().max(4000).default(""),
  images: z.array(z.string()).default([]),
  logoUrl: z.string().optional(),
  instagramUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  tags: z.array(z.string()).default([]),
  x: z.number(),
  y: z.number(),
  popularity: z.number().int().min(0).max(100).default(50),
});
export type BoothInput = z.infer<typeof boothInputSchema>;

export const eventInputSchema = z.object({
  boothId: z.string().min(1),
  title: z.string().min(1).max(140),
  description: z.string().max(1000).default(""),
  startTime: z.string(),
  endTime: z.string(),
  rewardInfo: z.string().max(300).optional(),
  capacity: z.number().int().min(0).max(100000).optional(),
});
export type EventInput = z.infer<typeof eventInputSchema>;

export const analyticsEventInputSchema = z.object({
  type: z.enum(ANALYTICS_TYPES),
  boothId: z.string().optional(),
  x: z.number().optional(),
  y: z.number().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
});
export type AnalyticsEventInput = z.infer<typeof analyticsEventInputSchema>;

export const pushSubscribeSchema = z.object({ token: z.string().min(1) });

export const loginSchema = z.object({
  nickname: z
    .string()
    .trim()
    .min(2, "닉네임은 2자 이상이어야 해요")
    .max(20, "닉네임은 20자 이하여야 해요")
    .regex(/^[\w가-힣][\w가-힣 ]*$/, "사용할 수 없는 문자가 있어요"),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const boothNoteInputSchema = z.object({
  status: z.enum(["visited", "skipped"]).nullish(),
  memo: z.string().max(300).optional(),
  /** Personal photos (Cloudinary URLs). Capped to keep notes lightweight. */
  photos: z.array(z.string().url()).max(4).optional(),
});
export type BoothNoteInput = z.infer<typeof boothNoteInputSchema>;

export const routePublishSchema = z.object({
  title: z.string().trim().min(1, "동선 이름을 입력해 주세요").max(60),
  isPublic: z.boolean().default(true),
});
export type RoutePublishInput = z.infer<typeof routePublishSchema>;

export const communityPostInputSchema = z
  .object({
    body: z.string().max(500).default(""),
    authorName: z.string().min(1).max(30).default("익명"),
    boothId: z.string().optional(),
    mediaUrl: z.string().url().optional(),
    mediaType: z.enum(["image", "video"]).optional(),
    mediaPublicId: z.string().optional(),
  })
  // A post needs text or media (a photo-only "짤" is fine).
  .refine((d) => d.body.trim().length > 0 || Boolean(d.mediaUrl), {
    message: "내용이나 사진을 추가해 주세요",
    path: ["body"],
  });
export type CommunityPostInput = z.infer<typeof communityPostInputSchema>;

export const reportInputSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});
export type ReportInput = z.infer<typeof reportInputSchema>;
