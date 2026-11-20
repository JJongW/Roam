import { describe, expect, it } from "vitest";
import {
  byBoothNumber,
  groupByCategory,
  hallsInOrder,
  OTHER_CATEGORY,
  type ListBooth,
} from "./booth-list";
import { romi } from "@/lib/copy/v1";

const b = (id: string, over: Partial<ListBooth> = {}): ListBooth => ({ id, name: id, ...over });

describe("groupByCategory (UI 8-01)", () => {
  const cats = [
    { id: "c1", name: "문구" },
    { id: "c2", name: "일러스트" },
  ];

  it("곳 수가 많은 분류부터, 분류 없는 부스는 맨 아래 '그 밖'", () => {
    const groups = groupByCategory(
      [
        b("a", { categoryId: "c1" }),
        b("b", { categoryId: "c2" }),
        b("c", { categoryId: "c2" }),
        b("d"),
        b("e", { categoryId: "gone" }),
        b("f", { categoryId: "c2" }),
      ],
      cats,
      "그 밖",
    );
    expect(groups.map((g) => [g.name, g.booths.length])).toEqual([
      ["일러스트", 3],
      ["문구", 1],
      ["그 밖", 2],
    ]);
    expect(groups.at(-1)!.id).toBe(OTHER_CATEGORY);
  });

  it("분류 속 부스는 부스 번호 순(A2 < A10), 번호 없는 부스는 뒤", () => {
    const [g] = groupByCategory(
      [
        b("x", { categoryId: "c1", code: "A10" }),
        b("y", { categoryId: "c1" }),
        b("z", { categoryId: "c1", code: "A2" }),
      ],
      cats,
      "그 밖",
    );
    expect(g.booths.map((x) => x.id)).toEqual(["z", "x", "y"]);
  });

  it("빈 분류는 줄을 만들지 않는다", () => {
    expect(groupByCategory([b("a", { categoryId: "c1" })], cats, "그 밖")).toHaveLength(1);
  });
});

describe("byBoothNumber", () => {
  it("번호가 같으면 이름 순", () => {
    expect([b("나", { code: "B1" }), b("가", { code: "B1" })].sort(byBoothNumber).map((x) => x.id)).toEqual([
      "가",
      "나",
    ]);
  });
});

describe("hallsInOrder와 머리 문장(8-01)", () => {
  const booths = [b("a", { hall: "D홀" }), b("b", { hall: "A홀" }), b("c")];

  it("부스가 있는 홀만 주어진 순서대로", () => {
    expect(hallsInOrder(["A홀", "B홀", "C홀", "D홀"], booths)).toEqual(["A홀", "D홀"]);
  });

  it("홀이 여럿이면 처음과 끝, 하나면 그 홀, 없으면 홀 없이", () => {
    expect(romi.boothListIntro(["A홀", "D홀"], 597)).toBe(
      "A홀부터 D홀까지 부스 597곳이 있어요.\n어떤 분류부터 볼까요?",
    );
    expect(romi.boothListIntro(["A홀"], 3)).toBe("A홀에 부스 3곳이 있어요.\n어떤 분류부터 볼까요?");
    expect(romi.boothListIntro([], 3)).toBe("부스 3곳이 있어요.\n어떤 분류부터 볼까요?");
  });
});
