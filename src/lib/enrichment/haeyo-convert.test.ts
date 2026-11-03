import { describe, expect, it, vi } from "vitest";
import {
  convertLine,
  decideApply,
  evenSample,
  haeyoUserPrompt,
  judgeLine,
  mapPool,
  voiceExtras,
  type HaeyoLLM,
} from "./haeyo-convert";

const before = "귀로 듣는 책이 궁금하면, 오디오북을 직접 체험해보고 굿즈까지 챙기는 부스야.";
const good = "귀로 듣는 책이 궁금하다면, 오디오북을 직접 체험해 보고 굿즈까지 챙길 수 있는 부스예요.";

describe("judgeLine", () => {
  it("말투만 해요체로 바꾸면 통과", () => {
    expect(judgeLine({ boothId: "b1", before }, good)).toMatchObject({ pass: true, reasons: [] });
  });

  it("반말이 남으면 tone-gate와 quality-gate 둘 다 떨어뜨린다", () => {
    const v = judgeLine({ boothId: "b1", before }, before);
    expect(v.pass).toBe(false);
    expect(v.codes).toContain("quality:not_roam_voice");
    expect(v.codes.some((c) => c.startsWith("tone:"))).toBe(true);
  });

  it("권유형 '~하세요'는 남의 목소리라 떨어진다", () => {
    const v = judgeLine({ boothId: "b1", before: "오디오북을 직접 체험해 봐." }, "오디오북을 직접 체험하세요.");
    expect(v.codes).toContain("quality:not_roam_voice");
  });

  it("숫자, 영문 이름이 바뀌거나 과장이 생기면 떨어진다", () => {
    const b = "3년 숙성한 Makgeolli Lab 막걸리를 시음할 수 있어.";
    expect(judgeLine({ boothId: "b", before: b }, "3년 숙성한 Makgeolli Lab 막걸리를 시음할 수 있어요.").pass).toBe(true);
    const v = judgeLine({ boothId: "b", before: b }, "5년 숙성한 막걸리를 꼭 가서 무조건 시음할 수 있어요.");
    expect(v.reasons.join("\n")).toMatch(/숫자가 빠졌어요: 3/);
    expect(v.reasons.join("\n")).toMatch(/Makgeolli/);
    expect(v.reasons.join("\n")).toMatch(/무조건/);
  });

  it("부스 이름이 원문에 있으면 지켜야 한다", () => {
    const b = "헤르시가 만든 도자 컵이 대표작이야.";
    const v = judgeLine({ boothId: "b", before: b, boothName: "헤르시" }, "도자 컵이 대표작이에요.");
    expect(v.reasons.join("\n")).toMatch(/지켜야 할 말이 빠졌어요: 헤르시/);
  });

  it("가운뎃점, '전시', 호칭, 반말 자기지칭을 잡는다", () => {
    const b = "내가 고른 접시·컵이 있는 부스야.";
    const v = judgeLine({ boothId: "b", before: b }, "내가 고른 접시·컵이 있는 전시 부스예요.");
    expect(v.codes).toEqual(expect.arrayContaining(["voice:first_person", "tone:가운뎃점이 있어요. 쉼표나 와, 과로 바꿔 주세요"]));
    expect(v.reasons.join("\n")).toMatch(/전시/);
  });

  it("원문에도 있던 상투어는 표시를 단다", () => {
    const b = "다양한 원두를 맛볼 수 있는 부스야.";
    const v = judgeLine({ boothId: "b", before: b }, "다양한 원두를 맛볼 수 있는 부스예요.");
    expect(v.pass).toBe(false);
    expect(v.reasons.join("\n")).toMatch(/filler.*원문에도 있음/);
  });
});

describe("두 게이트가 안 보는 것(실제 표본에서 나온 사례)", () => {
  it("'~보세요' 권유형은 떨어진다", () => {
    const b = "40가지 넘는 유약으로 만드는 도자기 그릇을 구경해 봐.";
    expect(judgeLine({ boothId: "b", before: b }, "40가지 넘는 유약으로 만드는 도자기 그릇을 구경해 보세요.").codes).toContain(
      "voice:imperative",
    );
    expect(judgeLine({ boothId: "b", before: b }, "40가지 넘는 유약으로 만드는 도자기 그릇을 구경해 보기 좋아요.").pass).toBe(true);
  });

  it("읽는 사람의 '나'를 로미의 '저'로 바꾸면 떨어진다", () => {
    const b = "템퍼 매트리스에 직접 누워보고 나에게 맞는 경도를 찾아볼 수 있어.";
    const v = judgeLine({ boothId: "b", before: b }, "템퍼 매트리스에 직접 누워 보고 저에게 맞는 경도를 찾아볼 수 있어요.");
    expect(v.codes).toContain("voice:reader_to_romi");
  });

  it("낱말 철자가 바뀌거나 겹치면 떨어진다", () => {
    const b = "다마요팩은 스타벅스 같은 대형 프랜차이즈에 납품하는 컵홀더를 만드는 곳이야.";
    const v = judgeLine({ boothId: "b", before: b }, "다마요팩은 스타벅스 같은 대형 프랜차이이즈에 납품하는 컵홀더를 만드는 곳이에요.");
    expect(v.codes).toContain("content:stutter");
    const w = judgeLine({ boothId: "b", before: b }, "다마요팩은 스타벅스 같은 대형 업체에 납품하는 컵홀더를 만드는 곳이에요.");
    expect(w.reasons.join("\n")).toMatch(/사라지거나 바뀌었어요: 프랜차이즈에/);
  });

  it("띄어쓰기 교정과 '판매' → '파는' 교체는 보존 위반이 아니다", () => {
    const b = "소화기를 직접 만들고 판매하는 곳이야. 착용해봐야 알아.";
    expect(judgeLine({ boothId: "b", before: b }, "소화기를 직접 만들고 파는 곳이에요. 착용해 봐야 알 수 있어요.").pass).toBe(true);
  });
});

describe("voiceExtras", () => {
  it("호칭과 자기지칭", () => {
    expect(voiceExtras("네 취향이라면 들러 보기 좋아요.").map((x) => x.code)).toEqual(["address_term"]);
    expect(voiceExtras("당신이 좋아할 원두예요.").map((x) => x.code)).toEqual(["address_term"]);
    expect(voiceExtras("제가 골라 둔 원두예요.")).toEqual([]);
    expect(voiceExtras("빛나는 유리컵이에요.")).toEqual([]);
    // 전체 드라이런에서 나온 오탐: 동사 '나다', 읽는 사람 입장의 '나만의'
    expect(voiceExtras("가평에서 나는 과일로 만든 와인이에요. 수박향이 나는 원두예요.")).toEqual([]);
    expect(voiceExtras("나만의 자수 파우치를 만들어 볼 수 있어요.")).toEqual([]);
    expect(voiceExtras("내가 고른 원두예요.").map((x) => x.code)).toEqual(["first_person"]);
  });

  it("부스가 해 주는 일을 '드려요'로 높이면 떨어진다", () => {
    const b = "크림치즈를 발라 먹는 방법을 알려줄 거야.";
    expect(voiceExtras("크림치즈를 발라 먹는 방법을 알려 드릴 거예요.", b).map((x) => x.code)).toEqual(["humble_shift"]);
    expect(voiceExtras("크림치즈를 발라 먹는 방법을 알려 줄 거예요.", b)).toEqual([]);
  });

  it("긴 낱말의 세 음절 어미 변화는 보존 위반이 아니다", () => {
    const b = "알로소는 소파와 함께 거실 공간을 완성하는 가구를 제안하는구나.";
    expect(judgeLine({ boothId: "b", before: b }, "알로소는 소파와 함께 거실 공간을 완성하는 가구를 제안해요.").pass).toBe(true);
  });
});

describe("convertLine", () => {
  it("첫 응답이 통과하면 한 번만 부른다", async () => {
    const llm = vi.fn<HaeyoLLM>().mockResolvedValue(good);
    const r = await convertLine({ boothId: "b1", before }, llm);
    expect(r).toMatchObject({ pass: true, after: good, calls: 1 });
    expect(llm.mock.calls[0][0].prompt).toBe(haeyoUserPrompt(before));
  });

  it("검사에서 떨어지면 이유를 넣어 한 번만 다시 부른다", async () => {
    const llm = vi.fn<HaeyoLLM>().mockResolvedValueOnce(before).mockResolvedValueOnce(good);
    const r = await convertLine({ boothId: "b1", before }, llm);
    expect(r).toMatchObject({ pass: true, calls: 2 });
    expect(llm.mock.calls[1][0].prompt).toMatch(/검사에서 떨어졌다/);
  });

  it("두 번 다 떨어지면 마지막 결과와 이유를 낸다", async () => {
    const llm = vi.fn<HaeyoLLM>().mockResolvedValue(before);
    const r = await convertLine({ boothId: "b1", before }, llm);
    expect(r.pass).toBe(false);
    expect(r.calls).toBe(2);
    expect(r.after).toBe(before);
    expect(r.reasons.length).toBeGreaterThan(0);
  });

  it("원문에도 있던 지적만 남으면 다시 부르지 않는다", async () => {
    const b = "다양한 원두를 맛볼 수 있는 부스야.";
    const llm = vi.fn<HaeyoLLM>().mockResolvedValue("다양한 원두를 맛볼 수 있는 부스예요.");
    const r = await convertLine({ boothId: "b", before: b }, llm);
    expect(r).toMatchObject({ pass: false, calls: 1 });
  });

  it("예외는 한 번 다시 부르고, 둘 다 실패하면 llm:error", async () => {
    const llm = vi.fn<HaeyoLLM>().mockRejectedValueOnce(new Error("503")).mockResolvedValueOnce(good);
    expect(await convertLine({ boothId: "b1", before }, llm)).toMatchObject({ pass: true, calls: 2 });

    const dead = vi.fn<HaeyoLLM>().mockRejectedValue(new Error("503"));
    const r = await convertLine({ boothId: "b1", before }, dead);
    expect(r).toMatchObject({ pass: false, after: "", codes: ["llm:error"], calls: 2 });
  });
});

describe("decideApply", () => {
  const row = (over: Partial<Parameters<typeof decideApply>[0]>) => ({
    before: "a",
    after: "b",
    pass: false,
    reasons: ["r"],
    codes: [] as string[],
    ...over,
  });

  it("통과는 갱신", () => {
    expect(decideApply(row({ pass: true, reasons: [] })).action).toBe("update");
  });

  it("원문에 있던 상투어만 걸리면 갱신(목록은 따로)", () => {
    expect(decideApply(row({ codes: ["quality:filler"] })).action).toBe("update_filler");
  });

  it("못 찾았다는 자백이나 추측은 다른 지적이 같이 있어도 재초안", () => {
    expect(decideApply(row({ codes: ["quality:not_found", "voice:humble_shift"] })).action).toBe("redraft");
    expect(decideApply(row({ codes: ["quality:speculation"] })).action).toBe("redraft");
  });

  it("가운뎃점만 걸리면 쉼표로 고쳐 다시 판정한다", () => {
    const b = "호시자키한국은 제빙기, 냉동·냉장고, 식기세척기 같은 주방 기기를 직접 보고 상담받을 수 있어.";
    const a = "호시자키한국은 제빙기, 냉동·냉장고, 식기세척기 같은 주방 기기를 직접 보고 상담받을 수 있어요.";
    const v = judgeLine({ boothId: "b", before: b }, a);
    const d = decideApply({ before: b, after: a, pass: v.pass, reasons: v.reasons, codes: v.codes });
    expect(d).toMatchObject({
      action: "update",
      fixedMiddot: true,
      after: "호시자키한국은 제빙기, 냉동, 냉장고, 식기세척기 같은 주방 기기를 직접 보고 상담받을 수 있어요.",
    });
  });

  it("그 밖의 실패는 after를 담아 검수", () => {
    expect(decideApply(row({ codes: ["voice:humble_shift"] })).action).toBe("review");
    expect(decideApply(row({ codes: ["llm:error"], after: "" })).action).toBe("redraft");
  });
});

describe("mapPool / evenSample", () => {
  it("순서를 지키고 동시성을 넘지 않는다", async () => {
    let live = 0;
    let peak = 0;
    const out = await mapPool([1, 2, 3, 4, 5, 6], 2, async (n) => {
      live += 1;
      peak = Math.max(peak, live);
      await new Promise((r) => setTimeout(r, 5));
      live -= 1;
      return n * 10;
    });
    expect(out).toEqual([10, 20, 30, 40, 50, 60]);
    expect(peak).toBe(2);
  });

  it("고르게 뽑는다", () => {
    expect(evenSample([0, 1, 2, 3, 4, 5, 6, 7, 8, 9], 5)).toEqual([0, 2, 4, 6, 8]);
    expect(evenSample([1, 2], 5)).toEqual([1, 2]);
  });
});
