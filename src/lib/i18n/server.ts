import "server-only";
import { cookies } from "next/headers";
import { DEFAULT_LOCALE, LOCALE_COOKIE, isLocale, type Locale } from "@/lib/i18n/config";
import { DICTS } from "@/lib/i18n/dictionaries";
import { makeT, type TFn } from "@/lib/i18n/resolve";

/** 쿠키에서 현재 locale. 없으면 기본(ko). */
export async function getLocale(): Promise<Locale> {
  const c = await cookies();
  const v = c.get(LOCALE_COOKIE)?.value;
  return isLocale(v) ? v : DEFAULT_LOCALE;
}

/** 쿠키에 locale 설정 여부(언어 게이트 노출 판단용). */
export async function hasLocaleCookie(): Promise<boolean> {
  const c = await cookies();
  return isLocale(c.get(LOCALE_COOKIE)?.value);
}

/** 서버 컴포넌트용 i18n 번들. */
export async function getI18n(): Promise<{ locale: Locale; t: TFn }> {
  const locale = await getLocale();
  return { locale, t: makeT(DICTS[locale]) };
}
