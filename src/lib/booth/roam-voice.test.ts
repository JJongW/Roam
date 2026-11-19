import { describe, it, expect } from "vitest";
import {
  banmalEndings,
  contentFlags,
  haeyoEnding,
  toHaeyoText,
  toHaeyoValue,
  undot,
  voiceIssues,
} from "@/lib/booth/roam-voice";

// 예문은 운영 DB에 남아 있던 워커 초안 문장에서 뽑았다(db-voice-diff-2, 2026-11-19).
const conv = (s: string) => toHaeyoText(s);

describe("toHaeyoText: 반말 해체", () => {
  it.each([
    ["쌍화1988 등 블렌딩 허브티 제품을 구매할 수 있어.", "쌍화1988 등 블렌딩 허브티 제품을 구매할 수 있어요."],
    ["새로운 와인 브랜드를 발견하고 시음할 수 있을 거야.", "새로운 와인 브랜드를 발견하고 시음할 수 있을 거예요."],
    ["소파에 누워보고 고르는 자리야.", "소파에 누워보고 고르는 자리예요."],
    ["매일 쓰는 물건이라 손에 닿는 감이 기준이야.", "매일 쓰는 물건이라 손에 닿는 감이 기준이에요."],
    ["일상용 실버라 부담 없이 집어보게 돼.", "일상용 실버라 부담 없이 집어보게 돼요."],
    ["방향제를 숨기지 않고 놓는 방식이 눈에 들어와.", "방향제를 숨기지 않고 놓는 방식이 눈에 들어와요."],
    ["구매할 수 있는 상품이 많아.", "구매할 수 있는 상품이 많아요."],
    ["제품으로 구현한 점이 독특해.", "제품으로 구현한 점이 독특해요."],
    ["재해석한 점이 흥미로워.", "재해석한 점이 흥미로워요."],
    ["산지와 가공방식이 맛을 어떻게 바꾸는지 배워.", "산지와 가공방식이 맛을 어떻게 바꾸는지 배워요."],
    ["공간을 보는 눈이 한 겹 늘어나.", "공간을 보는 눈이 한 겹 늘어나요."],
    ["정보를 찾을 수 없었어.", "정보를 찾을 수 없었어요."],
    ["시즌별로 새로운 블렌드 커피를 선보여.", "시즌별로 새로운 블렌드 커피를 선보여요."],
    ["확인해봐야 할 것 같아.", "확인해봐야 할 것 같아요."],
    ["구매할 수 있을지도 몰라.", "구매할 수 있을지도 몰라요."],
  ])("%s", (before, after) => {
    const r = conv(before);
    expect(r.text).toBe(after);
    expect(r.unsure).toEqual([]);
  });
});

describe("toHaeyoText: 한다체", () => {
  it.each([
    ["식품 포장재 트렌드를 엿볼 수 있다.", "식품 포장재 트렌드를 엿볼 수 있어요."],
    ["성장할 수 있는 기회를 제공한다.", "성장할 수 있는 기회를 제공해요."],
    ["모듈형 디자인으로 요즘 인테리어 트렌드를 보여준다.", "모듈형 디자인으로 요즘 인테리어 트렌드를 보여 줘요."],
    ["로스팅한 원두를 선보인다.", "로스팅한 원두를 선보여요."],
    ["새로운 맛을 발견하는 데 중점을 둔다.", "새로운 맛을 발견하는 데 중점을 둬요."],
    ["카페들이 메뉴를 쉽게 도입할 수 있도록 돕는다.", "카페들이 메뉴를 쉽게 도입할 수 있도록 도와요."],
    ["새로운 디자인을 발견하기 좋다.", "새로운 디자인을 발견하기 좋아요."],
    ["한옥스튜디오가 만든 가구라 결이 다르다.", "한옥스튜디오가 만든 가구라 결이 달라요."],
    ["구체적인 해석을 제공하기 어렵다.", "구체적인 해석을 제공하기 어려워요."],
    ["직접 확인할 수 있는 기회다.", "직접 확인할 수 있는 기회예요."],
    ["작가가 직접 빚은 잔이다.", "작가가 직접 빚은 잔이에요."],
    ["원두를 직접 볶는다.", "원두를 직접 볶아요."],
    ["올해 처음 문을 열었다.", "올해 처음 문을 열었어요."],
    ["아이를 키운다.", "아이를 키워요."],
  ])("%s", (before, after) => {
    const r = conv(before);
    expect(r.text).toBe(after);
    expect(r.unsure).toEqual([]);
  });
});

describe("toHaeyoText: 대화 질문", () => {
  it.each([
    ["어떤 원두가 제일 인기야?", "어떤 원두가 제일 인기예요?"],
    ["어디서 왔는지 물어볼까?", "어디서 왔는지 물어볼까요?"],
    ["이 잔은 뭐가 달라?", "이 잔은 뭐가 달라요?"],
    ["직접 볶아 봤어?", "직접 볶아 봤어요?"],
  ])("%s", (before, after) => {
    expect(conv(before).text).toBe(after);
    expect(conv(before).unsure).toEqual([]);
  });
  it("'있니?'는 모른다", () => {
    expect(conv("시음 잔이 있니?").unsure).toEqual(["'있니'"]);
  });
});

describe("toHaeyoText: 합니다체", () => {
  it("summary-voice와 같은 규칙으로 바꾼다", () => {
    expect(conv("가든라운지에서 쉴 수 있습니다.").text).toBe("가든라운지에서 쉴 수 있어요.");
    expect(conv("대중교통을 권장합니다.").text).toBe("대중교통을 권장해요.");
    expect(conv("코엑스 마곡 컨벤션센터 1층입니다.").text).toBe("코엑스 마곡 컨벤션센터 1층이에요.");
  });
});

describe("toHaeyoText: 그대로 두는 것", () => {
  it.each([
    "화병, 거울, 와인잔까지 실물로 고를 수 있어요.",
    "현장 무료 입장.",
    "지하철 5호선 발산역, 9호선 마곡나루역에서 도보.",
    "주말 오후 붐빔",
    "드립백 시음하기",
    "9/10(목)과 9/11(금) 10:30–19:00.",
    "Abbr.",
    "실드림 — 디자인 실리콘 주방용품.",
    "영어, 한국어 안내 가능.",
  ])("%s", (s) => {
    const r = conv(s);
    expect(r.text).toBe(s);
    expect(r.changed).toBe(false);
    expect(r.unsure).toEqual([]);
  });

  it("따옴표 안 인용의 끝은 건드리지 않는다", () => {
    const s = "대표 블렌드는 '오늘은 쉬어'.";
    expect(conv(s).text).toBe(s);
  });
});

describe("toHaeyoText: 모르면 unsure", () => {
  it.each([
    "기계 없이 손만으로 얇게 빚는 방식을 봐.",
    "과하지 않게 빛나는 선을 어떻게 잡는지 보여줘.",
    "향에 따라 공간 인상이 달라지는 걸 직접 맡아봐.",
    "타월로 욕실의 온도를 바꾸는 패브릭을 만드는구나.",
    "셀 전문 코스메틱 브랜드다.",
    "새로운 길을 엮습니다.",
    "가끔은 혼자 산다.",
    "외국어는 영어.",
  ])("%s", (s) => {
    const r = conv(s);
    expect(r.unsure.length).toBeGreaterThan(0);
  });
});

describe("haeyoEnding", () => {
  it("이미 해요체면 same", () => {
    expect(haeyoEnding("있어요").status).toBe("same");
    expect(haeyoEnding("좋죠").status).toBe("same");
  });
  it("명사면 same", () => {
    expect(haeyoEnding("입장").status).toBe("same");
    expect(haeyoEnding("이미지").status).toBe("same");
  });
  it("받침 없는 명사 + 다는 앞이 꾸밈말일 때만 바꾼다", () => {
    expect(haeyoEnding("기회다", "있는")).toEqual({ word: "기회예요", status: "changed" });
    expect(haeyoEnding("바쁘다", "오후엔").status).toBe("unsure");
  });
});

describe("undot", () => {
  it("가운뎃점은 쉼표로, 공식 이름은 그대로", () => {
    expect(undot("저당·식물성 식품")).toBe("저당, 식물성 식품");
    expect(undot("동아시아·허블의 신간")).toBe("동아시아·허블의 신간");
  });
  it("toHaeyoText도 가운뎃점을 걷는다", () => {
    expect(conv("저당·식물성 트렌드를 보여주는 부스야.").text).toBe("저당, 식물성 트렌드를 보여주는 부스예요.");
  });
});

describe("검사", () => {
  it("voiceIssues는 반말과 합니다체를 찾는다", () => {
    expect(voiceIssues("고를 수 있어.")).toEqual(["반말 '있어'"]);
    expect(voiceIssues("찾을 수 없었어.")).toEqual(["반말 '없었어'"]);
    expect(voiceIssues("고를 수 있습니다.")).toEqual(["합니다체"]);
    expect(voiceIssues("고를 수 있어요.")).toEqual([]);
  });
  it("banmalEndings는 따옴표 안을 보지 않는다", () => {
    expect(banmalEndings("'좋아'라는 이름의 잔이에요.")).toEqual([]);
  });
  it("contentFlags는 못 찾았다는 문장, 인용 찌꺼기, 호칭을 잡는다", () => {
    expect(contentFlags("정보를 찾을 수 없어요.")).toHaveLength(1);
    expect(contentFlags("시음할 수 있어요. [cite: 1]")).toHaveLength(1);
    expect(contentFlags("너한테 맞는 잔이에요.")).toHaveLength(1);
    expect(contentFlags("나에게 맞는 티를 알아볼 수 있어요.")).toEqual([]);
  });
});

describe("toHaeyoValue", () => {
  it("jsonb 객체의 키와 순서를 지키며 값만 바꾼다", () => {
    const r = toHaeyoValue({
      goods: "블렌딩 허브티를 구매할 수 있어.",
      trend: "포장재 트렌드를 엿볼 수 있다.",
    });
    expect(r.value).toEqual({
      goods: "블렌딩 허브티를 구매할 수 있어요.",
      trend: "포장재 트렌드를 엿볼 수 있어요.",
    });
    expect(Object.keys(r.value as object)).toEqual(["goods", "trend"]);
    expect(r.changed).toBe(true);
    expect(r.unsure).toEqual([]);
  });
  it("배열 항목도 본다", () => {
    const r = toHaeyoValue(["오후엔 붐벼.", "주말 오후 붐빔"]);
    expect(r.unsure.length).toBeGreaterThan(0); // '붐벼'는 규칙 밖
  });
  it("모르는 끝이 하나라도 있으면 unsure에 남는다", () => {
    const r = toHaeyoValue({ a: "고를 수 있어.", b: "방식을 봐." });
    expect(r.unsure).toEqual(["'봐'"]);
  });
});
