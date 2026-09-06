import { describe, expect, it } from "vitest";
import { diffFields, revertPayload } from "./diff";
import { AUDIT_SPECS } from "./entities";

const E = AUDIT_SPECS.booth_enrichment;
const diffEnrichment = (
  before: Record<string, unknown> | null,
  after: Record<string, unknown>,
) => diffFields(before, after, E.fields);

describe("diffFields — 부스 저작 필드", () => {
  it("페이로드에 없는 필드는 변경이 아니다", () => {
    // booth-manager는 roamInterpretation을 안 보낸다. 이걸 변경으로 세면
    // 남의 로미 한 줄을 지운 것처럼 이력에 남는다.
    const d = diffEnrichment(
      { summary: "옛 요약", roamInterpretation: "사람이 쓴 한 줄" },
      { summary: "새 요약" },
    );
    expect(Object.keys(d)).toEqual(["summary"]);
    expect(d.summary).toEqual({ before: "옛 요약", after: "새 요약" });
  });

  it("빈 문자열·빈 배열·빈 객체는 없는 것과 같다", () => {
    const d = diffEnrichment(
      { summary: "", thingsToDo: [], recommendationReasons: {} },
      { summary: "   ", thingsToDo: [], recommendationReasons: {} },
    );
    expect(d).toEqual({});
  });

  it("신규로 채워진 필드는 before가 null이다", () => {
    const d = diffEnrichment(null, { summary: "첫 요약", timing: ["오전"] });
    expect(d.summary).toEqual({ before: null, after: "첫 요약" });
    expect(d.timing).toEqual({ before: null, after: ["오전"] });
  });

  it("값이 같으면 담지 않는다 — 멱등 인입이 이력을 더럽히지 않게", () => {
    const same = {
      summary: "요약",
      valueTags: [{ slug: "goods", strength: 0.8 }],
      thingsToDo: ["둘러보기"],
    };
    expect(diffEnrichment(same, { ...same })).toEqual({});
  });

  it("배열·객체는 내용이 다르면 변경이다", () => {
    const d = diffEnrichment(
      { thingsToDo: ["a"], recommendationReasons: { goods: "x" } },
      { thingsToDo: ["a", "b"], recommendationReasons: { goods: "y" } },
    );
    expect(Object.keys(d).sort()).toEqual(["recommendationReasons", "thingsToDo"]);
  });
});

describe("diffFields — 엔티티에 묶이지 않는다", () => {
  it("부스 본체 필드에도 같은 함수를 쓴다", () => {
    // 오늘 인입이 images를 97개 덮어쓸 뻔했다 — 그 축도 이력이 필요하다.
    const d = diffFields(
      { name: "누키트", images: ["/a.webp"], description: "" },
      { images: ["/a.webp", "/b.webp"], description: "새 설명" },
      AUDIT_SPECS.booth.fields,
    );
    expect(Object.keys(d).sort()).toEqual(["description", "images"]);
    expect(d.images.before).toEqual(["/a.webp"]);
  });

  it("전시·이벤트도 같은 표에서 나온다", () => {
    expect(AUDIT_SPECS.exhibition.fields).toContain("startDate");
    expect(AUDIT_SPECS.event.fields).toContain("title");
  });
});

describe("revertPayload", () => {
  it("이력의 before로 되돌릴 페이로드를 만든다", () => {
    const d = diffEnrichment(
      { summary: "옛 요약", thingsToDo: ["옛 할 일"] },
      { summary: "새 요약", thingsToDo: [] },
    );
    expect(revertPayload(d, E.emptyFor)).toEqual({
      summary: "옛 요약",
      thingsToDo: ["옛 할 일"],
    });
  });

  it("신규였던 필드는 빈 값으로 되돌린다 — 타입에 맞는 빈 값으로", () => {
    const d = diffEnrichment(null, {
      summary: "첫 요약",
      timing: ["오전"],
      recommendationReasons: { goods: "x" },
    });
    expect(revertPayload(d, E.emptyFor)).toEqual({
      summary: "",
      timing: [],
      recommendationReasons: {},
    });
  });
});
