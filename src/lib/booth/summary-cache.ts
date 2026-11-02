import "server-only";
import { createHash } from "node:crypto";
import summaries from "./summaries.json";

export interface BoothExtract {
  summary: string;
  newReleases: string[];
  goods: string[];
}

/**
 * 미리 만들어 둔 요약을 찾는 열쇠.
 *
 * 부스 id가 아니라 **소개글 자체**로 키를 만든다. 두 가지를 공짜로 얻는다 —
 * ① mock과 운영의 id가 달라도 같은 소개글은 같은 요약을 찾는다.
 * ② 소개글이 바뀌면 키가 빗나가서 **낡은 요약이 남지 않는다.** id로 키를 잡으면
 *    소개가 수정된 뒤에도 옛 소개로 만든 한 줄이 계속 보인다.
 * 이름을 같이 넣는 이유는 소개글이 같고 부스가 다른 경우(공동입점·지점)를
 * 가르기 위해서다.
 */
export function boothSummaryKey(name: string, blurb: string): string {
  return createHash("sha256")
    .update(`${name}\n${blurb.replace(/\s+/g, " ").trim()}`)
    .digest("hex")
    .slice(0, 12);
}

const TABLE = summaries as Record<string, BoothExtract>;

/** 미리 만들어 둔 요약. 없으면 undefined — 그때만 모델을 부른다. */
export function prebuiltSummary(
  name: string,
  blurb: string,
): BoothExtract | undefined {
  return TABLE[boothSummaryKey(name, blurb)];
}
