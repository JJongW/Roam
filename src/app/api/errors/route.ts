import { getRepository } from "@/lib/repositories";
import { ok, parseBody, getUserId, getSessionId } from "@/lib/api/http";
import { errorReportSchema } from "@/lib/schemas";
import {
  parseUserAgent,
  geoFromHeaders,
  redact,
  redactContext,
} from "@/lib/admin/issue-capture-parse";

// /api 경로는 src/proxy.ts의 로그인 게이트 대상이 아니다(전부 제외) — 이 라우트는
// 진짜로 인증 없이 열려 있다. 방문객 앱 화면은 게이트 뒤에 있지만 이 API 자체는 아니다.
export async function POST(req: Request) {
  const parsed = await parseBody(req, errorReportSchema);
  if (!parsed.ok) return parsed.res;
  const repo = await getRepository();
  const [userId, sessionId] = await Promise.all([getUserId(), getSessionId()]);
  const geo = geoFromHeaders((n) => req.headers.get(n));
  await repo.logIssue({
    source: "client",
    message: redact(parsed.data.message) ?? parsed.data.message,
    stack: redact(parsed.data.stack),
    path: parsed.data.path,
    digest: parsed.data.digest,
    userId: userId ?? undefined,
    sessionId: sessionId ?? undefined,
    // 본문에 UA가 없으면 요청 헤더의 UA로 폴백한다.
    device: parseUserAgent(
      parsed.data.userAgent ?? req.headers.get("user-agent") ?? undefined,
    ),
    country: geo.country,
    city: geo.city,
    context: redactContext(parsed.data.context),
  });
  return ok(null);
}
