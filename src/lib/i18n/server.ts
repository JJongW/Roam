import "server-only";
import { cookies, headers } from "next/headers";
import { LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";
import { negotiate } from "@/lib/i18n/negotiate";
import { DICTS } from "@/lib/i18n/dictionaries";
import { makeT, type TFn } from "@/lib/i18n/resolve";

/**
 * 현재 locale — 쿠키 > 브라우저 Accept-Language > 기본(ko).
 *
 * 예전엔 쿠키가 없으면 화면 전체를 덮는 언어 선택 게이트를 띄웠다. 그 결과 처음 온
 * 사람(그리고 Google OAuth 심사관)이 보는 첫 화면이 홈이 아니라 **모달 다이얼로그**였고,
 * 인증 심사가 "홈페이지에 앱의 목적에 관한 설명이 없다"로 반려했다. 브라우저가 이미
 * 선호 언어를 보내주므로 물어볼 필요가 없다 — 자동 판별하고, 바꾸고 싶으면 푸터의
 * 언어 전환으로 바꾼다. 협상 로직은 `negotiate.ts`(순수·테스트 있음).
 */
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const fromCookie = c.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  return negotiate((await headers()).get("accept-language"));
}

/** 서버 컴포넌트용 i18n 번들. */
export async function getI18n(): Promise<{ locale: Locale; t: TFn }> {
  const locale = await getLocale();
  return { locale, t: makeT(DICTS[locale]) };
}
