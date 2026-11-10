import { z } from "zod";

/**
 * 브랜드 먼저 인입 정규형 `brands.v1`(2026-11-10 Ted 결정: 브랜드가 우선이다).
 *
 * 부스 번호가 나오기 전에 참가 브랜드부터 넣는다. 나중에 intake.v1로 부스가 들어오면
 * 부스 연결(lib/exhibitor/plan.ts)이 인스타·도메인, 또는 같은 행사의 표기 이름으로 이 브랜드에 잇는다.
 * 경로는 intake.v1과 같은 `/admin/intake` 하나다 — 파일의 `version`으로 가른다.
 * 결정 기록: docs/decisions/2026-11-10_브랜드-먼저-인입.md
 */
export const BRANDS_FILE_VERSION = "brands.v1";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD로 적어 주세요");

export const brandsFileBrandSchema = z
  .object({
    /** 파일 안에서 유일한 열쇠. 다시 돌릴 때 같은 브랜드를 찾는 데도 쓴다(멱등). */
    key: z.string().trim().min(1).max(120),
    name: z.string().trim().min(1).max(120),
    /**
     * 사람이 같은 브랜드라고 확인한 기존 브랜드 id. 이름으로는 자동으로 합치지 않으므로,
     * 미리보기의 "이름만 같은 기존 브랜드"를 사람이 보고 이을 때만 적는다.
     */
    exhibitorId: z.string().trim().min(1).max(120).optional(),
    /** 법인 표기. 새로 만드는 브랜드의 exhibitor.legal_name에만 들어간다. */
    company: z.string().trim().min(1).max(120).optional(),
    aliases: z.array(z.string().trim().min(1).max(120)).max(30).optional(),
    instagramUrl: z.string().url().optional(),
    websiteUrl: z.string().url().optional(),
    /** 공식 소개 원문. 말투 변환은 워커가 한다(앱에는 게이트 통과본만 보인다). */
    intro: z
      .object({
        text: z.string().trim().min(1).max(4000),
        status: z.enum(["collected", "artist_confirmed"]),
        /** 원문을 가져온 곳(URL 또는 연락 기록 id). 프로필 칸 출처로 그대로 남는다. */
        source: z.string().trim().min(1).max(1000),
      })
      .strict()
      .optional(),
    /** profile.ts photos 칸 모양 그대로. */
    photos: z
      .array(z.object({ path: z.string().trim().min(1).max(1000), scope: z.string().trim().min(1).max(200) }).strict())
      .min(1)
      .max(20)
      .optional(),
    /** 이 행사에서의 분류(주최 표기). 참가 사실 metadata.category로만 남는다. */
    category: z.string().trim().min(1).max(60).optional(),
  })
  .strict();
export type BrandsFileBrand = z.infer<typeof brandsFileBrandSchema>;

export const brandsFileSchema = z
  .object({
    version: z.literal(BRANDS_FILE_VERSION),
    /** 없으면(null) 참가 사실 없이 브랜드만 넣는다. */
    exhibitionSlug: z.string().min(1).nullable(),
    source: z
      .object({
        url: z.string().url(),
        collectedAt: ymd,
        note: z.string().max(500).optional(),
      })
      .strict(),
    brands: z.array(brandsFileBrandSchema).min(1),
  })
  .superRefine((f, ctx) => {
    const seen = new Set<string>();
    f.brands.forEach((b, i) => {
      if (seen.has(b.key))
        ctx.addIssue({ code: "custom", path: ["brands", i, "key"], message: `파일 안에서 key가 겹쳐요: ${b.key}` });
      seen.add(b.key);
    });
  });
export type BrandsFile = z.infer<typeof brandsFileSchema>;
