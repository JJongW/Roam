import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/** 사람이 브라우저로 직접 확인한 사실. 검색 근거가 아니라 브랜드 본인 게시물이나
 *  자사 사이트에서 읽은 것이다. data/verified/<slug>.json. */
export interface VerifiedFact {
  summary: string;
  sourceUrl?: string;
  /** 브랜드 본인이 이 전시 참여를 밝힌 경우. 참여 여부는 100%다. */
  confirmed?: boolean;
  name?: string;
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
