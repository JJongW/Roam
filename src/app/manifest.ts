import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    // 이름은 어디서나 "Roam" 단독 — 부제("— Exhibition Navigator")는 폐기됐다.
    // ① Navigator는 폐기된 동선·내비 프레이밍을 되살리고, ② 이름이 두 가지로
    // 보이면 Google OAuth 브랜딩 심사에서 "이름 불일치" 반려 위험이 생긴다
    // (layout.tsx의 title 주석 참조). docs/brand/04_naming-messaging.md §1.
    name: "Roam",
    short_name: "Roam",
    description:
      "지금까지 파악한 네 취향으로 부스를 골라 제안하고, 네 반응에 따라 맞춰가는 관람 동행자.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      // maskable은 안전영역(중앙 80% 원) 안에 마크가 들어가도록 별도로 그린 판본이다.
      // any 아이콘을 그대로 쓰면 Android 어댑티브 마스크에서 글리프가 잘린다.
      {
        src: "/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
