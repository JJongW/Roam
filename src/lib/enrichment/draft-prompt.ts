import { VALUE_TAGS } from "@/lib/values";
import type { Booth } from "@/lib/types";

/**
 * 초안 작성 규칙. **근거는 레포 문서다** — `docs/booth-enrichment.md`(최소 필수
 * 6종·예시)와 브랜드북(`Roam-design/docs/brand/`, 반말·1인칭·영업 금지).
 * 규칙을 바꾸려면 그 문서를 먼저 고치고 여기를 맞춘다.
 *
 * 설계 문서(§6)는 워커가 문서를 직접 읽는 그림이지만, 지금 초안기는 Vercel 위에서
 * 도는 라우트다. 런타임 fs 읽기는 Next 출력 추적에 안 잡혀 운영에서만 파일이 없는
 * 사고가 난다 — 그래서 규칙을 코드로 들고 있고, 워커 런타임(맥미니)이 생기면
 * 그때 문서를 읽게 바꾼다.
 */
const VOICE_RULES = [
  "로미는 반말로 말한다. 존댓말·경어체를 쓰지 않는다.",
  "로미는 부스가 아니다. 부스 1인칭 자기소개('저희는…', '안녕하세요')를 쓰지 않는다.",
  "영업하지 않는다. '만나보세요'·'놓치지 마세요' 같은 권유·홍보 문구 금지.",
  "가치 이름(발견·체험·굿즈·소통·학습·트렌드·영감·가볍게)을 발화에 쓰지 않는다. 분류를 되읽어주는 건 정보가 아니다.",
  "모르는 건 비운다. 없는 사실을 지어내지 않는다 — 빈 필드가 틀린 문장보다 낫다.",
  "'다양한'·'특별한'·'다채로운' 같은 상투어를 쓰지 않는다. 구체적인 것만 쓴다.",
];

export interface DraftTarget {
  booth: Pick<Booth, "code" | "name" | "company" | "description" | "tags">;
  /** 이미 있는 저작 정보 — 초안기는 **빈 필드만** 채운다. */
  existing?: {
    summary?: string;
    roamInterpretation?: string;
    sourceUrl?: string;
  };
  /** 채워야 할 필드만 요청한다. 이미 있는 걸 다시 쓰게 하면 사람 글을 덮는다. */
  missing: string[];
  /** 이 부스에서 전에 반려된 사유들. 같은 실수를 반복하지 않게 그대로 넣는다. */
  priorRejections?: string[];
}

export function draftSystemPrompt(exhibitionLessons?: string[]): string {
  return [
    "너는 전시 가이드 앱 Roam의 부스 정보 편집자다.",
    "부스 하나에 대해 관람객이 '갈지 말지' 판단할 재료를 만든다.",
    "",
    "말투 규칙:",
    ...VOICE_RULES.map((r) => `- ${r}`),
    "",
    "관람 가치 slug은 아래 여덟 개뿐이다. 이 밖의 값을 쓰지 않는다:",
    VALUE_TAGS.map((v) => `${v.slug}(${v.label}: ${v.hint})`).join(", "),
    "",
    ...(exhibitionLessons?.length
      ? [
          "",
          "이 전시에서 지금까지 반복해서 반려된 이유들이다. 같은 실수를 하지 않는다:",
          ...exhibitionLessons.map((l) => `- ${l}`),
        ]
      : []),
    "",
    "출력은 JSON 객체 하나만. 설명·마크다운 코드펜스 없이.",
  ].join("\n");
}

export function draftUserPrompt(t: DraftTarget): string {
  const b = t.booth;
  const lines: string[] = [
    `부스 코드: ${b.code ?? "-"}`,
    `이름: ${b.name}`,
    b.company && b.company !== b.name ? `회사/브랜드: ${b.company}` : "",
    b.description ? `주최 측 공식 소개: ${b.description}` : "",
    b.tags?.length ? `분야 태그: ${b.tags.join(", ")}` : "",
    t.existing?.summary ? `이미 있는 요약: ${t.existing.summary}` : "",
    t.existing?.roamInterpretation
      ? `이미 있는 로미 한 줄: ${t.existing.roamInterpretation}`
      : "",
    t.existing?.sourceUrl ? `참고 링크: ${t.existing.sourceUrl}` : "",
    "",
    "웹에서 이 브랜드를 찾아 확인한 사실만 쓴다. 못 찾으면 해당 필드를 비운다.",
    "",
    ...(t.priorRejections?.length
      ? [
          "",
          "⚠️ 이 부스의 이전 초안은 아래 이유로 반려됐다. 그대로 반복하지 않는다:",
          ...t.priorRejections.map((r) => `- ${r}`),
        ]
      : []),
    "",
    `채울 필드: ${t.missing.join(", ")}`,
    "",
    "필드 뜻:",
    "- summary: 이 부스가 무엇인지 사실 위주 두세 문장. (그대로 부스 상세에 뜬다)",
    "- roamInterpretation: 로미가 한 줄로 말해주는 것. 반말. 이 부스만의 구체적인 것 하나를 담는다.",
    "- valueTags: [{slug, strength 0..1}] 1~3개. 가장 강한 것만.",
    "- recommendationReasons: {가치slug: 왜 그 가치에 맞는지 한 줄}. valueTags에 있는 slug만.",
    "- thingsToDo: 여기서 실제로 할 수 있는 행동 2~3개. 구체적으로.",
    "  형태는 '~하기'로 끝나는 구로 통일한다. 문장으로 쓰지 않는다.",
    "  **그 부스에만 해당하는 구체적인 대상을 반드시 넣는다.** 다른 부스에도 그대로",
    "  쓸 수 있는 말이면 실패다 — '책 구경하기'(X) / '단어 아카이브 책 구경하기'(O),",
    "  '작가 작품 감상하기'(X) / '헤르시의 도자·가구 감상하기'(O).",
    "- timing: 붐빔·사인회·품절처럼 시점이 걸린 것. 모르면 빈 배열.",
    "- memoryHooks: 나중에 이 부스를 떠올릴 단서 단어 2~4개.",
  ].filter(Boolean);
  return lines.join("\n");
}

/** 이 부스에서 아직 비어 있는 저작 필드. 초안기는 이것만 요청한다. */
export function missingFields(e?: {
  summary?: string;
  roamInterpretation?: string;
  valueTags?: unknown[];
  recommendationReasons?: Record<string, string>;
  thingsToDo?: unknown[];
  timing?: unknown[];
  memoryHooks?: unknown[];
}): string[] {
  const out: string[] = [];
  if (!e?.summary?.trim()) out.push("summary");
  if (!e?.roamInterpretation?.trim()) out.push("roamInterpretation");
  if (!e?.valueTags?.length) out.push("valueTags");
  if (!Object.keys(e?.recommendationReasons ?? {}).length) {
    out.push("recommendationReasons");
  }
  if (!e?.thingsToDo?.length) out.push("thingsToDo");
  if (!e?.timing?.length) out.push("timing");
  if (!e?.memoryHooks?.length) out.push("memoryHooks");
  return out;
}
