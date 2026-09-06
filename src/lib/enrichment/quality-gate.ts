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
}

const VALUE_WORDS = [
  ...VALUE_TAGS.map((v) => v.label),
  ...VALUE_TAGS.map((v) => v.slug),
];

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
  const add = (i: QualityIssue) => issues.push(i);

  // ── 근거 ────────────────────────────────────────────────────────────────
  if (sources.length === 0) {
    add({
      code: "no_sources",
      message: "출처가 없다 — 검색 근거 없이 쓴 글이다",
      weight: 0.35,
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
    const hit = VALUE_WORDS.find((w) => line.includes(w));
    if (hit) {
      add({
        code: "value_word_in_voice",
        field: "roamInterpretation",
        message: `로미 발화에 가치 이름("${hit}")이 들어갔다 — 분류를 되읽어주는 건 정보가 아니다`,
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
