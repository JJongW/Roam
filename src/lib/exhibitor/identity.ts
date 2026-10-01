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

/** 경로 첫 칸으로 계정을 나누는 곳 — 호스트가 같아도 계정이 다르면 다른 브랜드다.
 *  예전엔 instagram.com 호스트로 맞대서, 근거에 남의 인스타가 하나만 있어도 통과했다. */
const PATH_ACCOUNT_HOSTS = new Set([
  "instagram.com",
  "linktr.ee",
  "litt.ly",
  "smartstore.naver.com",
  "blog.naver.com",
  "facebook.com",
  "youtube.com",
  "notefolio.net",
  "behance.net",
  "x.com",
  "twitter.com",
  "tiktok.com",
]);
/** 여러 서비스가 하위 도메인으로 붙는 포털. 하위 서비스(웹툰·지도·쇼핑)끼리 묶으면 안 되고,
 *  대문 자체는 신원이 못 된다 — 주소 전체가 신원이다. */
const PORTALS = new Set(["naver.com", "daum.net", "kakao.com", "google.com", "naver.me"]);
/** .co.kr처럼 두 칸짜리 국가 접미사. */
const TWO_LEVEL = /^(?:co|or|ne|go|ac|pe|re)\.kr$|^(?:co|ne|or)\.jp$|^com\.(?:au|cn|sg)$/;
/** 이보다 짧은 도메인 이름은 남의 도메인 안에도 흔히 들어 있어 신원이 못 된다. */
const MIN_STEM = 5;

export function anchorKey(raw: string): AnchorKey | null {
  let u: URL;
  try {
    u = new URL(/^[a-z]+:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`);
  } catch {
    return null;
  }
  const host = u.hostname.replace(/^(www|m)\./, "").toLowerCase();
  const segs = u.pathname.split("/").filter(Boolean).map((x) => x.toLowerCase());
  if (PATH_ACCOUNT_HOSTS.has(host)) {
    return segs[0] ? { label: `${host}/${segs[0]}`, match: `${host}/${segs[0]}` } : null;
  }
  const labels = host.split(".");
  const suffixLen = labels.length >= 3 && TWO_LEVEL.test(labels.slice(-2).join(".")) ? 2 : 1;
  const apex = labels.slice(-(suffixLen + 1)).join(".");
  const sub = labels.slice(0, -(suffixLen + 1)).join(".");
  if (PORTALS.has(apex)) {
    // 포털: 대문은 아무것도 아니고, 하위 서비스는 주소 전체가 신원이다.
    if (!sub && segs.length === 0) return null;
    const full = `${host}/${segs.join("/")}`.replace(/\/$/, "");
    return { label: full, match: full };
  }
  // 하위 도메인이 있으면 그게 테넌트다(xxx.imweb.me · xxx.cafe24.com · xxx.tistory.com).
  // 예전엔 마지막 이름만 남겨 imweb·cafe24로 뭉쳤다(2026-10-02 백필 dry-run).
  if (sub) return { label: host, match: host };
  // 자기 도메인 — 끝(.com/.co.kr)만 다르면 같은 회사로 본다.
  const stem = labels[0];
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
