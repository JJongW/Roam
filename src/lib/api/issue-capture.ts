import { getRepository } from "@/lib/repositories";
import {
  parseUserAgent,
  geoFromHeaders,
  redact,
  redactContext,
} from "@/lib/admin/issue-capture-parse";

/** 서버에서 잡힌 오류(uncaught든 route가 catch했든) 하나를 issue_log에 적재한다.
 *  절대 throw하지 않는다 — 로깅 실패가 원래 요청에 영향을 주면 안 된다.
 *  instrumentation.ts(onRequestError)와 withErrorBoundary 둘 다 이 함수 하나만 쓴다
 *  — 마스킹·기기·위치 파싱 로직을 두 곳에 중복시키지 않는다. */
export async function captureServerIssue(input: {
  error: unknown;
  path: string;
  method?: string;
  headers?: { get(name: string): string | null };
  userId?: string;
  sessionId?: string;
  digest?: string;
}): Promise<void> {
  try {
    const err = input.error instanceof Error
      ? input.error
      : new Error(String(input.error));
    const geo = input.headers
      ? geoFromHeaders((n) => input.headers!.get(n))
      : {};
    const repo = await getRepository();
    await repo.logIssue({
      source: "server",
      message: redact(err.message) ?? err.message,
      stack: redact(err.stack),
      path: input.path,
      digest: input.digest ?? (err as Error & { digest?: string }).digest,
      userId: input.userId,
      sessionId: input.sessionId,
      device: parseUserAgent(input.headers?.get("user-agent") ?? undefined),
      country: geo.country,
      city: geo.city,
      context: redactContext(
        input.method ? { method: input.method } : undefined,
      ),
    });
  } catch (e) {
    // 로깅 자체가 실패해도 원래 요청엔 이미 응답이 나갔다 — 콘솔에만 남긴다.
    console.error("[issue-capture] 서버 오류 캡처 실패:", e);
  }
}
