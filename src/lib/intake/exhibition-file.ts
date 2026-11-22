import { z } from "zod";
import { exhibitionInputSchema, type ExhibitionInput } from "@/lib/schemas";
import type { Repository } from "@/lib/repositories/types";

/**
 * 행사 행 파일(`data/exhibitions/<slug>.json`) — `/admin/intake`에 올려 미리보기 뒤 행사 행을 만든다.
 *
 * 예전엔 로그인된 어드민 탭 콘솔에 `fetch("/api/exhibitions", POST)`를 붙여 넣어 만들었다(2026-11-22 Ted "위험한 거 같은데").
 * 이름은 brands.v1처럼 `exhibition.v1`이고 `version` 칸은 **없어도 된다** — 레포에 이미 있는 행사 파일은
 * version 없이 `slug`로 시작하고, 그 모양(version 없음 + slug)만으로 intake.v1(`exhibitionSlug`), brands.v1과 갈린다.
 * 새로 쓰는 파일엔 `"version": "exhibition.v1"`을 적어도 된다(docs/decisions/2026-11-22_행사-행-인입.md).
 *
 * 칸은 `POST /api/exhibitions`와 같은 exhibitionInputSchema이고, 파일이라 몇 가지를 더 막는다.
 * - 모르는 칸은 오류다. 오타 난 칸(`tip`, `venu`)이 조용히 버려지면 안내 문구 없이 행사가 생긴다.
 * - 날짜는 2026-11-26 모양이고, 끝나는 날이 시작일보다 앞일 수 없다.
 *
 * 순수 함수와 타입만 둔다. 화면(intake-uploader), 라우트(/api/admin/intake), 드라이런 스크립트가 같이 쓴다.
 */
export const EXHIBITION_FILE_VERSION = "exhibition.v1";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 2026-11-26 모양으로 적어요");

export const exhibitionFileSchema = exhibitionInputSchema
  .extend({
    version: z.literal(EXHIBITION_FILE_VERSION).optional(),
    startDate: isoDate,
    endDate: isoDate,
    tips: exhibitionInputSchema.shape.tips.unwrap().strict().default({}),
  })
  .strict()
  .superRefine((f, ctx) => {
    if (f.endDate < f.startDate)
      ctx.addIssue({ code: "custom", path: ["endDate"], message: "끝나는 날이 시작일보다 앞이에요" });
  });
export type ExhibitionFile = z.infer<typeof exhibitionFileSchema>;

/** 파일에서 version을 뗀 행사 행 본문. createExhibition에 그대로 넘긴다. */
export function exhibitionInputOf(file: ExhibitionFile): ExhibitionInput {
  const input: ExhibitionInput & { version?: string } = { ...file };
  delete input.version;
  return input;
}

export interface ExhibitionPlan {
  /** create: 운영에 같은 slug가 없어 만든다. exists: 이미 있어 만들지 않는다(덮어쓰기는 없다). */
  status: "create" | "exists";
  /** exists일 때 운영 행사 id. */
  existingId: string | null;
  exhibition: ExhibitionInput;
}

/** 같은 slug의 운영 행이 있는지만 본다. 읽기만 한다. */
export async function planExhibitionFromRepository(
  repo: Pick<Repository, "getExhibitionIdBySlug">,
  file: ExhibitionFile,
): Promise<ExhibitionPlan> {
  const existingId = await repo.getExhibitionIdBySlug(file.slug);
  return { status: existingId ? "exists" : "create", existingId, exhibition: exhibitionInputOf(file) };
}
