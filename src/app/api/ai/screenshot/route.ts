import { z } from "zod";
import { getRepository } from "@/lib/repositories";
import { ok, fail, notFound, parseBody, withErrorBoundary } from "@/lib/api/http";
import { hasGemini, generateJSONFromImage } from "@/lib/ai/gemini";
import { matchTermsToBooths } from "@/lib/ai/screenshot-match";

// ~10MB image → base64 inflates ~1.34x. Cap the payload so a stray upload
// can't blow the request body.
const MAX_BASE64 = 14_000_000;

const bodySchema = z.object({
  exhibitionSlug: z.string().min(1),
  image: z.string().min(1).max(MAX_BASE64, "이미지가 너무 커요"),
  mimeType: z.enum(["image/png", "image/jpeg", "image/webp"]),
});

const visionSchema = z.object({
  detectedTerms: z.array(z.string()).max(50),
});

const VISION_PROMPT = `이 이미지는 도서전 방문자가 저장한 스크린샷(인스타그램 게시물·캡처 등)입니다.
이미지에서 보이는 출판사명·브랜드명·부스명·작가명·도서 제목 등 "고유명사"만 추출하세요.
- 짧은 고유명사 단위로 (문장 X, 설명 X).
- 한글/영문 모두 원문 그대로.
- 중복 제거. 확실치 않으면 포함하지 마세요.
JSON: {"detectedTerms": string[]}`;

/**
 * Screenshot → booth candidates. Gemini extracts publisher/brand/title strings
 * from the image (perception only); matching to real booths is deterministic
 * (see matchTermsToBooths), so unmatched terms surface honestly as no-match.
 */
export async function POST(req: Request) {
  return withErrorBoundary(async () => {
    if (!hasGemini) return fail("INTERNAL", "AI 판독이 설정되지 않았어요");

    const parsed = await parseBody(req, bodySchema);
    if (!parsed.ok) return parsed.res;
    const { exhibitionSlug, image, mimeType } = parsed.data;

    const repo = await getRepository();
    const detail = await repo.getExhibition(exhibitionSlug);
    if (!detail) return notFound("전시를 찾을 수 없습니다");

    let detectedTerms: string[];
    try {
      const vision = await generateJSONFromImage({
        prompt: VISION_PROMPT,
        image: { data: image, mimeType },
        schema: visionSchema,
      });
      detectedTerms = vision.detectedTerms;
    } catch (e) {
      console.error("[ai/screenshot] vision failed", e);
      return fail("UNPROCESSABLE", "스크린샷을 판독하지 못했어요");
    }

    const booths = await repo.listBoothsByExhibitionId(detail.exhibition.id);
    const boothById = new Map(booths.map((b) => [b.id, b]));
    const { matches, unmatched } = matchTermsToBooths(detectedTerms, booths);

    const candidates = matches
      .map((m) => {
        const booth = boothById.get(m.boothId);
        return booth ? { booth, confidence: m.confidence, term: m.term } : null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    return ok({ candidates, unmatched, detectedCount: detectedTerms.length });
  });
}
