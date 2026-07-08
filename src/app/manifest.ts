import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Roam — Exhibition Navigator",
    short_name: "Roam",
    description: "너한테 의미 있을 부스를 함께 골라 보는 전시 관람 컴패니언",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#4f46e5",
    icons: [{ src: "/logo.svg", sizes: "any", type: "image/svg+xml" }],
  };
}
