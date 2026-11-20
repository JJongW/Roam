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

/**
 * 한 호스트를 여러 사람이 나눠 쓰는 곳(SNS, 링크 모음, 마켓, 포트폴리오) — 도메인이 아니라 경로의 계정 칸이 신원이다.
 * 규칙은 계정 칸까지의 경로 조각을 돌려주고, 못 뽑으면 null을 돌려준다. null이면 그 링크는 신원 근거로 쓰지 않는다
 * (호스트로 떨어뜨리면 그 서비스를 쓰는 사람이 전부 한 브랜드가 된다).
 * 예전엔 instagram.com 호스트로 맞대서, 근거에 남의 인스타가 하나만 있어도 통과했다.
 * 2026-11-20: link.inpock.co.kr, instabio.cc, grafolio 같은 곳이 이 표에 없어 V.21 백필에서 25곳(부스 142곳)이 뭉쳤다.
 * 돌려준 조각은 원래 주소의 앞부분 그대로다 — 품질 게이트가 근거 주소에 이 문자열이 들어 있는지 본다.
 */
type AccountRule = (segs: string[], query: URLSearchParams) => string[] | null;

/** 계정 자리에 와도 계정이 아닌 말(게시물, 검색, 공유 같은 기능 경로). */
const NOT_ACCOUNT = new Set([
  "p", "reel", "reels", "tv", "stories", "explore", "watch", "shorts", "playlist", "share", "s", "search",
  "hashtag", "intent", "i", "home", "login", "signup", "pages", "groups", "events", "products", "product", "goods",
  "@",
]);
const ok = (seg: string | undefined): seg is string => Boolean(seg) && !NOT_ACCOUNT.has(seg!);
/** 첫 칸이 계정(instagram.com/<id>, threads.net/@<id>). */
const first: AccountRule = (segs) => (ok(segs[0]) ? [segs[0]] : null);
/** 고정된 앞 칸 다음이 계정(grafolio.ogq.me/profile/<id>). */
const after =
  (...prefixes: string[][]): AccountRule =>
  (segs) => {
    for (const pre of prefixes) {
      if (pre.every((p, i) => segs[i] === p) && ok(segs[pre.length])) return segs.slice(0, pre.length + 1);
    }
    return null;
  };
/** 계정을 가리키지 않는 주소만 있는 곳(짧은 주소, 상품, 책 한 권). 같은 책에 두 작가가 붙을 수 있다. */
const none: AccountRule = () => null;

const ACCOUNT_RULES: Record<string, AccountRule> = {
  // SNS
  "instagram.com": first,
  "threads.net": first,
  "threads.com": first,
  "x.com": first,
  "twitter.com": first,
  "tiktok.com": first,
  "facebook.com": (segs, q) => (segs[0] === "profile.php" && q.get("id") ? [`profile.php?id=${q.get("id")}`] : first(segs, q)),
  "youtube.com": (segs) =>
    segs[0]?.startsWith("@") && segs[0].length > 1 ? [segs[0]] : after(["channel"], ["c"], ["user"])(segs, new URLSearchParams()),
  "youtu.be": none,
  "pinterest.com": first,
  "pinterest.co.kr": first,
  "kr.pinterest.com": first,
  "xiaohongshu.com": after(["user", "profile"]),
  "xhslink.com": none,
  // 링크 모음
  "linktr.ee": first,
  "litt.ly": first,
  "link.inpock.co.kr": first,
  "instabio.cc": first,
  "linkon.id": first,
  "linkseller.net": first,
  "linkbio.co": first,
  "linkfly.to": first,
  "beacons.ai": first,
  "taplink.cc": first,
  "lit.link": first,
  "bio.link": first,
  "allmylinks.com": first,
  "revind.io": first,
  "pixpills.com": first,
  // 포트폴리오, 글
  "notefolio.net": first,
  "behance.net": first,
  "artstation.com": first,
  "grafolio.com": first,
  "grafolio.ogq.me": after(["profile"]),
  "picturebook-illust.com": after(["author-gallery", "room"]),
  "brunch.co.kr": first,
  "postype.com": first,
  "ko-fi.com": first,
  "patreon.com": first,
  "blog.naver.com": (segs, q) => {
    const id = q.get("blogid") ?? q.get("blogId");
    return id ? [id.toLowerCase()] : segs[0]?.endsWith(".naver") ? null : first(segs, q);
  },
  "comic.naver.com": (segs, q) => {
    const id = q.get("titleId");
    return id && segs.length >= 2 ? [`${segs[0]}/${segs[1]}?titleid=${id}`] : null;
  },
  // 마켓, 펀딩
  "smartstore.naver.com": first,
  "marpple.shop": (segs, q) => (/^[a-z]{2}$/.test(segs[0] ?? "") ? (ok(segs[1]) ? segs.slice(0, 2) : null) : first(segs, q)),
  "twenty.style": after(["go"], ["profile"]),
  "etsy.com": after(["shop"]),
  "idus.com": after(["w", "artist"]),
  "idus.kr": none,
  "tumblbug.com": first,
  "airbridge.tumblbug.com": none,
  "wadiz.kr": after(["web", "campaign", "detail"]),
  "product.kyobobook.co.kr": none,
  "yes24.com": none,
};
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
  const rule = ACCOUNT_RULES[host];
  if (rule) {
    const account = rule(segs, u.searchParams);
    if (!account) return null;
    const match = `${host}/${account.join("/")}`;
    return { label: readable(match), match };
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

/** 메시지용 — 퍼센트 인코딩된 한글 계정(grafolio)을 읽을 수 있게 푼다. */
function readable(s: string): string {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
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

/** 브랜드 먼저 인입(brands.v1)의 파일 키를 신원 키 공간에 넣을 때의 모양.
 *  URL에서 나온 키와 겹칠 수 없게 접두어를 붙인다. 같은 파일을 다시 돌려도 같은 브랜드를 찾는 열쇠다. */
export function brandKeyIdentity(scopeKey: string): string {
  return `brandkey:${scopeKey}`;
}
