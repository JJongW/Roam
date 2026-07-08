"use client";

import { createContext, useContext, useMemo } from "react";
import { DEFAULT_LOCALE, LOCALE_COOKIE, type Locale } from "@/lib/i18n/config";
import { DICTS } from "@/lib/i18n/dictionaries";
import { makeT, type TFn } from "@/lib/i18n/resolve";

const I18nContext = createContext<Locale>(DEFAULT_LOCALE);

/** 서버 레이아웃이 읽은 locale을 클라 트리에 주입. */
export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  return <I18nContext.Provider value={locale}>{children}</I18nContext.Provider>;
}

export function useLocale(): Locale {
  return useContext(I18nContext);
}

/** 클라 컴포넌트용 t. */
export function useT(): TFn {
  const locale = useContext(I18nContext);
  return useMemo(() => makeT(DICTS[locale]), [locale]);
}

/** 언어 변경 — 쿠키 설정 후 새로고침. */
export function setLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
}
