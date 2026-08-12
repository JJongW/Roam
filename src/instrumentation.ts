/**
 * Next.js가 API route·RSC에서 발생하는 모든 uncaught 서버 예외를 여기로 보낸다
 * (App Router 표준 훅 — Sentry 같은 도구가 쓰는 바로 그 메커니즘). catch된 예외는
 * withErrorBoundary(http.ts)가 별도로 같은 captureServerIssue를 불러 잡는다.
 *
 * 전체를 try/catch로 감싼다 — Next.js가 내부 깊은 곳에서 이 훅을 호출하므로 여기서
 * 예외가 나가면 로그 한 줄을 잃는 것보다 훨씬 나쁘다.
 *
 * userId/sessionId는 일부러 안 채운다 — onRequestError는 런타임에 따라 쿠키/요청
 * 컨텍스트에 접근할 수 없다. 세션 정보가 붙는 건 withErrorBoundary 경로뿐이다.
 */
export async function onRequestError(
  error: unknown,
  request: { path: string; method: string; headers: Record<string, string> },
) {
  try {
    const { captureServerIssue } = await import("@/lib/api/issue-capture");
    await captureServerIssue({
      error,
      path: request.path.split("?")[0],
      method: request.method,
      headers: {
        get: (name: string) => request.headers[name.toLowerCase()] ?? null,
      },
    });
  } catch (e) {
    console.error("[instrumentation] 오류 캡처 실패:", e);
  }
}
