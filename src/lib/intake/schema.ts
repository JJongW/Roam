import { z } from "zod";
import { boothEnrichmentAuthorInputSchema } from "@/lib/schemas";
import { brandsFileSchema } from "./brands-schema";
import { EXHIBITION_FILE_VERSION, exhibitionFileSchema } from "./exhibition-file";

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
  /** 카테고리를 새로 만들 때 쓸 색(#RRGGBB). 칩·지도·부스 상세가 이 색을 읽는다.
   *  없으면 회색으로 만들어져 분야 구분이 사라진다(마곡 0054, DDP 2026-10-18) —
   *  주최 도면·현장 안내판의 색을 그대로 적는다. */
  categoryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
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

/**
 * `/admin/intake`가 받는 요청. 파일 `version`으로 가른다 — 1이면 부스(intake.v1),
 * "brands.v1"이면 브랜드 먼저 인입(brands-schema.ts), "exhibition.v1"이거나 version 없이 slug가 있으면
 * 행사 행(exhibition-file.ts). 경로는 하나다(CLAUDE.md 데이터 주입).
 */
export const intakeAnyRequestSchema = z.object({
  file: z.union([intakeFileSchema, brandsFileSchema, exhibitionFileSchema]),
  apply: z.boolean().default(false),
  /** intake.v1에만 쓴다. brands.v1은 빈 칸만 채우고 덮어쓰지 않는다. */
  overwrite: z.boolean().default(false),
});
export type IntakeAnyRequest = z.infer<typeof intakeAnyRequestSchema>;

export type IntakeFileKind = "booths" | "brands" | "exhibition";

export const INTAKE_FILE_KIND_LABEL: Record<IntakeFileKind, string> = {
  booths: "부스 파일(intake.v1)",
  brands: "브랜드 파일(brands.v1)",
  exhibition: "행사 행 파일(exhibition.v1)",
};

/** 파일 종류. `version`으로 먼저 가르고, version이 없으면 `slug` 칸이 있는 모양을 행사 행으로 본다. 모르면 null. */
export function intakeFileKind(raw: unknown): IntakeFileKind | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const o = raw as Record<string, unknown>;
  if (o.version === 1) return "booths";
  if (o.version === "brands.v1") return "brands";
  if (o.version === EXHIBITION_FILE_VERSION) return "exhibition";
  if (o.version === undefined && "slug" in o) return "exhibition";
  return null;
}

export interface IntakeFileIssue {
  /** 틀린 칸. "tips.ticket", "booths.3.code" 모양. 파일 전체면 빈 값. */
  path: string;
  message: string;
}

export type IntakeFileCheck =
  | { ok: true; kind: "booths"; file: IntakeFile }
  | { ok: true; kind: "brands"; file: z.infer<typeof brandsFileSchema> }
  | { ok: true; kind: "exhibition"; file: z.infer<typeof exhibitionFileSchema> }
  | { ok: false; kind: IntakeFileKind | null; issues: IntakeFileIssue[] };

/**
 * 인입 파일 형식 검사. `/admin/intake` 화면과 `scripts/intake-dry-run.ts`가 같이 부른다.
 * 틀리면 어느 칸이 왜 틀렸는지 전부 돌려준다(첫 하나만 보여 주면 두 칸이 틀렸을 때 두 번 올려야 안다).
 */
export function checkIntakeFile(raw: unknown): IntakeFileCheck {
  const kind = intakeFileKind(raw);
  if (!kind)
    return {
      ok: false,
      kind: null,
      issues: [{ path: "version", message: "모르는 파일이에요. intake.v1, brands.v1, 행사 행(exhibition.v1) 중 하나여야 해요" }],
    };
  const issuesOf = (e: z.ZodError): IntakeFileIssue[] => e.issues.map((i) => ({ path: i.path.join("."), message: issueMessage(i) }));
  if (kind === "booths") {
    const r = intakeFileSchema.safeParse(raw);
    return r.success ? { ok: true, kind, file: r.data } : { ok: false, kind, issues: issuesOf(r.error) };
  }
  if (kind === "brands") {
    const r = brandsFileSchema.safeParse(raw);
    return r.success ? { ok: true, kind, file: r.data } : { ok: false, kind, issues: issuesOf(r.error) };
  }
  const r = exhibitionFileSchema.safeParse(raw);
  return r.success ? { ok: true, kind, file: r.data } : { ok: false, kind, issues: issuesOf(r.error) };
}

/** zod 기본 문구(영어)를 관리자가 읽을 해요체로. 스키마에 적은 한국어 문구는 그대로 둔다. */
function issueMessage(i: z.core.$ZodIssue): string {
  switch (i.code) {
    case "invalid_type":
      return i.input === undefined ? "빠진 칸이에요" : `형식이 달라요(${i.expected}이어야 해요)`;
    case "unrecognized_keys":
      return `모르는 칸이에요: ${i.keys.join(", ")}`;
    case "too_small":
      return i.origin === "array" ? `${i.minimum}개 이상이어야 해요` : `너무 짧아요(${i.minimum} 이상)`;
    case "too_big":
      return i.origin === "array" ? `${i.maximum}개까지예요` : `너무 길어요(${i.maximum} 이하)`;
    case "invalid_value":
      return `이 값만 받아요: ${i.values.map((v) => JSON.stringify(v)).join(", ")}`;
    default:
      return /[가-힣]/.test(i.message) ? i.message : `형식이 안 맞아요(${i.message})`;
  }
}
