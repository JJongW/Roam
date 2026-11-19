import { describe, it, expect } from "vitest";
import { enforceDraftVoice, voiceDroppedIssue } from "@/lib/enrichment/draft-voice";

describe("enforceDraftVoice", () => {
  it("알려진 반말과 한다체 끝을 해요체로 바꾼다", () => {
    const { payload, dropped } = enforceDraftVoice({
      summary: "하임트리는 한방 허브티를 만든다.",
      roamInterpretation: "중의사가 블렌딩한 허브티가 대표작이야.",
      recommendationReasons: {
        goods: "블렌딩 허브티를 구매할 수 있어.",
        learning: "몸에 맞는 티를 알아볼 수 있다.",
      },
      timing: ["주말 오후엔 시음 줄이 길어."],
      thingsToDo: ["쌍화1988 시음하기"],
      memoryHooks: ["쌍화"],
    });
    expect(dropped).toEqual([]);
    expect(payload).toEqual({
      summary: "하임트리는 한방 허브티를 만들어요.",
      roamInterpretation: "중의사가 블렌딩한 허브티가 대표작이에요.",
      recommendationReasons: {
        goods: "블렌딩 허브티를 구매할 수 있어요.",
        learning: "몸에 맞는 티를 알아볼 수 있어요.",
      },
      timing: ["주말 오후엔 시음 줄이 길어요."],
      thingsToDo: ["쌍화1988 시음하기"],
      memoryHooks: ["쌍화"],
    });
  });

  it("모르는 끝은 그 키, 그 항목, 그 칸만 뺀다", () => {
    const { payload, dropped } = enforceDraftVoice({
      roamInterpretation: "패브릭을 만드는구나.",
      recommendationReasons: {
        goods: "실물로 고를 수 있어.",
        inspiration: "손으로 빚는 방식을 봐.",
      },
      timing: ["오후엔 붐벼.", "사인회는 토요일 2시예요."],
    });
    expect(payload.roamInterpretation).toBeUndefined();
    expect(payload.recommendationReasons).toEqual({ goods: "실물로 고를 수 있어요." });
    expect(payload.timing).toEqual(["사인회는 토요일 2시예요."]);
    expect(dropped.map((d) => (d.key ? `${d.field}.${d.key}` : d.field))).toEqual([
      "roamInterpretation",
      "recommendationReasons.inspiration",
      "timing",
    ]);
  });

  it("다 빠지면 칸 자체를 지운다(빈 값으로 덮지 않게)", () => {
    const { payload } = enforceDraftVoice({ recommendationReasons: { a: "방식을 봐." }, timing: ["붐벼."] });
    expect("recommendationReasons" in payload).toBe(false);
    expect("timing" in payload).toBe(false);
  });

  it("요청 안 한 칸을 만들지 않는다", () => {
    const { payload } = enforceDraftVoice({ thingsToDo: ["원두 시음하기"] });
    expect(Object.keys(payload)).toEqual(["thingsToDo"]);
  });

  it("합니다체와 가운뎃점도 맞춘다", () => {
    const { payload } = enforceDraftVoice({ summary: "와인·위스키를 수입합니다." });
    expect(payload.summary).toBe("와인, 위스키를 수입해요.");
  });
});

describe("voiceDroppedIssue", () => {
  it("빠진 게 없으면 null", () => {
    expect(voiceDroppedIssue([])).toBeNull();
  });
  it("빠진 칸을 메시지에 적는다", () => {
    const i = voiceDroppedIssue([{ field: "recommendationReasons", key: "goods", text: "x", why: [] }]);
    expect(i?.code).toBe("voice_dropped");
    expect(i?.message).toContain("recommendationReasons.goods");
  });
});
