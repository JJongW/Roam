import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** 사람이 브라우저로 직접 확인한 사실. 검색 근거가 아니라 브랜드 본인 게시물이나
 *  자사 사이트에서 읽은 것이다. data/verified/<slug>.json. */
export interface VerifiedFact {
  summary: string;
  /** 로미 한 줄. 부스가 무엇인지(사실) + 왜 지금 너한테. */
  roamInterpretation?: string;
  valueTags?: { slug: string; strength: number }[];
  recommendationReasons?: Record<string, string>;
  thingsToDo?: string[];
  timing?: string[];
  memoryHooks?: string[];
  sourceUrl?: string;
  /** 브랜드 본인이 이 전시 참여를 밝힌 경우. 참여 여부는 100%다. */
  confirmed?: boolean;
  name?: string;
  /** 브랜드가 자기 사이트에 걸어둔 대표 이미지를 내려받아 둔 경로.
   *  인스타 CDN은 서명 토큰이 붙어 몇 시간이면 만료돼 쓸 수 없다. */
  image?: string;
  /** 인스타 게시물에서 딴 여러 장. <CODE>_1.webp … 순서대로. */
  images?: string[];
  /** 주최가 운영하는 온라인 브랜드 디렉터리에 브랜드가 직접 등록한 글.
   *  전시 참여 여부와 브랜드 신원을 동시에 증명하는 1순위 근거다. */
  directory?: {
    nameKor: string;
    nameEng?: string;
    category?: string;
    /** 브랜드가 쓴 한 줄 소개. */
    intro?: string;
    /** 브랜드가 쓴 상세 소개 원문. */
    pr?: string;
    /** 브랜드가 등록한 자사 링크. */
    link?: string;
    source: string;
  };
  /** 읽은 근거 그대로. 검수자가 요약만 보고 판단하지 않도록 원문을 같이 보여준다. */
  instagram?: {
    handle: string;
    url: string;
    /** 계정 소개줄(이름·팔로워·소개·주소). */
    header?: string;
    website?: string;
    /** 게시물 본문. 요약이 어디서 나왔는지 확인하는 근거다. */
    posts?: string[];
  };
}

export function loadVerified(slug: string): Record<string, VerifiedFact> {
  const p = join(process.cwd(), "data/verified", `${slug}.json`);
  if (!existsSync(p)) return {};
  try {
    const j = JSON.parse(readFileSync(p, "utf8")) as {
      booths?: Record<string, VerifiedFact>;
    };
    return j.booths ?? {};
  } catch {
    return {};
  }
}

/** 두 글이 실질적으로 같은 말인가. 공백·문장부호만 다른 건 차이가 아니다. */
export function sameText(a?: string | null, b?: string | null): boolean {
  const n = (s?: string | null) =>
    (s ?? "").replace(/[\s.,·"'’“”()]/g, "").toLowerCase();
  return n(a) === n(b);
}
