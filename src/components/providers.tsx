"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { WebVitals } from "@/components/common/web-vitals";
import { ErrorReporter } from "@/components/monitoring/error-reporter";
import { AuthBootstrap, LoginSheet } from "@/components/auth/login-sheet";
import { I18nProvider } from "@/lib/i18n/provider";
import type { Locale } from "@/lib/i18n/config";

/**
 * locale은 서버가 정해서 내려준다(쿠키 > Accept-Language > ko, `i18n/server.ts`).
 * 예전엔 쿠키가 없으면 화면 전체를 덮는 언어 선택 게이트를 여기서 띄웠는데, 그게
 * 홈페이지를 가려 Google OAuth 인증이 반려됐다. 언어 변경은 푸터의 LanguageSwitch.
 */
export function Providers({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: Locale;
}) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      <I18nProvider locale={locale}>
        {children}
        <Toaster />
        <WebVitals />
        <ErrorReporter />
        <AuthBootstrap />
        <LoginSheet />
      </I18nProvider>
    </ThemeProvider>
  );
}
