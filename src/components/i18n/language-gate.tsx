"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/config";
import { setLocale } from "@/lib/i18n/provider";
import { RoamMotion } from "@/components/companion/roam-motion";
import { Button } from "@/components/ui/button";

/**
 * 첫 진입 언어 선택 게이트 — locale 쿠키가 없을 때 전역으로 뜬다(로그인보다 위).
 * 고르면 쿠키 설정 + 새로고침 → 서버가 그 언어로 다시 렌더. 언어 중립 화면.
 */
export function LanguageGate() {
  const router = useRouter();
  const [picked, setPicked] = useState<Locale | null>(null);

  function confirm() {
    if (!picked) return;
    setLocale(picked);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-[110] flex flex-col items-center justify-center gap-6 bg-background px-6 pb-8 pt-safe">
      <span className="flex size-24 items-center justify-center overflow-hidden rounded-[2rem]">
        <RoamMotion src="/walk_think.webm" />
      </span>
      <div className="text-center">
        <h1 className="text-2xl font-extrabold">언어를 골라줘</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Choose your language
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2.5">
        {LOCALES.map((l) => {
          const on = picked === l;
          return (
            <button
              key={l}
              type="button"
              onClick={() => setPicked(l)}
              aria-pressed={on}
              className={cn(
                "flex items-center justify-between rounded-2xl border px-5 py-4 text-left text-base font-bold active:scale-[0.99]",
                on
                  ? "border-primary bg-accent/60 text-primary"
                  : "border-border bg-card text-foreground",
              )}
            >
              {LOCALE_LABEL[l]}
              {on && <Check className="size-5" aria-hidden />}
            </button>
          );
        })}
      </div>

      <Button
        size="lg"
        className="w-full max-w-xs"
        onClick={confirm}
        disabled={!picked}
      >
        {picked === "en" ? "Continue" : "계속"}
      </Button>
    </div>
  );
}
