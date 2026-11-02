import { cookies } from "next/headers";
import { getRepository } from "@/lib/repositories";
import { fail, ok, parseBody } from "@/lib/api/http";
import { surveyResponseInputSchema } from "@/lib/schemas";
import { SURVEY_ID } from "@/lib/survey/questions";
import { SURVEY_COOKIE } from "@/lib/constants";


// 공개 설문 응답 저장. 로그인 없이 받는다(`/survey`). 같은 사람이 다시 보내면 덮어쓴다.
export async function POST(req: Request) {
  const parsed = await parseBody(req, surveyResponseInputSchema);
  if (!parsed.ok) return parsed.res;

  const jar = await cookies();
  let respondentId = jar.get(SURVEY_COOKIE)?.value;
  if (!respondentId || !/^[0-9a-f-]{36}$/.test(respondentId)) {
    respondentId = crypto.randomUUID();
    jar.set(SURVEY_COOKIE, respondentId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  try {
    const repo = await getRepository();
    await repo.upsertSurveyResponse({
      surveyId: SURVEY_ID,
      respondentId,
      answers: parsed.data.answers,
      comment: parsed.data.comment || null,
      durationMs: parsed.data.durationMs ?? null,
    });
  } catch (e) {
    console.error("[survey] 저장 실패", e);
    return fail("INTERNAL", "답변을 저장하지 못했어요. 잠시 뒤 다시 보내 주세요.");
  }
  return ok({ saved: true });
}
