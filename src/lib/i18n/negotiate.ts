import { DEFAULT_LOCALE, LOCALES, type Locale } from "@/lib/i18n/config";

/**
 * Accept-Language 헤더에서 지원 locale 하나를 고른다. 순수 함수 — I/O 없음.
 *
 * 쿠키가 없는 첫 방문자의 언어를 정하는 유일한 근거다. 예전엔 이 자리에서 화면
 * 전체를 덮는 언어 선택 게이트를 띄웠는데, 그게 홈페이지를 가려 Google OAuth 인증이
 * "홈페이지에 앱의 목적에 관한 설명이 없다"로 반려됐다. 브라우저가 이미 선호 언어를
 * 보내주므로 물어볼 필요가 없다.
 *
 * `server.ts`가 아니라 여기 사는 이유: `server.ts`는 `server-only`라 테스트에서 못
 * 읽는다. 순수 로직은 I/O와 분리해 단위 테스트가 닿게 둔다.
 *
 * 헤더 예: "en-US,en;q=0.9,ko;q=0.8". q가 큰 순으로 보고 우리가 지원하는 첫 언어를
 * 쓴다. 지역 서브태그(en-US)는 기본 태그(en)로 잘라 비교한다.
 */
export function negotiate(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;
  const ranked = header
    .split(",")
    .map((part) => {
      const [tag, ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="))
        ?.slice(2);
      const quality = q === undefined ? 1 : Number.parseFloat(q);
      return {
        base: tag.trim().toLowerCase().split("-")[0],
        // 파싱 못 한 q는 0으로 — 잘못된 헤더가 최상위로 올라오면 안 된다.
        quality: Number.isFinite(quality) ? quality : 0,
      };
    })
    .filter((r) => r.quality > 0)
    .sort((a, b) => b.quality - a.quality);
  const hit = ranked.find((r) =>
    (LOCALES as readonly string[]).includes(r.base),
  );
  return (hit?.base as Locale) ?? DEFAULT_LOCALE;
}
