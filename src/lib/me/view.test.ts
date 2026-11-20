import { describe, expect, it } from "vitest";
import {
  fairDays,
  groupByFair,
  groupWhen,
  nextFair,
  nicknameProblem,
  phaseOf,
  providerName,
  romiLine,
  type MeFair,
} from "./view";

const fair = (id: string, startDate: string, endDate: string, name = id): MeFair => ({
  id,
  slug: id,
  name,
  venue: "코엑스 C홀",
  startDate,
  endDate,
});
const TODAY = "2026-11-20";
const ended = fair("old", "2026-08-13", "2026-08-16", "서울디자인페스티벌 2025");
const open = fair("open", "2026-11-19", "2026-11-23", "새해준비상점 2026");
const soon = fair("soon", "2026-12-04", "2026-12-07", "홈테이블데코페어 2026");
const later = fair("later", "2026-12-11", "2026-12-14", "서울일러스트레이션페어 2026");

describe("phaseOf, fairDays", () => {
  it("시작일과 끝날 당일은 열림", () => {
    expect(phaseOf(open, "2026-11-19")).toBe("ongoing");
    expect(phaseOf(open, "2026-11-23")).toBe("ongoing");
    expect(phaseOf(open, "2026-11-24")).toBe("ended");
    expect(phaseOf(soon, TODAY)).toBe("upcoming");
  });
  it("양 끝을 포함해 센다", () => {
    expect(fairDays(soon)).toBe(4);
    expect(fairDays(fair("x", "2026-12-04", "2026-12-04"))).toBe(1);
  });
});

describe("groupByFair", () => {
  const rows = [
    { boothId: "b1", name: "숲향초", code: "B05", exhibitionId: "soon" },
    { boothId: "b2", name: "달빛도자", code: "A03", exhibitionId: "soon" },
    { boothId: "b3", name: "유리정원", exhibitionId: "old" },
    { boothId: "b4", name: "꽃잠", exhibitionId: "open" },
    { boothId: "b5", name: "구름책", exhibitionId: "later" },
    { boothId: "b6", name: "목록에 없는 곳", exhibitionId: "gone" },
  ];
  it("열림, 다가옴(가까운 순), 끝남 순서이고 부스 번호 순으로 정렬한다", () => {
    const g = groupByFair(rows, [ended, later, soon, open], TODAY);
    expect(g.map((x) => x.fair.id)).toEqual(["open", "soon", "later", "old"]);
    expect(g[1].rows.map((r) => r.code)).toEqual(["A03", "B05"]);
  });
  it("박람회 목록에 없는 부스는 뺀다", () => {
    const g = groupByFair(rows, [soon], TODAY);
    expect(g).toHaveLength(1);
  });
});

describe("nextFair", () => {
  it("열린 박람회가 먼저, 없으면 가장 가까운 다가오는 박람회", () => {
    expect(nextFair([later, soon, open, ended], TODAY)?.id).toBe("open");
    expect(nextFair([later, soon, ended], TODAY)?.id).toBe("soon");
    expect(nextFair([ended], TODAY)).toBeNull();
  });
});

describe("groupWhen", () => {
  it("다가오면 시작일부터, 열려 있으면 끝날까지, 끝났으면 비움", () => {
    expect(groupWhen({ fair: soon, phase: "upcoming" })).toBe("12월 4일부터");
    expect(groupWhen({ fair: open, phase: "ongoing" })).toBe("11월 23일까지");
    expect(groupWhen({ fair: ended, phase: "ended" })).toBe("");
  });
});

describe("romiLine", () => {
  it("로그인 뒤, 다음 박람회에 하트가 있으면 두 줄 사실", () => {
    expect(
      romiLine({ next: soon, today: TODAY, heartsInNext: 5, heartCount: 9, signedIn: true }),
    ).toBe("다음 박람회는 12월 4일 홈테이블데코페어 2026이에요.\n하트 남긴 곳이 있어요.");
  });
  it("로그인 전에는 브라우저에만 남아 있다고 말한다", () => {
    expect(
      romiLine({ next: soon, today: TODAY, heartsInNext: 2, heartCount: 2, signedIn: false }),
    ).toBe("다음 박람회는 12월 4일 홈테이블데코페어 2026이에요.\n하트는 지금 이 브라우저에만 남아 있어요.");
  });
  it("다음 박람회에 하트가 없으면 둘째 줄을 비운다", () => {
    expect(
      romiLine({ next: soon, today: TODAY, heartsInNext: 0, heartCount: 1, signedIn: true }),
    ).toBe("다음 박람회는 12월 4일 홈테이블데코페어 2026이에요.");
  });
  it("열린 박람회는 지금 열려 있다고 말한다", () => {
    expect(
      romiLine({ next: open, today: TODAY, heartsInNext: 1, heartCount: 1, signedIn: true }),
    ).toBe("새해준비상점 2026이 지금 열려 있어요.\n하트 남긴 곳이 있어요.");
  });
  it("다음 박람회가 없으면 정해지면 나온다고만", () => {
    expect(
      romiLine({ next: null, today: TODAY, heartsInNext: 0, heartCount: 1, signedIn: true }),
    ).toBe("곧 열릴 박람회가 정해지면 여기에 나와요.");
  });
  it("하트가 없으면 14-06 안내, 열린 박람회가 있으면 같이 둘러보기를 묻는다", () => {
    expect(
      romiLine({ next: open, today: TODAY, heartsInNext: 0, heartCount: 0, signedIn: true }),
    ).toBe("부스에 하트를 남기면 박람회 지도에 켜져요.\n새해준비상점 2026이 지금 열려 있어요. 같이 둘러볼까요?");
    expect(
      romiLine({ next: soon, today: TODAY, heartsInNext: 0, heartCount: 0, signedIn: false }),
    ).toBe("부스에 하트를 남기면 박람회 지도에 켜져요.");
  });
  it("가운뎃점과 전시라는 말을 쓰지 않는다", () => {
    const s = romiLine({ next: soon, today: TODAY, heartsInNext: 1, heartCount: 1, signedIn: false });
    expect(s).not.toMatch(/·|전시/);
  });
});

describe("providerName, nicknameProblem", () => {
  it("알려진 로그인 방식은 읽는 이름으로", () => {
    expect(providerName("google")).toBe("Google");
    expect(providerName("apple")).toBe("Apple");
    expect(providerName(undefined)).toBeUndefined();
  });
  it("2자 이상 12자 이하, 한글 영문 숫자", () => {
    expect(nicknameProblem("종원")).toBeNull();
    expect(nicknameProblem("a")).toBe("invalid");
    expect(nicknameProblem("가".repeat(13))).toBe("invalid");
    expect(nicknameProblem("hi!")).toBe("invalid");
  });
});
