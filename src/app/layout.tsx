import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { Providers } from "@/components/providers";
import { getLocale } from "@/lib/i18n/server";
import "./globals.css";

const pretendard = localFont({
  src: "../../node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2",
  weight: "45 920",
  variable: "--font-pretendard",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  // 홈 title은 동의 화면 앱 이름("Roam")과 글자까지 정확히 일치해야 한다 —
  // Google OAuth 브랜딩 인증은 <title>을 "홈페이지의 앱 이름"으로 읽어 동의 화면
  // 이름과 대조한다. "Roam — Exhibition Navigator"면 "이름 불일치"로 반려됐다.
  // 설명(Exhibition Navigator 성격)은 아래 description/og로 전달한다.
  title: {
    default: "Roam",
    template: "%s · Roam",
  },
  // 앱 목적을 그대로 적는다 — Google OAuth 심사가 홈페이지 설명을 확인하는 자리이고,
  // 예전 문구("no account needed")는 로그인 필수로 바뀐 뒤로 사실이 아니었다. 크롤러
  // 대상 설명은 한국어 사용자가 절대다수라 한국어로 남긴다(2026-08-13).
  description:
    "Roam은 전시·박람회 모바일 가이드입니다. 볼 만한 부스를 발견하고, 혼잡을 피하고, 관람한 것을 기록하세요.",
  applicationName: "Roam",
  openGraph: {
    siteName: "Roam",
    title: "Roam",
    description:
      "Roam은 전시·박람회 모바일 가이드입니다. 볼 만한 부스를 발견하고, 혼잡을 피하고, 관람한 것을 기록하세요.",
    type: "website",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // 웹뷰·iOS 홈 인디케이터 안전영역을 실제로 보고하게 함.
  // 없으면 env(safe-area-inset-*)=0 → pb-safe가 0.5rem 폴백으로 떨어져 하단 마진이 짧아짐.
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#0b0d10" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${pretendard.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          {locale === "en" ? "Skip to content" : "본문으로 건너뛰기"}
        </a>
        <Providers locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
