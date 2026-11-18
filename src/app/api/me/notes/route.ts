import { getRepository } from "@/lib/repositories";
import { fail, ok } from "@/lib/api/http";
import { getCurrentUser } from "@/lib/api/session";

/**
 * 내 노트 전부(모든 박람회).
 * `?expand=booth`면 부스 이름, 번호, 분류, 박람회(slug, 이름, 행사장, 날짜), 대표 브랜드를
 * 붙여 준다 — 마이페이지와 내보내기용(설계서 B A-1, D 6-2). 기본 응답 모양은 그대로다.
 */
export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return fail("UNAUTHORIZED", "로그인이 필요해요");
  const repo = await getRepository();
  const expand = new URL(req.url).searchParams.get("expand");
  const data =
    expand === "booth"
      ? await repo.listNotesWithContext(user.id)
      : await repo.listNotes(user.id);
  return ok({ data });
}
