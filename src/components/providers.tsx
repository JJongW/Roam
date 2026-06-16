"use client";

import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { WebVitals } from "@/components/common/web-vitals";
import { AuthBootstrap, LoginSheet } from "@/components/auth/login-sheet";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="light"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <Toaster />
      <WebVitals />
      <AuthBootstrap />
      <LoginSheet />
    </ThemeProvider>
  );
}
