import { describe, it, expect } from "vitest";
import { boothSummaryKey, prebuiltSummary } from "./summary-cache";

const BEANBROTHERS =
  "“Your Coffee Guide” 싱글 오리진 원두와 드립백, 구독 서비스를 제공합니다. 다양한 커피를 소개하고 선택을 돕는 가이드 역할로, 커피로 연결되는 커뮤니티를 만들어갑니다.";

describe("prebuiltSummary — 미리 만들어 둔 요약을 찾는다", () => {
  it("운영 DB의 소개글로 요약을 찾는다", () => {
    const hit = prebuiltSummary("Cafe 빈브라더스", BEANBROTHERS);
    expect(hit?.summary).toBe(
      "싱글 오리진 원두와 드립백, 구독 서비스를 제공합니다.",
    );
  });

  it("소개글이 바뀌면 찾지 못한다 — 낡은 요약이 남지 않는다", () => {
    expect(prebuiltSummary("Cafe 빈브라더스", BEANBROTHERS + " 새 문장."))
      .toBeUndefined();
  });

  it("공백 차이는 무시한다 — 줄바꿈이 섞여도 같은 열쇠다", () => {
    expect(boothSummaryKey("가", "한 줄\n두 줄 ")).toBe(
      boothSummaryKey("가", "한 줄 두 줄"),
    );
  });
});
