import { describe, expect, it } from "vitest";
import { checkExhibitionSlug, suggestExhibitionSlug } from "./slug";

describe("행사 주소 제안", () => {
  it("이름에 영문이 있으면 영문으로, 연도가 없으면 시작 연도를 붙여요", () => {
    expect(suggestExhibitionSlug({ name: "Seoul Design Festival 2026", startDate: "2026-12-10" })).toBe("seoul-design-festival-2026");
    expect(suggestExhibitionSlug({ name: "서울디자인페스티벌 SDF", startDate: "2026-12-10" })).toBe("sdf-2026");
  });

  it("한글 이름이면 행사장과 시작 연월로 제안하고, 'exhibition'을 만들지 않아요", () => {
    expect(suggestExhibitionSlug({ name: "새해준비상점", venue: "코엑스 C홀", startDate: "2026-12-26" })).toBe("coex-2026-12");
    expect(suggestExhibitionSlug({ name: "리빙마켓", venue: "코엑스 마곡 컨벤션센터", startDate: "2026-11-05" })).toBe("coex-magok-2026-11");
    expect(suggestExhibitionSlug({ name: "문구전", venue: "어딘가 홀", startDate: "2026-11-20" })).toBe("fair-2026-11");
    expect(suggestExhibitionSlug({ name: "2026 문구전", venue: "", startDate: "2026-11-20" })).toBe("fair-2026-11");
  });

  it("날짜도 없으면 빈 값이에요(일반 이름을 지어내지 않아요)", () => {
    expect(suggestExhibitionSlug({ name: "문구전", venue: "코엑스" })).toBe("");
  });
});

describe("행사 주소 검사", () => {
  const existing = [{ id: "exh_coex_2026_12", slug: "coex-2026-12", name: "새해준비상점" }];

  it("비었거나 모양이 틀리면 막아요", () => {
    expect(checkExhibitionSlug("", existing)).toMatch(/적어 주세요/);
    expect(checkExhibitionSlug("새해", existing)).toMatch(/소문자/);
    expect(checkExhibitionSlug("Coex", existing)).toMatch(/소문자/);
  });

  it("이미 쓰는 주소면 어느 행사인지 말하고 막아요", () => {
    expect(checkExhibitionSlug("coex-2026-12", existing)).toBe(
      '이미 "새해준비상점" 행사가 이 주소를 쓰고 있어요. 다른 주소로 바꿔 주세요',
    );
  });

  it("고치는 행사 자신의 주소는 겹침이 아니에요", () => {
    expect(checkExhibitionSlug("coex-2026-12", existing, "exh_coex_2026_12")).toBeNull();
    expect(checkExhibitionSlug("coex-2026-12-b", existing)).toBeNull();
  });
});
