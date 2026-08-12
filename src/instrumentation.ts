/**
 * Next.js가 API route·RSC에서 발생하는 모든 서버 예외를 여기로 보낸다(App
 * Router 표준 훅 — Sentry 같은 도구가 쓰는 바로 그 메커니즘). 기존 route 51개를
 * 일일이 try/catch로 감싸는 대신 이 파일 하나로 전부 잡는다.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
) {
  try {
    const { getRepository } = await import("@/lib/repositories");
    const repo = await getRepository();
    const err = error instanceof Error ? error : new Error(String(error));
    await repo.logIssue({
      source: "server",
      message: err.message,
      stack: err.stack,
      path: request.path.split("?")[0],
      digest: (err as Error & { digest?: string }).digest,
      context: { method: request.method },
    });
  } catch (e) {
    // 로깅 자체가 실패해도 원래 요청엔 이미 응답이 나갔다 — 콘솔에만 남긴다.
    console.error("[instrumentation] 오류 로깅 실패:", e);
  }
}
