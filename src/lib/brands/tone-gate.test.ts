import { describe, expect, it } from "vitest";
import { checkToneConversion as gate, fairNameForms } from "./tone-gate";

/** 브랜드 소개 다시 쓰기(2026-11-28). */
const checkToneConversion = (input: Parameters<typeof gate>[0]) => gate({ ...input, mode: "intro" });

const original =
  "직접 그린 러프한 그림들을 일상 속 소품에 담아 취향이 자라나는 공간을 제안하는 아트 브랜드입니다. 그림에서 시작된 디자인이 쿠션, 패브릭, 포스터로 이어집니다. 2019년부터 Heedagarden이라는 이름으로 활동했습니다.";

const good =
  "직접 그린 러프한 그림을 일상 속 소품에 담는 아트 브랜드예요. 취향이 자라는 공간을 제안해요.\n\n그림에서 시작한 디자인이 쿠션, 패브릭, 포스터로 이어져요. 2019년부터 Heedagarden이라는 이름으로 활동했어요.";

describe("checkToneConversion mode intro — 브랜드 소개", () => {
  it("해요체 짧은 소개, 문단 2개, 원문에 있는 것만이면 통과", () => {
    expect(checkToneConversion({ original, display: good, protectedTerms: ["포스터", "쿠션", "희다가든"] })).toEqual({ ok: true, issues: [] });
  });

  it("줄인 소개는 원문의 숫자나 영문, 품목이 빠져도 통과(2026-11-28부터)", () => {
    const r = checkToneConversion({
      original,
      display: "직접 그린 그림을 일상 속 소품에 담는 아트 브랜드예요.\n\n그림에서 시작한 디자인이 쿠션과 패브릭으로 이어져요.",
      protectedTerms: ["포스터"],
    });
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("원문에 없는 숫자나 영문이 생기면 실패", () => {
    const r = checkToneConversion({ original, display: good.replace("2019", "2020").replace("Heedagarden", "Heeda Studio") });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain("원문에 없는 숫자가 생겼어요: 2020");
    expect(r.issues).toContain("원문에 없는 영문 표기가 생겼어요: Studio");
  });

  it("합니다체, 전시, 가운뎃점, 과장이 남으면 실패", () => {
    const r = checkToneConversion({
      original: "수공예 키링을 만드는 공방입니다. 매년 일러스트 페어에 참가합니다.",
      display: "최고의 수공예 키링을 만드는 공방입니다. 매년 일러스트 전시·페어에 참가해요!",
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith("해요체가 아닌 문장"))).toBe(true);
    expect(r.issues.some((i) => i.startsWith('"전시"'))).toBe(true);
    expect(r.issues.some((i) => i.startsWith("가운뎃점"))).toBe(true);
    expect(r.issues).toContain("원문에 없는 과장이나 단정이 생겼어요: 최고");
  });

  it("원문 고유명사 안의 전시는 그대로 둘 수 있다", () => {
    const r = checkToneConversion({
      original: "'서울전시공방'은 판화를 만듭니다.",
      display: "'서울전시공방'은 판화를 만들어요.",
    });
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("받침 없는 말 뒤 이에요는 예요로", () => {
    const r = checkToneConversion({ original: "아트 브랜드입니다.", display: "아트 브랜드이에요." });
    expect(r.issues).toContain('"드이에요"는 "드예요"로 써 주세요');
    expect(checkToneConversion({ original: "공방입니다.", display: "공방이에요." }).ok).toBe(true);
  });

  it("너무 짧아지면 내용이 빠진 것으로 본다", () => {
    const r = checkToneConversion({ original, display: "아트 브랜드예요." });
    expect(r.issues.some((i) => i.startsWith("원문보다 너무 짧아요"))).toBe(true);
  });

  it("원문보다 많이 길면 덧붙인 것으로 본다", () => {
    const r = checkToneConversion({
      original: "컵을 빚어요.",
      display: "손으로 컵을 빚어요.\n\n흙을 고르고 유약을 섞는 일부터 가마에 굽는 일까지 혼자 해요.",
    });
    expect(r.issues.some((i) => i.startsWith("원문보다 너무 길어요"))).toBe(true);
  });

  it("원문의 인스타 아이디와 링크는 지킬 말이 아니라 남으면 실패", () => {
    const orig = "도자기 컵을 빚는 공방입니다.\n인스타그램 @cup.studio\nhttps://cup.kr #도자기";
    expect(checkToneConversion({ original: orig, display: "도자기 컵을 빚는 공방이에요." })).toEqual({ ok: true, issues: [] });
    const r = checkToneConversion({ original: orig, display: "도자기 컵을 빚는 공방이에요. @cup.studio 에서 소식을 전해요 #도자기" });
    expect(r.issues).toContain("인스타 아이디가 남았어요: @cup.studio");
    expect(r.issues).toContain("해시태그가 남았어요: #도자기");
  });

  it("브랜드 1인칭, 방문객 호칭, 팔로우 안내가 남으면 실패", () => {
    const r = checkToneConversion({
      original: "제 그림이 여러분의 일상에 웃음을 더하길 바랍니다. 팔로우 부탁드려요.",
      display: "제 그림이 여러분의 일상에 웃음을 더하길 바라요. 팔로우해 주세요.",
    });
    expect(r.issues).toContain("브랜드가 자기를 가리키는 말이 남았어요: 제");
    expect(r.issues).toContain("방문객을 부르는 말이 남았어요: 여러분");
    expect(r.issues).toContain("팔로우나 연락 안내가 남았어요");
  });

  it("방문객에게 권하는 문장(~해 보세요)은 실패", () => {
    const r = checkToneConversion({ original: "새해를 가볍게 시작해 보세요.", display: "새해를 가볍게 시작해 보세요." });
    expect(r.issues.some((i) => i.startsWith("방문객에게 권하는 문장"))).toBe(true);
  });

  it("한 회차에만 맞는 말(이번 행사)은 실패", () => {
    const r = checkToneConversion({ original: "이번 행사에서 단원을 모집합니다.", display: "이번 행사에서 단원을 모집해요." });
    expect(r.issues).toContain("한 회차에만 맞는 말이 있어요: 이번 행사");
  });

  it("행사 이름과 방문객이라는 말은 실패", () => {
    const r = checkToneConversion({
      original: "새해준비상점에서 여러분을 기다립니다.",
      display: "새해 준비상점에서 방문객을 기다려요.",
      fairNames: ["새해 준비상점 N.27"],
    });
    expect(r.issues).toContain("행사 이름이 들어 있어요: 새해 준비상점");
    expect(r.issues).toContain("방문객을 부르는 말이 남았어요: 방문객");
  });

  it("행사 이름 알맹이", () => {
    expect(fairNameForms("제25회 서울카페쇼 2026")).toEqual(["제25회 서울카페쇼 2026", "서울카페쇼"]);
    expect(fairNameForms("하우스 아카이브: 홈 디깅 페어")).toEqual(["하우스 아카이브: 홈 디깅 페어", "하우스 아카이브"]);
  });

  it("브랜드 이름에 든 숫자와 영문은 지어낸 게 아니다", () => {
    const r = checkToneConversion({
      original: "좋아하는 마음을 담아 책을 만듭니다.",
      display: "스튜디오604는 좋아하는 마음을 담아 책을 만들어요.",
      protectedTerms: ["스튜디오604"],
    });
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("드려요는 원문에 없으면 실패", () => {
    const r = checkToneConversion({ original: "이야기를 전합니다.", display: "이야기를 전해드려요." });
    expect(r.issues.some((i) => i.startsWith("드려요는"))).toBe(true);
  });

  it("낱말 안에 우연히 든 전시(에이전시, 발전시켜요)는 괜찮다", () => {
    const r = checkToneConversion({
      original: "브랜딩 에이전시입니다. 브랜드를 발전시킵니다.",
      display: "브랜딩 에이전시예요. 브랜드를 발전시켜요.",
    });
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("주어 없는 바람(~기를 바라요, ~길 바라요)은 실패, 브랜드가 주어인 사실은 통과", () => {
    const original = "새해에 작은 행복이 함께하길 바랍니다.";
    for (const display of ["새해에 작은 행복이 함께하기를 바라요.", "새해에 작은 행복이 함께하길 바라요."])
      expect(checkToneConversion({ original, display }).issues.some((i) => i.startsWith("누가 바라는지 모르는 문장"))).toBe(true);
    expect(checkToneConversion({ original, display: "푸치랜드는 새해에 작은 행복이 함께하기를 바라는 마음으로 만들어요." }).ok).toBe(true);
  });

  it("이에요와 예요 받침", () => {
    const o = "만듭니다.";
    expect(checkToneConversion({ original: o, display: "아트 브랜드이에요." }).issues).toContain('"드이에요"는 "드예요"로 써 주세요');
    expect(checkToneConversion({ original: o, display: "작은 공방예요." }).issues).toContain('"방예요"는 "방이에요"로 써 주세요');
    expect(checkToneConversion({ original: "공방입니다.", display: "작은 공방이에요." }).ok).toBe(true);
    expect(checkToneConversion({ original: "브랜드입니다.", display: "아트 브랜드예요." }).ok).toBe(true);
    // 영문, 숫자 뒤는 건너뛴다.
    expect(checkToneConversion({ original: "Siso입니다. 604입니다.", display: "Siso예요. 604이에요." }).issues.filter((i) => i.includes("써 주세요"))).toEqual([]);
    // 원문이 "고양이예요"인데 "고양이에요"로 쓰면 실패.
    expect(
      checkToneConversion({ original: "귀가 빨개지는 고양이예요.", display: "귀가 빨개지는 고양이에요." }).issues,
    ).toContain('"고양이에요"는 "고양이예요"로 써 주세요');
    expect(checkToneConversion({ original: "귀가 빨개지는 고양이예요.", display: "귀가 빨개지는 고양이예요." }).ok).toBe(true);
  });

  it("읽는 사람 시점의 나만의는 괜찮다", () => {
    expect(checkToneConversion({ original: "나만의 컵을 만들 수 있습니다.", display: "나만의 컵을 만들 수 있어요." }).ok).toBe(true);
  });

  it("문장 중간 줄바꿈과 한 덩어리 장문은 실패", () => {
    const long = "그림책과 독립출판, 그래픽 작업을 넘나들며 자기만의 시각 언어를 쌓아 가고 있어요. ".repeat(3).trim();
    expect(checkToneConversion({ original: long, display: long }).issues).toContain("한 덩어리라 읽기 어려워요. 문단을 2~3개로 나눠 주세요");
    expect(checkToneConversion({ original: "컵을 빚는 공방입니다.", display: "컵을 빚는\n공방이에요." }).issues).toContain(
      "문단 안에서 줄이 바뀌었어요. 문단 사이에만 빈 줄을 두세요",
    );
  });
});

const toneOriginal =
  "직접 그린 러프한 그림들을 일상 속 소품에 담아 취향이 자라나는 공간을 제안하는 아트 브랜드입니다. 그림에서 시작된 디자인이 쿠션, 패브릭, 포스터로 이어집니다. 2019년부터 Heedagarden이라는 이름으로 활동했습니다.";

describe("checkToneConversion mode tone(기본) — 말투만 바꾼 한 줄, 2026-11-03 규칙 그대로", () => {
  it("말투만 바꾸고 숫자, 이름, 품목을 지키면 통과", () => {
    const display =
      "직접 그린 러프한 그림을 일상 속 소품에 담아, 취향이 자라는 공간을 제안하는 아트 브랜드예요. 그림에서 시작한 디자인이 쿠션, 패브릭, 포스터로 이어져요. 2019년부터 Heedagarden이라는 이름으로 활동했어요.";
    expect(gate({ original: toneOriginal, display, protectedTerms: ["포스터", "쿠션", "희다가든"] })).toEqual({ ok: true, issues: [] });
  });

  it("숫자가 빠지거나 생기면 실패", () => {
    const r = gate({
      original,
      display: "직접 그린 그림을 소품에 담는 아트 브랜드예요. 디자인이 쿠션, 패브릭, 포스터로 이어져요. 2020년부터 Heedagarden이라는 이름으로 활동했어요.",
    });
    expect(r.ok).toBe(false);
    expect(r.issues).toContain("숫자가 빠졌어요: 2019");
    expect(r.issues).toContain("원문에 없는 숫자가 생겼어요: 2020");
  });

  it("영문 이름과 지켜야 할 품목이 빠지면 실패", () => {
    const r = gate({
      original,
      display: "직접 그린 러프한 그림을 일상 속 소품에 담아 취향이 자라는 공간을 제안하는 아트 브랜드예요. 그림에서 시작한 디자인이 쿠션과 패브릭으로 이어져요. 2019년부터 활동했어요.",
      protectedTerms: ["포스터"],
    });
    expect(r.issues).toContain("이름이나 표기가 빠졌어요: Heedagarden");
    expect(r.issues).toContain("지켜야 할 말이 빠졌어요: 포스터");
  });

  it("합니다체, 전시, 가운뎃점, 과장이 남으면 실패", () => {
    const r = gate({
      original: "수공예 키링을 만드는 공방입니다. 매년 일러스트 페어에 참가합니다.",
      display: "최고의 수공예 키링을 만드는 공방입니다. 매년 일러스트 전시·페어에 참가해요!",
    });
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.startsWith("해요체가 아닌 문장"))).toBe(true);
    expect(r.issues.some((i) => i.startsWith('"전시"'))).toBe(true);
    expect(r.issues.some((i) => i.startsWith("가운뎃점"))).toBe(true);
    expect(r.issues).toContain("원문에 없는 과장이나 단정이 생겼어요: 최고");
  });

  it("원문 고유명사 안의 전시는 그대로 둘 수 있다", () => {
    const r = gate({
      original: "'서울전시공방'은 판화를 만듭니다.",
      display: "'서울전시공방'은 판화를 만들어요.",
    });
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it("받침 없는 말 뒤 이에요는 예요로", () => {
    const r = gate({ original: "아트 브랜드입니다.", display: "아트 브랜드이에요." });
    expect(r.issues).toContain('"드이에요"는 "드예요"로 써 주세요');
    expect(gate({ original: "공방입니다.", display: "공방이에요." }).ok).toBe(true);
  });

  it("너무 짧아지면 내용이 빠진 것으로 본다", () => {
    const r = gate({ original: toneOriginal, display: "아트 브랜드예요. 2019 Heedagarden" });
    expect(r.issues.some((i) => i.startsWith("원문보다 너무 짧아요"))).toBe(true);
  });
});
