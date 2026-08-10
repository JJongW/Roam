"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { LOCALES, LOCALE_LABEL, type Locale } from "@/lib/i18n/config";
import { setLocale } from "@/lib/i18n/provider";
import { RoamMotion } from "@/components/companion/roam-motion";
import { LegalLinks } from "@/components/common/legal-links";
import { Button } from "@/components/ui/button";

/**
 * 첫 진입 언어 선택 게이트 — locale 쿠키가 없을 때 전역으로 뜬다(로그인보다 위).
 * 고르면 쿠키 설정 + 새로고침 → 서버가 그 언어로 다시 렌더. 언어 중립 화면.
 *
 * 이 화면은 **쿠키 없는 방문자가 보는 첫 화면**이다 — 검색엔진 크롤러와 Google OAuth
 * 심사관도 여기부터 본다. 그래서 언어 선택보다 먼저 **앱 이름(Roam)과 목적**을 밝힌다.
 * 예전엔 h1이 "언어를 골라줘"뿐이라, Google 인증 심사가 "홈페이지에 앱 목적 설명이
 * 없고 OAuth 동의 화면의 앱 이름과 일치하지 않는다"는 사유로 반려했다.
 * 아직 언어를 모르는 시점이므로 소개문은 한국어·영어를 나란히 둔다.
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

      {/* 앱 이름 + 목적 — 언어 선택보다 위. OAuth 동의 화면의 앱 이름("Roam")과
          여기 표기가 반드시 같아야 한다. */}
      <div className="flex flex-col items-center gap-3 text-center">
        {/* 워드마크만 — 위 로미 영상이 이미 같은 마크(poster=logo.svg)라 배지를 또 달면 중복. */}
        <h1 className="text-3xl font-extrabold tracking-tight">Roam</h1>
        <p className="max-w-[20rem] text-[13px] leading-relaxed text-muted-foreground">
          Roam은 전시·박람회 관람 가이드야. 관심 가는 부스를 찾고, 전시장에서
          길을 잡고, 본 것을 기록해.
          <span className="mt-1.5 block">
            Roam is a guide for exhibitions and trade fairs. Discover booths
            worth your time, find your way around the venue, and keep track of
            what you saw.
          </span>
        </p>
      </div>

      <div className="flex w-full max-w-xs flex-col gap-2.5">
        <p className="text-center text-sm font-bold">
          언어를 골라줘
          <span className="ml-1.5 font-medium text-muted-foreground">
            Choose your language
          </span>
        </p>
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

      {/* 이 게이트가 화면 전체를 덮으므로 홈 푸터는 여기서 보이지 않는다. Google OAuth
          인증은 홈페이지에서 개인정보처리방침에 닿을 것을 요구하니 링크를 여기에도 둔다. */}
      <LegalLinks />
    </div>
  );
}
