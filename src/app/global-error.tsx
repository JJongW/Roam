"use client";

const globalErrorState = { reported: false };

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 렌더 중 부수효과지만 이 바운더리는 useEffect를 쓸 수 없는 최상위 컴포넌트다
  // (에러 화면조차 못 띄울 만큼 심각한 오류라 리포트만 최선을 다해 보낸다).
  // digest가 있으면 서버가 이미 실제 메시지로 기록했다 — 리다크트된 것만 또 남기지 않는다.
  if (
    typeof window !== "undefined" &&
    !error.digest &&
    !globalErrorState.reported
  ) {
    // eslint-disable-next-line react-hooks/immutability -- 최상위 오류 바운더리라 useEffect를 쓸 수 없다; 모듈 스코프 플래그로 StrictMode/재렌더 중복 전송만 막는다
    globalErrorState.reported = true;
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        path: window.location.pathname,
        digest: error.digest,
        userAgent: navigator.userAgent,
      }),
    }).catch(() => {});
  }

  return (
    <html lang="ko">
      <body
        style={{
          display: "flex",
          minHeight: "100dvh",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "system-ui",
        }}
      >
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>큰 오류가 생겼어</h1>
          <p style={{ color: "#6b7684", marginTop: 8 }}>
            {error.digest ?? "Unexpected error"}
          </p>
          <button
            onClick={reset}
            style={{
              marginTop: 16,
              padding: "10px 20px",
              borderRadius: 10,
              background: "#4f46e5",
              color: "white",
              border: 0,
            }}
          >
            다시 해보기
          </button>
        </div>
      </body>
    </html>
  );
}
