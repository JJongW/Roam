import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";
import { getRepository } from "@/lib/repositories";
import { reentryView } from "@/lib/brands/reentry";

/**
 * 오래 쉰 뒤 홈(UI 18-06B). 좋아요를 직접 남긴 브랜드(부스 평가 좋았어요, 브랜드 하트) 중
 * 아직 안 끝난 박람회에 참가하는 곳과 그 다음 참가. 쉰 기간 판정과 회고 글은 앱이 기기에서 한다.
 */
export async function GET() {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();
  return ok({ data: await reentryView(repo, user.id) });
}
