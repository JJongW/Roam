/**
 * Next.js가 API route·RSC에서 발생하는 모든 uncaught 서버 예외를 여기로 보낸다
 * (App Router 표준 훅 — Sentry 같은 도구가 쓰는 바로 그 메커니즘). catch된 예외는
 * withErrorBoundary(http.ts)가 별도로 같은 captureServerIssue를 불러 잡는다.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
) {
  const { captureServerIssue } = await import("@/lib/api/issue-capture");
  await captureServerIssue({
    error,
    path: request.path.split("?")[0],
    method: request.method,
    headers: {
      get: (name: string) => request.headers[name.toLowerCase()] ?? null,
    },
  });
}
