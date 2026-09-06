import { z } from "zod";
import { boothEnrichmentAuthorInputSchema } from "@/lib/schemas";

/**
 * 전시 인입 정규형 v1 — 주최 측 CSV든 우리가 손으로 쓴 것이든 참가사 폼이든,
 * 인입 파이프라인은 이 모양만 받는다(docs/admin-automation-architecture.md §5).
 *
 * 좌표(x·y)는 일부러 없다. FLOORPLANS[slug]가 code로 대준다 — 좌표를 계약에도
 * 두면 도면과 갈라지고, 어느 쪽이 진실인지 아무도 모르게 된다.
 */
export const intakeBoothSchema = z.object({
  /** 부스 자연키. 전시 안에서 유일해야 한다. */
  code: z.string().min(1).max(20),
  name: z.string().min(1).max(120).optional(),
  company: z.string().max(120).optional(),
  /** 홀 이름(id 아님). 없는 이름이면 만든다. */
  hall: z.string().min(1).max(60).optional(),
  /** 카테고리 이름(id 아님). 없는 이름이면 만든다. */
  category: z.string().min(1).max(60).optional(),
  /** 카테고리를 새로 만들 때 쓸 slug. category.slug은 전역 unique이고
   *  booth.tags에 그대로 들어가 추천 스코어링이 읽는 값이라, 한글 이름에서
   *  파생하지 않고 명시로 받는다. 이미 있는 카테고리면 없어도 된다. */
  categorySlug: z.string().min(1).max(40).regex(/^[a-z0-9-]+$/).optional(),
  kind: z.enum(["exhibitor", "facility"]).optional(),
  description: z.string().max(300).optional(),
  longDescription: z.string().max(4000).optional(),
  images: z.array(z.string()).optional(),
  logoUrl: z.string().optional(),
  instagramUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  /** 분야 축 slug. enrichment.themeTags와 달리 여기 것은 그대로 booth.tags. */
  tags: z.array(z.string()).optional(),
  aliases: z.array(z.string()).optional(),
  /** 6종 저작 필드. 전부 optional — 명단만 먼저 올리고 나중에 채워도 된다. */
  enrichment: boothEnrichmentAuthorInputSchema.partial().optional(),
});
export type IntakeBooth = z.infer<typeof intakeBoothSchema>;

export const intakeFileSchema = z.object({
  version: z.literal(1),
  exhibitionSlug: z.string().min(1),
  booths: z.array(intakeBoothSchema).min(1),
});
export type IntakeFile = z.infer<typeof intakeFileSchema>;

export const intakeRequestSchema = z.object({
  file: intakeFileSchema,
  /** false(기본)면 계획만 계산하고 아무것도 쓰지 않는다. */
  apply: z.boolean().default(false),
  /** true면 충돌도 덮어쓴다. 미리보기에서 사람이 켜야 한다. */
  overwrite: z.boolean().default(false),
});
export type IntakeRequest = z.infer<typeof intakeRequestSchema>;
