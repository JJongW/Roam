import "server-only";
// ---------------------------------------------------------------------------
// LLM 부스 추천 (retrieve → rerank+ground 의 "rerank" 단계).
//
// 결정론 엔진이 추린 후보 위에서 Gemini가 의미·검색·외부지식으로 골라 재정렬한다:
//   · 사용자 맥락(의도·취향·회피) 이해          · 키워드 확장
//   · Google Search grounding(브랜드·트렌드)     · URLContext로 부스 인스타/웹 읽기
//   · 부스 코퍼스 RAG(이름·회사·태그·설명·굿즈)
// 출력 boothId는 반드시 후보 집합 안의 실제 ID로 검증한다(환각 차단). 동선의
// 기하·시간·순서는 LLM이 못 하므로 호출부의 결정론 엔진이 맡는다.
// ---------------------------------------------------------------------------

import { z } from "zod";
import { generateGrounded, generateJSON, extractJSON } from "@/lib/ai/gemini";
import { diversifyCandidates } from "@/lib/engine/scoring";
import type { ScoredBooth } from "@/lib/types";

const outSchema = z.object({
  boothIds: z.array(z.string()).default([]),
  reason: z.string().default(""),
  keywords: z.array(z.string()).default([]),
});

const SYSTEM = [
  "너는 전시 관람 동선 큐레이터야.",
  "방문객 맥락에 가장 잘 맞는 부스를 후보 중에서 골라 우선순위로 정렬해.",
  "필요하면 웹 검색과 부스 링크(URL)를 참고해 브랜드·굿즈·신간 정보를 확인해.",
  "후보 목록에 없는 부스는 절대 만들지 마. 주어진 boothId만 사용해.",
].join(" ");

export interface BoothRecommendation {
  /** 후보 중에서 고른, 관련도 높은 순의 실제 boothId. */
  boothIds: string[];
  /** 추천 이유 1~2문장(반말). */
  reason: string;
  /** LLM이 확장한 검색 키워드(표시·로그용). */
  keywords: string[];
}

interface RawOut {
  boothIds?: unknown;
  reason?: unknown;
  keywords?: unknown;
}

/** grounding은 느릴 수 있어 상한을 둔다 — 초과 시 throw → 호출부가 결정론 폴백. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, rej) =>
      setTimeout(() => rej(new Error("recommend timeout")), ms),
    ),
  ]);
}

/**
 * 후보 부스를 LLM으로 선택·재정렬한다. 실패 시 throw — 호출부가 결정론 폴백.
 *
 * @param candidates 결정론 랭킹 상위 후보(점수순). 토큰·비용을 위해 보통 ~30개.
 * @param userBrief  사용자 맥락을 사람이 읽는 한국어로 요약한 문자열.
 * @param limit      최대 선택 수(시간 예산에서 호출부가 결정).
 */
export async function recommendBoothIds(opts: {
  candidates: ScoredBooth[];
  userBrief: string;
  limit: number;
  /** true면 Google Search + URLContext(grounding, 느림). false면 내부 코퍼스
   *  RAG만(generateJSON, 빠름). 온보딩=false, 지도 AI추천=true. */
  grounded?: boolean;
  /** 다른 방문객 쿼리에서 자주 나온 키워드(트렌딩) — 참고 신호로 주입. */
  trendingKeywords?: string[];
}): Promise<BoothRecommendation> {
  const { candidates, userBrief, limit, grounded = false } = opts;
  // 후보를 20개로 제한 — 프롬프트가 짧아야 flash 응답이 빠르다(지연 직결).
  // 단순 상위 20개(slice)는 점수가 몰린 한 카테고리로 쏠려 매번 비슷한 풀이
  // 됐다. MMR로 카테고리를 가로질러 다양화한 20개를 줘 추천 변별력을 살린다.
  const pool = diversifyCandidates(candidates, 20);
  const validIds = new Set(pool.map((s) => s.booth.id));

  const corpus = pool
    .map((s) => {
      const b = s.booth;
      const goods = b.enrichment?.goodsKeywords?.length
        ? ` | 굿즈:${b.enrichment.goodsKeywords.join(",")}`
        : "";
      const tips = b.enrichment?.tips ? ` | 팁:${b.enrichment.tips}` : "";
      const url = b.instagramUrl || b.websiteUrl || b.enrichment?.sourceUrl;
      const link = url ? ` | 링크:${url}` : "";
      const aliases = b.aliases?.length ? ` | 함께:${b.aliases.join(",")}` : "";
      return `- ${b.id} | ${b.name} (${b.company}) | 태그:${b.tags.join(",")}${aliases}${goods}${tips}${link} | ${b.description}`;
    })
    .join("\n");

  const trending = opts.trendingKeywords?.length
    ? `\n참고로 다른 방문객들이 자주 찾는 키워드: ${opts.trendingKeywords.slice(0, 12).join(", ")}\n`
    : "";

  const prompt = [
    "방문객 맥락:",
    userBrief,
    trending,
    `아래 후보 부스 중에서 이 방문객에게 가장 잘 맞는 부스를 최대 ${limit}개 골라,`,
    grounded
      ? "관련도 높은 순으로 정렬해. 애매하면 웹 검색이나 부스 링크를 참고해도 좋아."
      : "관련도 높은 순으로 정렬해. 부스 정보(태그·설명·굿즈)를 근거로 판단해.",
    "",
    "후보 부스:",
    corpus,
    "",
    "다음 JSON 객체 하나만 출력(설명/마크다운 금지):",
    '{ "boothIds": ["가장 맞는 순서대로 실제 id"], "reason": "왜 이렇게 골랐는지 1~2문장 반말", "keywords": ["사용자 의도를 대표하는 키워드"] }',
  ].join("\n");

  // grounded는 웹/URL 도구라 느림(13s 상한). 비grounded는 JSON 강제로 빠름(8s 상한).
  const raw: RawOut = grounded
    ? extractJSON<RawOut>(
        (
          await withTimeout(
            generateGrounded({ prompt, system: SYSTEM, temperature: 0.4 }),
            13_000,
          )
        ).text,
      )
    : await withTimeout(
        generateJSON({
          prompt,
          schema: outSchema,
          system: SYSTEM,
          temperature: 0.4,
        }),
        15_000,
      );
  const ids = Array.isArray(raw.boothIds)
    ? raw.boothIds
        .filter((x): x is string => typeof x === "string")
        .filter((id) => validIds.has(id))
        .slice(0, limit)
    : [];
  const keywords = Array.isArray(raw.keywords)
    ? raw.keywords.filter((x): x is string => typeof x === "string")
    : [];

  if (ids.length === 0) throw new Error("LLM returned no valid booth ids");

  return {
    boothIds: ids,
    reason: typeof raw.reason === "string" ? raw.reason : "",
    keywords,
  };
}
