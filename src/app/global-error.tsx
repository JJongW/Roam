"use client";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ko">
      <body style={{ display: "flex", minHeight: "100dvh", alignItems: "center", justifyContent: "center", fontFamily: "system-ui" }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <h1 style={{ fontSize: 20, fontWeight: 800 }}>치명적인 오류가 발생했어요</h1>
          <p style={{ color: "#6b7684", marginTop: 8 }}>{error.digest ?? "Unexpected error"}</p>
          <button
            onClick={reset}
            style={{ marginTop: 16, padding: "10px 20px", borderRadius: 10, background: "#3182f6", color: "white", border: 0 }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
