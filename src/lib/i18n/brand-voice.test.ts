import { describe, expect, it } from "vitest";
import { DICTS } from "@/lib/i18n/dictionaries";
import { LOADING_MESSAGES } from "@/lib/loading-messages";
import { boothAbout } from "@/lib/booth/about";
import manifest from "@/app/manifest";

/**
 * 브랜드 보이스 가드 — 문서가 아니라 테스트가 규칙을 지킨다.
 *
 * 브랜드북(`Roam-design/docs/brand/`)의 최상위 `00_brand-rules.md`와 `02_voice-tone.md`
 * §1(불변)·§2(생성)·§4(금칙)·§9(강제)를 기계로 강제한다.
 * 문구를 새로 쓸 때 여기서 걸리면, 테스트가 아니라 문구를 고친다.
 * 규칙 자체를 바꿔야 한다면 브랜드북을 먼저 고치고 그 근거로 여기를 고친다.
 *
 * 2026-11-02 Ted 결정으로 사용자 문구는 전부 해요체 존댓말이다(로미, 시스템 안내, 버튼 모두).
 * 이 파일은 그 전까지 반말을 강제했다(존댓말 0건). 지금은 거꾸로 반말과 합니다체를 막는다.
 *
 * 여기서 검사하지 못하는 것(사람이 봐야 하는 것):
 *   - 사실절이 실제로 사실인지, 근거절이 진짜 근거인지
 *   - 한 호흡인지(길이는 셀 수 있지만 호흡은 못 센다)
 *   - 이번 박람회의 맥락에 맞는 깊이인지
 *   - 반말 판별은 문장 끝 어미만 본다. 문장 가운데 섞인 반말은 사람이 본다.
 */

type Entry = { ns: string; key: string; idx: number; count: number; text: string };

function entries(dict: Record<string, Record<string, unknown>>): Entry[] {
  const out: Entry[] = [];
  for (const [ns, group] of Object.entries(dict)) {
    for (const [key, value] of Object.entries(group)) {
      const variants = Array.isArray(value) ? value : [value];
      variants.forEach((text, idx) =>
        out.push({ ns, key, idx, count: variants.length, text: String(text) }),
      );
    }
  }
  return out;
}

const ko = entries(DICTS.ko as never);
const en = entries(DICTS.en as never);
const label = (e: Entry) => `${e.ns}.${e.key}${e.count > 1 ? `[${e.idx}]` : ""}`;
const offenders = (
  list: Entry[],
  test: (s: string) => boolean,
  skip: (e: Entry) => boolean = () => false,
) => list.filter((e) => !skip(e) && test(e.text)).map((e) => `${label(e)} — ${e.text}`);
const re = (r: RegExp) => (s: string) => r.test(s);

/** 한글 음절의 받침이 ㄹ인가 — "할게", "볼까"의 ㄹ+게/까를 가려낸다. */
const hasRieulFinal = (ch: string | undefined) => {
  if (!ch) return false;
  const code = ch.charCodeAt(0) - 0xac00;
  return code >= 0 && code < 11172 && code % 28 === 8;
};

/**
 * 끝이 이렇게 끝나면 해요체가 아니라 반말이다. 문장(. , ? ! … — 기준) 끝 어미만 본다.
 * 명사형 라벨("다녀옴", "가볍게", "오늘까지")은 반말이 아니라서 잡지 않는다.
 */
const BANMAL_TAIL =
  /(야|어|아|해|봐|줘|돼|래|와|워|여|려|춰|눠|겨|져|쳐|뤄|혀|켜|펴|자|네|냐|니|지|다|구나|군|잖아|거든|는데|더라|나|가)$/;
/** 반말 꼬리처럼 보이지만 반말이 아닌 끝말. */
const NOT_BANMAL =
  /(까지|페이지|이미지|[는은인건던할을일갈볼올]지|하나|글자|숫자|의자|\d자|한국어|단어|미래|노래|다음|보다|작가|평가|가게|올해|이해)$/;
/** 쉼표 앞은 문장 끝이 아니다 — 이어 주는 어미(~는데, ~으니)는 반말이 아니다. */
const CONNECTIVE = /(는데|은데|니|으니|면|고|서)$/;

/** 문장 끝 하나를 해요체 기준으로 본다. `beforeComma`면 이어 주는 어미는 봐준다. */
function isBanmalClause(raw: string, beforeComma = false): boolean {
  // 따옴표 안 인용(부스명, 검색어)과 플레이스홀더, 장식 기호를 걷어낸다.
  const s = raw
    .replace(/[‘'][^’']*[’']/g, "")
    .replace(/\{\w+\}/g, "")
    .replace(/[\s"“”)(→👋~]+$/u, "")
    .trim();
  if (!s || !/[가-힣]$/.test(s)) return false;
  if (s.endsWith("요")) return false;
  if (NOT_BANMAL.test(s)) return false;
  if (beforeComma && CONNECTIVE.test(s)) return false;
  const last = s.at(-1);
  const prev = s.at(-2);
  // ~할게 / ~볼까 / ~할걸: 받침 ㄹ 뒤의 게·까·걸은 반말 약속·제안이다.
  if ((last === "게" || last === "까" || last === "걸") && hasRieulFinal(prev)) return true;
  if (last === "까" && prev === "을") return true;
  return BANMAL_TAIL.test(s);
}

/** 반말 어미가 문장 끝에 하나라도 있으면 true. */
function hasBanmal(text: string): boolean {
  const parts = text.split(/([.,?!…—\n])/);
  for (let i = 0; i < parts.length; i += 2) {
    if (isBanmalClause(parts[i], parts[i + 1] === ",")) return true;
  }
  return false;
}

/** 해요체에 섞이면 안 되는 합니다체. (§1-1, §4-3) */
const HAPNIDA = /([가-힣]니다|[가-힣]니까\?|십시오)(?=[\s.,!?…"'’)]|$)/;

/** 사용자를 부르는 말. 주어를 빼서 쓴다. (§1-1, §4-3) */
const ADDRESS = /(당신|(?:^|[\s‘'"(])(?:너|네가|네\s|널|너한테|너에게|너를|너의|너는|너랑))/;

/** "전시"는 사용자 문구에 쓰지 않는다 — 박람회, 페어, 행사, 행사장. (§4-9, 00_brand-rules §1) */
const EXHIBITION_WORD = /전시/;

/** 가운뎃점 금지. (§4-9, 00_brand-rules §5) */
const MIDDLE_DOT = /·/;

/** 과장·영업·일반 AI 문구·폐기된 동선 프레이밍·근거 없는 단정. (§1-4, §4-4, §4-7) */
const BANNED =
  /(최고!|놓치면\s*후회|강추|절대\s*놓치지|AI가\s*분석|AI\s*분석|인공지능이\s*분석|최적\s*동선|턴바이턴|효율적|완벽한|필수\s*코스|동선을\s*짜|무조건|확실히\s*취향|확실한\s*취향)/;

/** 판단 어휘 개편으로 폐기된 반응 어휘. (§5, §8) */
const DEPRECATED_JUDGMENT = /(이미\s*봄|끌림)/;

/**
 * 가치 이름 되읽기 금지 — "발견 쪽 부스예요"·"관심 가치랑 겹쳐요"처럼
 * 사용자가 방금 고른 단어를 그대로 돌려주는 것은 정보가 아니다. (§4-2)
 * 예외: 가치를 고르는 화면 자체(가치가 UI의 대상인 곳).
 */
const VALUE_READBACK =
  /((발견|체험|굿즈|소통|학습|트렌드|영감)\s*(쪽|형|계열)\s*(부스|곳)|관심\s*가치|고르신\s*가치|가치랑\s*겹|가치로\s*미리)/;
const VALUE_UI_NAMESPACES = new Set(["values", "valueOnboarding", "onboardingQ"]);

/** 2026-11-03 확정 판단 어휘(02_voice-tone.md §5). 웹과 iOS가 같은 말을 쓴다. */
const JUDGE_VOCAB = {
  must: "꼭 갈래요",
  curious: "끌려요",
  pass: "패스",
  good: "좋았어요",
  ok: "그저 그랬어요",
  bad: "아니었어요",
} as const;

describe("판별기 자체 — 반말과 해요체를 가른다", () => {
  it("반말 문장을 잡는다", () => {
    for (const s of [
      "굿즈는 3가지 정도 준비했어",
      "동물 쪽 부스야.",
      "챙겨둘게.",
      "다시 해볼까?",
      "‘{booth}’ 좋아했잖아, 여기도 그런 결이야.",
      "언어를 골라줘",
      "이제 확실히 알겠다.",
      "지금은 내가 못 가져와.",
      "끌려",
      "현장 소식을 실시간으로 나눠.",
      "알았어, 이런 건 덜 보여줄게.",
    ]) {
      expect(hasBanmal(s), s).toBe(true);
    }
  });

  it("해요체와 명사형 라벨은 통과시킨다", () => {
    for (const s of [
      "굿즈는 3가지 정도 준비했어요",
      "‘{booth}’, 기억해 둘게요.",
      "다시 해 볼까요?",
      "오늘까지",
      "가볍게",
      "다녀옴",
      "지금 유행하는 건지",
      "‘{booth}’ 패스. 기억해 둘게요.",
      "취향 {pct}% ({n}건)",
      "닉네임 (2–20자)",
      "많이 보기보다",
      "조금씩 감이 오는데, 좀 더 봐야겠어요.",
      "새로운 발견을 기대하며",
    ]) {
      expect(hasBanmal(s), s).toBe(false);
    }
  });
});

describe("브랜드 보이스 — 1층 불변 규칙 (해요체 존댓말)", () => {
  it("반말 어미가 없다", () => {
    expect(offenders(ko, hasBanmal)).toEqual([]);
  });

  it("합니다체를 섞지 않는다", () => {
    expect(offenders(ko, re(HAPNIDA))).toEqual([]);
  });

  it("사용자를 '당신', '너'로 부르지 않는다", () => {
    expect(offenders(ko, re(ADDRESS))).toEqual([]);
  });

  it("느낌표를 남발하지 않는다 (한 문구에 2개 이상 금지)", () => {
    const loud = ko
      .filter((e) => (e.text.match(/!/g) ?? []).length >= 2)
      .map((e) => `${label(e)} — ${e.text}`);
    expect(loud).toEqual([]);
  });
});

describe("브랜드 보이스 — 4층 금칙", () => {
  it("'전시', '전시회', '전시장'을 쓰지 않는다", () => {
    expect(offenders(ko, re(EXHIBITION_WORD))).toEqual([]);
  });

  it("가운뎃점(·)을 쓰지 않는다", () => {
    expect(offenders(ko, re(MIDDLE_DOT))).toEqual([]);
  });

  it("따옴표로 감싼 플레이스홀더 뒤에 받침 따라 갈리는 조사를 붙이지 않는다 (§2-2)", () => {
    // "‘{booth}’는", "‘{theme}’라고"는 이름 받침에 따라 깨진다. 쉼표나 받침과 무관한
    // 조사(도, 에, 쪽)로 잇는다.
    const JOSA_AFTER_SLOT = /\{\w+\}’(는|은|이|가|을|를|이라고|라고|과|와|으로|로)(?![가-힣])/;
    expect(offenders(ko, re(JOSA_AFTER_SLOT))).toEqual([]);
  });

  it("과장·영업·일반 AI 문구·동선 프레이밍·근거 없는 단정이 없다", () => {
    expect(offenders(ko, re(BANNED))).toEqual([]);
    expect(
      offenders(en, re(/(AI\s+analy|perfect route|optimal route|turn-by-turn|don't miss out)/i)),
    ).toEqual([]);
  });

  it("폐기된 판단 어휘(끌림·이미 봄)를 쓰지 않는다", () => {
    expect(offenders(ko, re(DEPRECATED_JUDGMENT))).toEqual([]);
  });

  it("로미가 가치 이름을 되읽어주지 않는다", () => {
    expect(offenders(ko, re(VALUE_READBACK), (e) => VALUE_UI_NAMESPACES.has(e.ns))).toEqual([]);
  });

  it("서비스 이름은 'Roam' 단독이다", () => {
    expect(offenders(ko, re(/Exhibition\s*Navigator/))).toEqual([]);
    expect(offenders(en, re(/Exhibition\s*Navigator/))).toEqual([]);
    const m = manifest();
    expect(m.name).toBe("Roam");
    expect(m.short_name).toBe("Roam");
  });

  it("manifest 설명도 같은 규칙을 지킨다", () => {
    const d = manifest().description ?? "";
    expect(hasBanmal(d), d).toBe(false);
    expect(HAPNIDA.test(d), d).toBe(false);
    expect(EXHIBITION_WORD.test(d) || MIDDLE_DOT.test(d), d).toBe(false);
  });
});

describe("브랜드 보이스 — 판단 어휘 (2026-11-03 확정)", () => {
  it("판단 버튼과 지도 범례가 확정 어휘를 쓴다", () => {
    const judge = DICTS.ko.judge as Record<string, string>;
    const map = DICTS.ko.map as Record<string, string>;
    for (const [key, word] of Object.entries(JUDGE_VOCAB)) {
      expect(judge[key], `judge.${key}`).toBe(word);
    }
    expect(map.legendMust).toBe(JUDGE_VOCAB.must);
    expect(map.legendCurious).toBe(JUDGE_VOCAB.curious);
    expect(map.legendPass).toBe(JUDGE_VOCAB.pass);
    expect(map.legendGood).toBe(JUDGE_VOCAB.good);
    expect(map.legendBad).toBe(JUDGE_VOCAB.bad);
    expect(judge.visitedLink).toContain("여기 다녀왔어요");
  });
});

describe("브랜드 보이스 — 2층 생성 규칙", () => {
  it("로미 반응 발화는 변주가 3개 이상이다 (반복은 로봇 느낌)", () => {
    for (const locale of ["ko", "en"] as const) {
      const companion = DICTS[locale].companion as Record<string, unknown>;
      const thin = Object.entries(companion)
        .filter(([key]) => /^react/i.test(key))
        .filter(([, value]) => (Array.isArray(value) ? value.length : 1) < 3)
        .map(([key]) => `${locale}.companion.${key}`);
      expect(thin).toEqual([]);
    }
  });

  it("같은 변주 풀 안에서는 플레이스홀더가 동일하다", () => {
    const tokens = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
    const mismatched: string[] = [];
    for (const locale of ["ko", "en"] as const) {
      for (const [ns, group] of Object.entries(DICTS[locale] as never as Record<string, Record<string, unknown>>)) {
        for (const [key, value] of Object.entries(group)) {
          if (!Array.isArray(value) || value.length < 2) continue;
          const shapes = new Set(value.map((v) => tokens(String(v))));
          if (shapes.size > 1) mismatched.push(`${locale}.${ns}.${key} → ${[...shapes].join(" | ")}`);
        }
      }
    }
    expect(mismatched).toEqual([]);
  });

  it("빈 문구가 없다", () => {
    expect(ko.filter((e) => !e.text.trim()).map(label)).toEqual([]);
  });
});

describe("브랜드 보이스 — 로딩 문구", () => {
  it("로딩 문구도 같은 규칙을 지킨다 (해요체, 금칙어 없음)", () => {
    const all = Object.values(LOADING_MESSAGES).flat() as string[];
    expect(all.filter(hasBanmal)).toEqual([]);
    expect(all.filter((s) => HAPNIDA.test(s) || ADDRESS.test(s))).toEqual([]);
    expect(all.filter((s) => EXHIBITION_WORD.test(s) || MIDDLE_DOT.test(s))).toEqual([]);
    expect(all.filter((s) => BANNED.test(s) || /동선/.test(s))).toEqual([]);
  });

  it("각 토픽에 변주가 2개 이상 있다", () => {
    for (const [topic, list] of Object.entries(LOADING_MESSAGES)) {
      expect(list.length, `LOADING_MESSAGES.${topic}`).toBeGreaterThanOrEqual(2);
    }
  });
});

describe("브랜드 보이스 — 부스 소개 로미 한 줄 (booth/about.ts)", () => {
  // 사전이 아니라 코드에서 조립되는 로미 발화라 사전 검사가 못 본다.
  const base = {
    id: "b",
    exhibitionId: "e",
    hallId: "h",
    categoryId: "c",
    kind: "exhibitor" as const,
    name: "테스트 부스",
    company: "",
    description: "",
    images: [],
    valueTags: [],
    x: 0,
    y: 0,
    popularity: 0,
    createdAt: "2026-01-01T00:00:00.000Z",
  };
  // 테마 라벨 원본엔 가운뎃점이 있다("문구·다꾸", "야생·상상동물") — 표시할 때 걷혀야 한다.
  const themeCases: [string, string[]][] = [
    ["animal", []],
    ["animal", ["고양이", "야생·상상동물"]],
    ["daily", ["위로·감성", "에세이·글"]],
    ["stationery", ["문구·다꾸", "리빙·실용"]],
  ];
  const lines = [0, 1, 3, 12].flatMap((goods) =>
    themeCases.map(
      ([theme, themeTags]) =>
        boothAbout({
          ...base,
          tags: ["kr-artist", theme],
          enrichment: { goodsKeywords: Array(goods).fill("x"), themeTags } as never,
        }).romi ?? "",
    ),
  );

  it("해요체이고 가운뎃점이 없다", () => {
    expect(lines.filter(Boolean).length).toBeGreaterThan(0);
    expect(lines.filter((s) => hasBanmal(s) || HAPNIDA.test(s) || MIDDLE_DOT.test(s))).toEqual([]);
  });
});

describe("i18n 정합", () => {
  it("ko와 en의 키가 정확히 일치한다", () => {
    const keys = (list: Entry[]) => new Set(list.map((e) => `${e.ns}.${e.key}`));
    const k = keys(ko);
    const e = keys(en);
    expect([...k].filter((x) => !e.has(x))).toEqual([]);
    expect([...e].filter((x) => !k.has(x))).toEqual([]);
  });
});
