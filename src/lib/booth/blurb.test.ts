import { describe, it, expect } from "vitest";
import { hasRealBlurb, blurbResidue } from "./blurb";

/**
 * 문장은 전부 운영 DB에서 그대로 가져온 것이다. 시드 템플릿이 바뀌면 이 테스트가
 * 먼저 깨져야 한다 — 깨지지 않으면 라우트가 조용히 다시 돈을 쓴다.
 */
describe("hasRealBlurb — 시드가 합성한 소개를 가른다", () => {
  it("SIF: 이름·번호·참가분류뿐이면 내용이 아니다", () => {
    expect(
      hasRealBlurb(
        "오킹의 부스입니다. 부스 번호 D02. 2026 서울일러스트레이션페어 참가 국내 작가입니다.",
        { name: "오킹", code: "D02" },
      ),
    ).toBe(false);
    expect(
      hasRealBlurb(
        "Illustration Taipei의 부스입니다. 부스 번호 O08. 2026 서울일러스트레이션페어 참가 해외 기업입니다.",
        { name: "Illustration Taipei", code: "O08" },
      ),
    ).toBe(false);
  });

  it("SIBF: 분야와 '신간·굿즈·사인회' 상투구가 더 붙어도 내용이 아니다", () => {
    expect(
      hasRealBlurb(
        "고스트북스의 부스입니다. 부스 번호 A101. 분야: 예술, 문학. 현장에서 신간 전시와 굿즈, 사인회를 만나볼 수 있어요. 2026 서울국제도서전 참가사입니다.",
        { name: "고스트북스", code: "A101" },
      ),
    ).toBe(false);
  });

  it("하우스 아카이브: '참가 브랜드입니다' 꼬리도 잡는다", () => {
    expect(
      hasRealBlurb(
        "수집의 집 센터(COLLECT HOUSE CENTER)의 부스입니다. 부스 번호 CTR-COLLECT. 하우스 아카이브 수집의 집 참가 브랜드입니다.",
        { name: "수집의 집 센터", code: "CTR-COLLECT" },
      ),
    ).toBe(false);
  });

  it("빈칸·항목만 남은 소개도 내용이 아니다", () => {
    expect(hasRealBlurb("", {})).toBe(false);
    expect(hasRealBlurb("   ", {})).toBe(false);
    expect(
      hasRealBlurb("농업회사법인(주)꼬마루 주요 제품: , , ", { name: "꼬마루 육포" }),
    ).toBe(false);
  });

  it("주최가 받은 실제 소개는 남긴다", () => {
    expect(
      hasRealBlurb(
        "“Your Coffee Guide” 싱글 오리진 원두와 드립백, 구독 서비스를 제공합니다. 다양한 커피를 소개하고 선택을 돕는 가이드 역할로, 커피로 연결되는 커뮤니티를 만들어갑니다.",
        { name: "Cafe 빈브라더스", code: "DF154" },
      ),
    ).toBe(true);
  });

  it("'참가'가 들어간 실제 소개를 꼬리로 오판하지 않는다", () => {
    // 카페쇼 소개는 전부 "[2025 서울카페쇼 참가 정보]"로 시작한다. 꼬리 판정에
    // 길이 제한이 없으면 이 문장이 통째로 날아가 238곳이 합성으로 잘못 걸린다.
    const cafeshow =
      "[2025 서울카페쇼 참가 정보] 호레카 토탈 솔루션 기업 (주)흥국에프엔비는 30,000여개의 국내외 프랜차이즈, 외식업체 및 개인 카페에 프리미엄 식,음료를 공급하는 글로벌 기업입니다.";
    expect(hasRealBlurb(cafeshow, { name: "흥국에프엔비", code: "A232" })).toBe(true);
  });

  it("잔여는 판정 근거로 읽을 수 있다", () => {
    expect(
      blurbResidue("룸룸의 부스입니다. 부스 번호 B30. 2026 서울일러스트레이션페어 참가 국내 작가입니다.", {
        name: "룸룸",
        code: "B30",
      }),
    ).toBe("");
  });
});
