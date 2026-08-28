import { describe, expect, it } from "vitest";
import { DICTS } from "@/lib/i18n/dictionaries";
import { LOADING_MESSAGES } from "@/lib/loading-messages";
import manifest from "@/app/manifest";

/**
 * 브랜드 보이스 가드 — 문서가 아니라 테스트가 규칙을 지킨다.
 *
 * 브랜드북(`docs/brand/`)의 1층(불변)·2층(생성)·4층(금칙)을 기계로 강제한다.
 * 문구를 새로 쓸 때 여기서 걸리면, 테스트가 아니라 문구를 고친다.
 * 규칙 자체를 바꿔야 한다면 브랜드북을 먼저 고치고 그 근거로 여기를 고친다.
 *
 * 여기서 검사하지 못하는 것(사람이 봐야 하는 것):
 *   - 사실절이 실제로 사실인지, 근거절이 진짜 근거인지
 *   - 한 호흡인지(길이는 셀 수 있지만 호흡은 못 센다)
 *   - 아키타입에 맞는 깊이인지
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
const offenders = (list: Entry[], re: RegExp, skip: (e: Entry) => boolean = () => false) =>
  list.filter((e) => !skip(e) && re.test(e.text)).map((e) => `${label(e)} — ${e.text}`);

/**
 * 존댓말이 허용되는 자리는 화자가 로미가 **아닌** 곳뿐이다:
 * metadata.description(크롤러·OAuth 심사) · /privacy · /terms · /admin.
 * 이 사전은 전부 방문객 앱의 로미 발화라 예외가 없다.
 * (브랜드북 02_voice-tone.md §7)
 */
const HONORIFIC =
  /(하세요|해\s*주세요|주세요|하십시오|습니다|입니다|합니다|됩니다|예요|이에요|[가-힣](?:아|어|여|해|워|되|와|나|시)요(?=[\s.!?…"'’]|$))/;

/** 과장·영업·일반 AI 문구·폐기된 동선 프레이밍. (§1-4, §4-4, §4-7) */
const BANNED =
  /(최고!|놓치면\s*후회|강추|절대\s*놓치지|AI가\s*분석|AI\s*분석|인공지능이\s*분석|최적\s*동선|턴바이턴|효율적|완벽한|필수\s*코스|동선을\s*짜)/;

/** 2026-08-10 판단 어휘 개편으로 폐기된 반응 어휘. (§5, §8) */
const DEPRECATED_JUDGMENT = /(이미\s*봄|끌림)/;

/**
 * 가치 이름 되읽기 금지 — "발견 쪽 부스야"·"네 관심 가치랑 겹쳐"처럼
 * 사용자가 방금 고른 단어를 그대로 돌려주는 것은 정보가 아니다. (§4-2)
 * 예외: 가치를 고르는 화면 자체(가치가 UI의 대상인 곳).
 */
const VALUE_READBACK =
  /((발견|체험|굿즈|소통|학습|트렌드|영감)\s*(쪽|형|계열)\s*(부스|곳)|관심\s*가치|네가\s*고른\s*가치|가치랑\s*겹|가치로\s*미리)/;
const VALUE_UI_NAMESPACES = new Set(["values", "valueOnboarding", "onboardingQ"]);

describe("브랜드 보이스 — 1층 불변 규칙", () => {
  it("존댓말이 없다 (반말 따뜻체 한 결)", () => {
    expect(offenders(ko, HONORIFIC)).toEqual([]);
  });

  it("느낌표를 남발하지 않는다 (한 문구에 2개 이상 금지)", () => {
    const loud = ko
      .filter((e) => (e.text.match(/!/g) ?? []).length >= 2)
      .map((e) => `${label(e)} — ${e.text}`);
    expect(loud).toEqual([]);
  });
});

describe("브랜드 보이스 — 4층 금칙", () => {
  it("과장·영업·일반 AI 문구·동선 프레이밍이 없다", () => {
    expect(offenders(ko, BANNED)).toEqual([]);
    expect(offenders(en, /(AI\s+analy|perfect route|optimal route|turn-by-turn|don't miss out)/i)).toEqual([]);
  });

  it("폐기된 판단 어휘(끌림·이미 봄)를 쓰지 않는다", () => {
    expect(offenders(ko, DEPRECATED_JUDGMENT)).toEqual([]);
  });

  it("로미가 가치 이름을 되읽어주지 않는다", () => {
    expect(offenders(ko, VALUE_READBACK, (e) => VALUE_UI_NAMESPACES.has(e.ns))).toEqual([]);
  });

  it("서비스 이름은 'Roam' 단독이다", () => {
    expect(offenders(ko, /Exhibition\s*Navigator/)).toEqual([]);
    expect(offenders(en, /Exhibition\s*Navigator/)).toEqual([]);
    const m = manifest();
    expect(m.name).toBe("Roam");
    expect(m.short_name).toBe("Roam");
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
  it("로딩 문구도 로미의 말이다 (존댓말·금칙어 없음)", () => {
    const all = Object.values(LOADING_MESSAGES).flat();
    expect(all.filter((s) => HONORIFIC.test(s))).toEqual([]);
    expect(all.filter((s) => BANNED.test(s) || /동선/.test(s))).toEqual([]);
  });

  it("각 토픽에 변주가 2개 이상 있다", () => {
    for (const [topic, list] of Object.entries(LOADING_MESSAGES)) {
      expect(list.length, `LOADING_MESSAGES.${topic}`).toBeGreaterThanOrEqual(2);
    }
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
