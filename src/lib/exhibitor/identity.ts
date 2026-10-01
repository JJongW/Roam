/**
 * 브랜드(참가사) 신원 판정 — 순수.
 *
 * 두 곳이 같은 규칙을 써야 한다:
 *  - 품질 게이트의 신원 앵커: "이 초안의 근거가 이 부스의 확인된 주소에 닿았나"
 *  - 참가사 연결: "두 회차의 부스가 같은 브랜드인가"
 * 둘이 갈리면 "같은 브랜드"의 정의가 둘이 된다(docs/superpowers/specs/2026-10-02-cross-exhibition-brand-design.md §4).
 */

export interface AnchorKey {
  /** 메시지에 보여줄 이름. */
  label: string;
  /** 근거의 제목·주소에 이 문자열이 있으면 이 부스 얘기로 본다. 신원 비교의 키이기도 하다. */
  match: string;
}

/** 여러 브랜드가 같은 호스트를 쓰는 곳 — 호스트가 아니라 계정(첫 경로)이 신원이다.
 *  예전엔 instagram.com 호스트로 맞대서, 근거에 남의 인스타가 하나만 있어도 통과했다. */
const PLATFORM_HOSTS = new Set([
  "instagram.com",
  "linktr.ee",
  "smartstore.naver.com",
  "m.smartstore.naver.com",
  "blog.naver.com",
  "m.blog.naver.com",
  "facebook.com",
  "youtube.com",
]);
/** 같은 회사가 .com과 .co.kr을 함께 쓰는 일이 흔하다(국순당여주명주 ksdyeoju.com ↔ .co.kr). */
const PUBLIC_SUFFIX = /\.(?:co|or|ne|go|ac|pe)\.kr$|\.[a-z]{2,6}$/;
/** 이보다 짧은 도메인 이름은 남의 도메인 안에도 흔히 들어 있어 신원이 못 된다. */
const MIN_STEM = 5;

export function anchorKey(url: string): AnchorKey | null {
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "").toLowerCase();
  if (PLATFORM_HOSTS.has(host) || PLATFORM_HOSTS.has(u.hostname.toLowerCase())) {
    const handle = u.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return handle ? { label: `${host}/${handle}`, match: `${host}/${handle}` } : null;
  }
  const stem = host.replace(PUBLIC_SUFFIX, "").split(".").pop() ?? "";
  if (stem.length < MIN_STEM) return { label: host, match: host };
  return { label: host, match: stem };
}

/** 이름 비교용 정규화 — 법인 표기·띄어쓰기·문장부호를 걷는다. */
export function flatName(s: string): string {
  return s
    .replace(/주식회사|농업회사법인|영농조합법인|유한회사|\(주\)|㈜|\(사\)|\(유\)|\(농\)/g, "")
    .replace(/[^0-9a-zA-Z가-힣぀-ヿ一-鿿]/g, "")
    .toLowerCase();
}

/** 이 부스를 **확정적으로** 가리키는 키들 — 인스타 계정, 웹 도메인(플랫폼이면 계정).
 *  키가 하나라도 겹치면 같은 브랜드다. 이름은 여기 들지 않는다(겹친다). */
export function identityKeys(b: { instagramUrl?: string; websiteUrl?: string }): string[] {
  return [b.instagramUrl, b.websiteUrl]
    .map((u) => (u ? anchorKey(u)?.match : null))
    .filter((k): k is string => Boolean(k));
}

/** 이름 키 — 3자 미만이면 신호가 못 된다. 같다고 같은 브랜드는 아니다(사람이 본다). */
export function nameKey(name: string): string | null {
  const k = flatName(name);
  return k.length >= 3 ? k : null;
}
