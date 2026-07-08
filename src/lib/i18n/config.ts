// i18n 설정 — MVP는 한국어·영어 2개. locale은 쿠키(roam_lang)에 저장, 서버·클라 공유.
export const LOCALES = ["ko", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ko";
export const LOCALE_COOKIE = "roam_lang";

export const LOCALE_LABEL: Record<Locale, string> = {
  ko: "한국어",
  en: "English",
};

export function isLocale(v: string | undefined | null): v is Locale {
  return v === "ko" || v === "en";
}
