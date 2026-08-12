"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // 렌더 중 부수효과지만 이 바운더리는 useEffect를 쓸 수 없는 최상위 컴포넌트다
  // (에러 화면조차 못 띄울 만큼 심각한 오류라 리포트만 최선을 다해 보낸다).
  if (typeof window !== "undefined") {
    fetch("/api/errors", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: error.message,
        stack: error.stack,
        path: window.location.pathname,
        digest: error.digest,
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
