import { describe, expect, it } from "vitest";
import { buildDm, dmTemplateFor, fillTemplate, hasBatchim, joinItems, mailtoLink, normalizeHandle } from "./outreach";
import { OUTREACH_SENDER } from "@/lib/constants";

describe("DM 문구 채우기", () => {
  it("브랜드 이름과 박람회 이름을 채우고 품목은 받침에 맞는 조사를 붙인다", () => {
    const t = "{브랜드명}님! {박람회명} 소개예요. 특히 {품목:을} 보여 드리고 싶어요!";
    expect(fillTemplate(t, { brand: "하치", fair: "새해 준비상점", items: ["캘린더"] })).toBe(
      "하치님! 새해 준비상점 소개예요. 특히 캘린더를 보여 드리고 싶어요!",
    );
    expect(fillTemplate(t, { brand: "하치", fair: "새해 준비상점", items: ["엽서", "다이어리"] })).toContain(
      "특히 엽서와 다이어리를 보여",
    );
    expect(fillTemplate(t, { brand: "하치", fair: "새해 준비상점", items: ["스티커", "책갈피"] })).toContain("스티커와 책갈피를");
    expect(fillTemplate(t, { brand: "하치", fair: "새해 준비상점", items: ["뜨개"] })).toContain("뜨개를");
    expect(fillTemplate(t, { brand: "하치", fair: "새해 준비상점", items: ["달력"] })).toContain("달력을");
  });

  it("품목을 모르면 그 문장만 빼고 자리표시를 남기지 않는다", () => {
    const out = buildDm("newyear-store-2026", { brand: "주말토리", fair: "새해 준비상점 N.27" });
    expect(out).not.toMatch(/[{}]/);
    expect(out).not.toContain("특히");
    expect(out).toContain("주말토리님!");
    expect(out).toContain("주말토리도 소개해 드려도");
    // 줄바꿈(문단)은 그대로
    expect(out.split("\n\n")).toHaveLength(4);
  });

  it("박람회 문안이 없으면 공통 문안에 박람회 이름을 넣는다", () => {
    const out = buildDm("cafeshow-2026", { brand: "A커피", fair: "카페쇼 2026", items: ["원두"] });
    expect(dmTemplateFor("cafeshow-2026")).toContain("{박람회명}");
    expect(out).toContain("카페쇼 2026 참가 브랜드를");
    expect(out).toContain("특히 원두를 보여");
  });

  it("보내는 이는 Roam 계정이다(개인 계정 금지)", () => {
    for (const slug of ["newyear-store-2026", "other"]) {
      const out = buildDm(slug, { brand: "x", fair: "y" });
      expect(out).toContain(`@${OUTREACH_SENDER.instagram}`);
      expect(out).toContain("Roam");
      expect(out).not.toMatch(/ted|테드/i);
    }
    expect(OUTREACH_SENDER.email).toBe("roam.ai.kr@gmail.com");
  });

  it("메일 초안은 받는 사람과 제목, 본문만 채운다", () => {
    const link = mailtoLink("hi@brand.kr", "x", { brand: "B", fair: "F" });
    expect(link.startsWith("mailto:hi%40brand.kr?subject=")).toBe(true);
    expect(decodeURIComponent(link)).toContain("[Roam] F 참가 브랜드 소개 사진 문의");
  });

  it("받침과 품목 잇기", () => {
    expect(hasBatchim("캘린더")).toBe(false);
    expect(hasBatchim("엽서")).toBe(false);
    expect(hasBatchim("달력")).toBe(true);
    expect(hasBatchim("ABC")).toBe(false);
    expect(joinItems(["달력", "엽서", "키링"])).toBe("달력과 엽서");
  });
});

describe("normalizeHandle", () => {
  it("여러 모양을 계정 이름 하나로", () => {
    expect(normalizeHandle("@Abc.def")).toBe("abc.def");
    expect(normalizeHandle("https://www.instagram.com/joomaltory/")).toBe("joomaltory");
    expect(normalizeHandle("instagram.com/a_b?igsh=xyz")).toBe("a_b");
    expect(normalizeHandle("hello@brand.kr")).toBeNull();
    expect(normalizeHandle("두 단어")).toBeNull();
    expect(normalizeHandle("")).toBeNull();
  });
});
