"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { WebVitals } from "@/components/common/web-vitals";
import { AuthBootstrap, LoginSheet } from "@/components/auth/login-sheet";
import { I18nProvider } from "@/lib/i18n/provider";
import { LanguageGate } from "@/components/i18n/language-gate";
import type { Locale } from "@/lib/i18n/config";

export function Providers({
  children,
  locale,
  needsLang,
}: {
  children: React.ReactNode;
  locale: Locale;
  needsLang: boolean;
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
        <AuthBootstrap />
        <LoginSheet />
        {needsLang && <LanguageGate />}
      </I18nProvider>
    </ThemeProvider>
  );
}
