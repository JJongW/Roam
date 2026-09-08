import { VALUE_TAGS, isValueSlug } from "@/lib/values";
import { isSomeoneElsesVoice } from "@/lib/booth/voice";
import type { BoothEnrichmentAuthorInput } from "@/lib/schemas";

export interface QualityIssue {
  /** 기계가 집계할 코드. 필드별 정확도 통계가 여기서 나온다. */
  code: string;
  field?: string;
  message: string;
  /** 0..1. 신뢰도에서 깎는 양. */
  weight: number;
}

export interface QualityReport {
  /** 0..1. 자동승인 임계값의 기준. */
  confidence: number;
  issues: QualityIssue[];
}

export interface GradeInput {
  payload: Partial<BoothEnrichmentAuthorInput>;
  sources: { uri: string; title?: string }[];
  booth: { name: string; company?: string };
  /** 같은 배치의 다른 초안이 이미 쓴 문장들. LLM이 템플릿을 되풀이하는 걸 잡는다. */
  seenPhrases?: Set<string>;
  /** 같은 배치에서 이미 나온 thingsToDo 항목들. 다른 부스에도 그대로 쓰이는
   *  행동은 그 부스 얘기가 아니다 — 상투어 사전보다 이 신호가 튼튼하다. */
  seenActions?: Set<string>;
  /** 초안기에게 **요청한** 필드. 이미 사람이 채워둔 필드는 초안기가 안 쓰는 게
   *  맞는데, 그걸 "없다"고 깎으면 잘한 초안이 전부 감점된다(파일럿 9/9가 이걸로
   *  깎였다). 안 주면 전 필드를 본다. */
  requested?: string[];
  /** 부스에 이미 공식 소개 같은 재료가 있었나. 있으면 검색 결과가 없어도 그 재료로
   *  쓴 것이라 "근거 없음"의 무게가 다르다. */
  hadMaterial?: boolean;
}

/**
 * 금지된 건 **가치 이름 자체가 아니라 분류를 되읽어주는 말투**다.
 *
 * 처음엔 라벨을 단어로 매칭했는데(발견·체험·굿즈…), 그 여덟이 전부 일상어라
 * 오탐이 쏟아졌다 — SIF 50건에서 8건이 "굿즈를 만날 수 있어" 같은 문장으로
 * 걸렸다. 거기서 "굿즈"는 그냥 물건을 가리키는 말이지 분류가 아니다.
 *
 * CLAUDE.md가 실제로 금지한 건 이것이다: *"'발견 쪽 부스야'·'네 관심 가치랑
 * 겹쳐'로 분류를 되읽어주는 건 현장에서 정보가 아니었다."* 그래서 **패턴**을 본다.
 */
const LABELS = VALUE_TAGS.map((v) => v.label).join("|");
const SLUGS = VALUE_TAGS.map((v) => v.slug).join("|");
const READBACK_PATTERNS: { re: RegExp; what: string }[] = [
  // "발견 쪽 부스야", "굿즈 쪽이야"
  { re: new RegExp(`(${LABELS})\\s*(쪽|계열|류)`), what: "분류를 되읽음" },
  // "네 관심 가치", "취향이랑 겹쳐", "네 가치와 맞아"
  { re: /(관심\s*가치|가치(랑|와|과)\s*(겹|맞)|취향(이|하고|이랑|랑)\s*겹)/, what: "가치 축을 직접 언급" },
  // "이 부스의 가치는 발견이야"
  { re: new RegExp(`가치[는은]?\\s*(${LABELS})`), what: "가치 이름을 값으로 말함" },
  // slug이 그대로 노출되는 건 언제나 잘못이다 — 사람 말이 아니다.
  { re: new RegExp(`\\b(${SLUGS})\\b`), what: "slug이 그대로 노출됨" },
];

/**
 * 초안이 **모른다고 말하면서 쓴 글**. 마곡 50부스(이름 말고 근거가 없는 것들)를
 * 돌렸더니 자동통과 16건 중 6건이 이 부류였고 전부 신뢰도 1.00이었다. 압권은
 * "정확한 정보는 확인되지 않는다"를 summary에 적고 만점을 받은 초안이다.
 * 형식만 보는 게이트는 추측을 사실과 구별하지 못한다.
 */
const SPECULATION = [
  /예상[돼된]/,
  /것으로 (보인다|보여|추정)/,
  /(판매|선보일|전시할) 것으로/,
  /확인되지 않/,
  /알 수 없/,
  /듯하다/,
  /(?<!선)보인다\./,
  /추정된다/,
];

/** 근거로 세면 안 되는 출처. 잡화 마켓플레이스·영상·백과·다른 박람회 디렉터리는
 *  그 브랜드가 무엇인지 말해주지 않는다. 이것들만 잡히고도 "근거 3건"으로
 *  만점이 나왔다(일동공예→etsy·ebay·hobbylobby). */
const WEAK_SOURCE =
  /(^|\.)(etsy|ebay|amazon|aliexpress|temu|wish|homedepot|walmart|target|wayfair|hobbylobby|aosom|musinsa|coupang|11st|gmarket|auction|qoo10|interpark|tmon|pinterest|youtube|facebook|instagram|tiktok|wikipedia|namu\.wiki|blog\.naver|naver\.me|kakao|tistory|brunch|heypop|slist|nsenior|dhns|blogpay)\.|fair|expo|festa/i;

/** 정보가 없는 채로 길이만 채우는 상투어. LLM 초안의 대표 실패다. */
const FILLER = [
  "다양한",
  "특별한",
  "새로운 경험",
  "잊지 못할",
  "놓치지 마세요",
  "만나보세요",
  "다채로운",
  "풍성한",
];

function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim();
}

/**
 * 초안을 결정론으로 채점한다. **LLM에게 자기 글을 평가시키지 않는다** — 그건 같은
 * 편향을 두 번 통과시키는 것이고, 무엇보다 매번 다른 점수가 나와 임계값을 정할 수
 * 없다. 여기서 잡는 건 전부 규칙으로 확인 가능한 것들이다.
 *
 * 각 규칙은 CLAUDE.md·설계 문서가 이미 못박은 것의 기계적 표현이다:
 * - 로미 발화에 가치 이름을 쓰지 않는다(근거 카드 규약)
 * - 빈말 금지 — 없는 근거를 지어내지 않는다
 * - recommendationReasons의 키는 valueTags 안에 있어야 한다
 */
export function gradeCandidate(input: GradeInput): QualityReport {
  const { payload: p, sources, booth } = input;
  const issues: QualityIssue[] = [];
  const asked = (field: string) =>
    !input.requested || input.requested.includes(field);
  const add = (i: QualityIssue) => {
    if (i.field && !asked(i.field)) return; // 요청 안 한 필드는 심사하지 않는다
    issues.push(i);
  };

  // ── 근거 ────────────────────────────────────────────────────────────────
  if (sources.length === 0) {
    add({
      code: "no_sources",
      message: input.hadMaterial
        ? "검색 출처가 없다 — 주최 측 소개만 보고 쓴 글이다"
        : "출처가 없다 — 근거 없이 쓴 글이다",
      // 재료가 있었으면 그걸 옮긴 것이라 지어냈다고 보긴 어렵다. 없었는데도
      // 문장이 나왔다면 그건 어디서 온 것인지 아무도 모른다.
      weight: input.hadMaterial ? 0.12 : 0.35,
    });
  }

  // 근거가 있어도 **무엇의 근거인지**가 중요하다. 잡화몰·영상·박람회 디렉터리만
  // 잡혔다면 그 브랜드를 말해주는 출처가 하나도 없다는 뜻이다.
  if (sources.length > 0 && sources.every((s) => WEAK_SOURCE.test(s.title ?? s.uri))) {
    add({
      code: "weak_sources",
      message: `출처가 전부 잡화몰·영상·박람회 디렉터리다(${sources
        .map((s) => s.title ?? "")
        .filter(Boolean)
        .slice(0, 3)
        .join(", ")}) — 이 브랜드를 말해주는 근거가 없다`,
      weight: 0.3,
    });
  }

  // 근거가 하나뿐이면 맞대볼 데가 없다. 실제로 운영에 자동 반영된 것 중
  // 미국 브랜드를 한국 부스로 착각한 초안(아리아→homedepot의 에어프라이어),
  // 내용이 없는 초안(디자인북→언론 리스팅 1건)이 전부 단일 출처였다.
  if (sources.length === 1) {
    add({
      code: "single_source",
      message: `출처가 ${sources[0].title ?? "1건"} 하나뿐이다 — 맞대볼 근거가 없다`,
      weight: 0.15,
    });
  }

  // ── 추측 ────────────────────────────────────────────────────────────────
  // 초안이 스스로 모른다고 말하면 그건 초안이 아니라 공백이다. 사람이 봐야 한다.
  const guessProse = [p.summary, p.roamInterpretation].filter(Boolean).join(" ");
  const guesses = SPECULATION.filter((re) => re.test(guessProse));
  if (guesses.length) {
    add({
      code: "speculation",
      field: "summary",
      message: "추측으로 쓴 문장이다(예상돼·것으로 보인다·확인되지 않는다) — 사실이 아니다",
      weight: 0.35,
    });
  }

  // 부스 이름은 없고 **분류 이름만** 주어로 선 문장은 그 부스 얘기가 아니다.
  // "Home & Deco는 가구·조명을 판매하는 브랜드다" 같은 것 — 분류를 되읽었을 뿐이다.
  const summary = p.summary ?? "";
  const cat = booth.company?.trim();
  const nameShown = summary.includes(booth.name.trim());
  if (
    summary &&
    !nameShown &&
    ((cat && cat.length >= 2 && summary.includes(cat)) || /(분야|섹션)의\s*(부스|브랜드)/.test(summary))
  ) {
    add({
      code: "category_readback",
      field: "summary",
      message: "부스 이름 대신 분류 이름을 주어로 썼다 — 분류를 되읽은 것이지 이 부스 설명이 아니다",
      weight: 0.3,
    });
  }

  // ── 가치 태그 ───────────────────────────────────────────────────────────
  const tags = p.valueTags ?? [];
  const slugs = new Set(tags.map((t) => t.slug));
  for (const t of tags) {
    if (!isValueSlug(t.slug)) {
      add({
        code: "unknown_value_slug",
        field: "valueTags",
        message: `가치 slug "${t.slug}"는 캐논에 없다`,
        weight: 0.3,
      });
    }
    if (!(t.strength >= 0 && t.strength <= 1)) {
      add({
        code: "strength_out_of_range",
        field: "valueTags",
        message: `강도 ${t.strength}가 0..1 밖이다`,
        weight: 0.15,
      });
    }
  }
  if (tags.length === 0) {
    add({
      code: "no_value_tags",
      field: "valueTags",
      message: "가치 태그가 없다 — 스코어링에 아무것도 못 준다",
      weight: 0.2,
    });
  }
  if (tags.length > 4) {
    add({
      code: "too_many_value_tags",
      field: "valueTags",
      message: `가치 ${tags.length}개 — 다 붙이면 아무것도 안 고른 것과 같다`,
      weight: 0.15,
    });
  }

  // ── 추천 근거 ───────────────────────────────────────────────────────────
  for (const slug of Object.keys(p.recommendationReasons ?? {})) {
    if (!slugs.has(slug)) {
      add({
        code: "reason_without_tag",
        field: "recommendationReasons",
        message: `"${slug}" 근거만 있고 그 가치 태그가 없다`,
        weight: 0.2,
      });
    }
  }

  // ── 로미 발화 ───────────────────────────────────────────────────────────
  const line = norm(p.roamInterpretation ?? "");
  if (!line) {
    add({
      code: "no_interpretation",
      field: "roamInterpretation",
      message: "로미 한 줄이 없다 — 근거 카드의 사실 절이 부스명 폴백으로 떨어진다",
      weight: 0.25,
    });
  } else {
    const readback = READBACK_PATTERNS.find((p) => p.re.test(line));
    if (readback) {
      add({
        code: "value_word_in_voice",
        field: "roamInterpretation",
        message: `분류를 되읽어주는 말투다(${readback.what}) — 현장에서 그건 정보가 아니다`,
        weight: 0.3,
      });
    }
    // 로미는 반말이고 1인칭이다. 존댓말·자기소개 어투가 섞이면 화자가 뒤집힌다 —
    // 그 판정은 booth/voice.ts가 이미 갖고 있으므로 규칙을 두 벌 쓰지 않고 빌려 쓴다.
    if (isSomeoneElsesVoice(line)) {
      add({
        code: "not_roam_voice",
        field: "roamInterpretation",
        message: "로미의 말투가 아니다(존댓말·자기소개 어투) — 화자가 뒤집힌다",
        weight: 0.3,
      });
    }
    const bare = line.replace(/[""'']/g, "");
    if (bare === booth.name || bare === `${booth.name} 부스야`) {
      add({
        code: "name_only",
        field: "roamInterpretation",
        message: "부스명만 되풀이한다 — 정보가 없다",
        weight: 0.3,
      });
    }
  }

  // ── 상투어 ──────────────────────────────────────────────────────────────
  const prose = [line, norm(p.summary ?? ""), ...(p.thingsToDo ?? [])].join(" ");
  const fillers = FILLER.filter((f) => prose.includes(f));
  if (fillers.length > 0) {
    add({
      code: "filler",
      message: `상투어(${fillers.join("·")}) — 정보 없이 길이만 채웠다`,
      weight: 0.06 * fillers.length,
    });
  }

  // ── 두루뭉술한 행동 ─────────────────────────────────────────────────────
  const actions = (p.thingsToDo ?? []).map(norm).filter(Boolean);
  const reused = actions.filter((a) => input.seenActions?.has(a));
  if (reused.length > 0) {
    add({
      code: "generic_action",
      field: "thingsToDo",
      message: `다른 부스에도 그대로 쓰인 행동(${reused.join("·")}) — 그 부스 얘기가 아니다`,
      weight: 0.15 * reused.length,
    });
  }

  // ── 배치 내 중복 ────────────────────────────────────────────────────────
  if (line && input.seenPhrases?.has(line)) {
    add({
      code: "duplicate_line",
      field: "roamInterpretation",
      message: "다른 부스 초안과 같은 문장이다 — 템플릿을 되풀이했다",
      weight: 0.4,
    });
  }

  const penalty = issues.reduce((sum, i) => sum + i.weight, 0);
  return {
    confidence: Math.max(0, Math.min(1, 1 - penalty)),
    issues,
  };
}
