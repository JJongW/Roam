import { getRepository } from "@/lib/repositories";
import { ok, parseBody, getUserId, getSessionId } from "@/lib/api/http";
import { errorReportSchema } from "@/lib/schemas";

// 로그인 게이트 뒤에 있는 앱이라 오남용 위험이 낮다 — 별도 인증 없이 열어둔다.
// (CLAUDE.md: 방문객 앱 전체가 인증 게이트 뒤에 있다)
export async function POST(req: Request) {
  const parsed = await parseBody(req, errorReportSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const [userId, sessionId] = await Promise.all([getUserId(), getSessionId()]);
  await repo.logIssue({
    source: "client",
    message: parsed.data.message,
    stack: parsed.data.stack,
    path: parsed.data.path,
    digest: parsed.data.digest,
    userId: userId ?? undefined,
    sessionId: sessionId ?? undefined,
    context: parsed.data.context,
  });
  return ok(null);
}
