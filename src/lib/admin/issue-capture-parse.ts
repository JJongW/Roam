// 서버·클라이언트 오류 캡처가 공통으로 쓰는 순수 함수 — 새 npm 의존성 없음.
// UA 파싱은 흔한 케이스(iPhone/iPad/Android/Mac/Windows × Safari/Chrome/Firefox)만
// 다룬다 — 완전한 UA 파서를 만드는 게 아니라 admin이 "무슨 기기였는지" 감 잡을
// 정도면 충분하다.

const OS_PATTERNS: [RegExp, string][] = [
  [/iPhone/, "iPhone"],
  [/iPad/, "iPad"],
  [/Android/, "Android"],
  [/Macintosh/, "Mac"],
  [/Windows/, "Windows"],
];

const BROWSER_PATTERNS: [RegExp, string][] = [
  // Chrome UA 문자열에 "Safari"도 같이 들어있어서 Chrome을 먼저 검사해야 한다.
  [/Edg\//, "Edge"],
  [/Chrome\//, "Chrome"],
  [/Firefox\//, "Firefox"],
  [/Safari\//, "Safari"],
];

/** User-Agent → "iPhone · Safari" 같은 표시 문자열. 둘 다 못 찾으면 undefined. */
export function parseUserAgent(ua?: string): string | undefined {
  if (!ua) return undefined;
  const os = OS_PATTERNS.find(([re]) => re.test(ua))?.[1];
  const browser = BROWSER_PATTERNS.find(([re]) => re.test(ua))?.[1];
  if (!os && !browser) return undefined;
  return [os, browser].filter(Boolean).join(" · ");
}

/** Vercel이 모든 요청에 붙이는 지오 헤더를 읽는다. IP는 어디에도 담지 않는다.
 *  로컬 개발(Vercel 아님)에선 헤더가 없어 빈 객체가 나온다. */
export function geoFromHeaders(get: (name: string) => string | null): {
  country?: string;
  city?: string;
} {
  const country = get("x-vercel-ip-country") ?? undefined;
  const city = get("x-vercel-ip-city") ?? undefined;
  const result: { country?: string; city?: string } = {};
  if (country) result.country = country;
  if (city) result.city = city;
  return result;
}

const EMAIL_RE = /\S+@\S+\.\S+/g;
const JWT_RE =
  /\b[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const BEARER_RE = /Bearer\s+\S+/gi;
const API_KEY_RE = /\b(sk-|AIza)\S{10,}\b/g;

/** 이메일·JWT·Bearer 토큰·알려진 API 키 접두사만 좁게 마스킹한다. 자체 리소스
 *  ID(`prefix_영숫자`)는 의도적으로 건드리지 않는다 — 디버깅에 필요한 맥락이다. */
export function redact(text?: string): string | undefined {
  if (!text) return text;
  return text
    .replace(BEARER_RE, "[masked]")
    .replace(JWT_RE, "[masked]")
    .replace(API_KEY_RE, "[masked]")
    .replace(EMAIL_RE, "[masked]");
}

/** context 객체 **전체**(중첩 객체·배열 안 문자열까지)에 같은 마스킹을 적용한다.
 *  stringify(replacer) → 재파싱이라 깊이에 상관없이 한 번에 덮인다.
 *  ⚠️ 직렬화 결과 문자열에 redact를 통째로 거는 방식은 쓸 수 없다 — 이메일 패턴
 *  (`\S+@\S+\.\S+`)이 탐욕적이라 JSON 구분자(`","`)까지 삼켜 구조를 부순다. 그래서
 *  replacer로 **문자열 값 단위**로만 마스킹한다.
 *  마스킹 자체가 실패해도(순환 참조 등) 원본이 새지 않게 — 통째로 대체한다. */
export function redactContext(
  ctx?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!ctx) return ctx;
  try {
    const masked = JSON.stringify(ctx, (_k, v) =>
      typeof v === "string" ? redact(v) : v,
    );
    return masked ? (JSON.parse(masked) as Record<string, unknown>) : ctx;
  } catch {
    return { redacted: true };
  }
}
