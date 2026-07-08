import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { Providers } from "@/components/providers";
import { getLocale, hasLocaleCookie } from "@/lib/i18n/server";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(
    process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
  ),
  title: {
    default: "Roam — Exhibition Navigator",
    template: "%s · Roam",
  },
  description:
    "Discover booths, skip the crowds, and get a personalized route through any exhibition — no account needed.",
  applicationName: "Roam",
  openGraph: {
    title: "Roam — Exhibition Navigator",
    description: "Personalized routes and live booth info for exhibitions.",
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
  const [locale, hasLocale] = await Promise.all([
    getLocale(),
    hasLocaleCookie(),
  ]);
  return (
    <html
      lang={locale}
      className={`${inter.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-dvh bg-background text-foreground">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
        >
          {locale === "en" ? "Skip to content" : "본문으로 건너뛰기"}
        </a>
        <Providers locale={locale} needsLang={!hasLocale}>
          {children}
        </Providers>
      </body>
    </html>
  );
}
