import "server-only";
import { z } from "zod";
import { generateJSON, generateText, hasGemini } from "@/lib/ai/gemini";
import { TONE_SYSTEM, mayFetch, type DraftDeps } from "@/lib/brands/draft";
import { createPoliteFetcher } from "@/lib/brands/polite-fetch";

/**
 * 워커가 runBrandProfileDraft에 넣는 실제 의존성. Gemini 래퍼는 thinkingBudget 0,
 * 재시도와 모델 폴백을 이미 한다(레포 규칙). 키가 없으면 LLM 칸은 비워 두고
 * 결정적 칸(링크, 다른 이름, 소개 원문)만 모은다.
 *
 * 근거 검색(generateGrounded)을 쓰지 않는다 — 자료는 우리가 모아 넘기고, 모델은 그
 * 안에서만 쓴다. 그래야 출처가 "우리가 준 자료 id"로 닫힌다.
 *
 * 브랜드 자체 사이트는 읽는다(2026-11-03 Ted 결정). robots.txt를 지키고, 같은 호스트엔
 * 2초 간격, 요청마다 8초 타임아웃, User-Agent에 RoamBot과 연락처를 밝힌다(polite-fetch.ts).
 * 인스타와 판매 페이지는 계속 읽지 않는다(mayFetch). 워커 프로세스 하나가 한 fetcher를
 * 공유해야 간격이 지켜진다 — 잡마다 새로 만들지 않는다.
 */
const fetcher = createPoliteFetcher({ allowUrl: mayFetch, minIntervalMs: 2000, timeoutMs: 8000 });

export function brandDraftDeps(): DraftDeps {
  return {
    ...(hasGemini
      ? {
          draftFields: ({ system, prompt }) =>
            generateJSON({
              system,
              prompt,
              temperature: 0.2,
              schema: z.object({
                fields: z.array(z.object({ field: z.string(), value: z.unknown(), sources: z.array(z.string()).default([]) })),
              }),
            }),
          convertTone: ({ original, protectedTerms }) =>
            generateText({
              system: TONE_SYSTEM,
              prompt: `그대로 둘 말: ${[...new Set(protectedTerms)].filter((t) => original.includes(t)).join(", ") || "없음"}\n\n원문:\n${original}`,
              temperature: 0.1,
            }),
        }
      : {}),
    fetchText: async (url) => (await fetcher.text(url)).text,
  };
}
