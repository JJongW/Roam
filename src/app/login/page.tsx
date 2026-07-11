import { Suspense } from "react";
import { LoginForm } from "./login-form";
import { LegalLinks } from "@/components/common/legal-links";

export const metadata = {
  title: "로그인 · Roam",
};

/**
 * Dedicated login gate. The whole visitor app is behind auth (see
 * src/middleware.ts); unauthenticated requests are redirected here with a
 * `next` param (see src/proxy.ts). Suspense wraps the form (useSearchParams).
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6">
      <Suspense>
        <LoginForm />
      </Suspense>
      <LegalLinks className="mt-8 pb-safe" />
    </main>
  );
}
