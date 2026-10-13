"use client";

import { useState } from "react";

/**
 * 이미지를 그리고, **못 불러오면 없는 것과 똑같이** fallback을 그린다.
 *
 * 지금까지 앱의 어떤 이미지에도 onError가 없었다. 각 자리엔 "이미지가 아예 없을
 * 때"의 대체 표시(카테고리 아이콘·이름 첫 글자)가 이미 잘 만들어져 있었는데,
 * **실패**는 그 길로 가지 못해 깨진 아이콘이나 빈 칸이 남았다. 현장 네트워크와
 * 외부 CDN을 생각하면 실패는 드문 일이 아니다.
 *
 * 클라이언트 잎 하나로 둔 이유: 부모(부스 카드·부스 상세)는 서버 컴포넌트라
 * 그쪽에 상태를 들이면 목록 전체가 클라이언트로 내려간다.
 */
export function ImageOrFallback({
  src,
  alt,
  className,
  fallback,
  loading = "lazy",
}: {
  src: string | null | undefined;
  alt: string;
  className?: string;
  /** 이미지가 없거나 실패했을 때 그릴 것. */
  fallback: React.ReactNode;
  loading?: "lazy" | "eager";
}) {
  // 실패한 src를 기억한다 — src가 바뀌면 자동으로 다시 시도한다(effect 불필요).
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) return <>{fallback}</>;
  return (
    // eslint-disable-next-line @next/next/no-img-element -- 외부 CDN 이미지
    <img
      src={src}
      alt={alt}
      loading={loading}
      className={className}
      onError={() => setFailedSrc(src)}
    />
  );
}
