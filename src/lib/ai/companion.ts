// Companion Agent — "LLM은 말만". 결정론이 정한 것(VisitDigest)을 사람 말로 옮긴다.
// 무엇을 할지 정하지 않는다. 무키/실패 시 결정론 폴백.
import "server-only";
import { generateText, hasGemini } from "@/lib/ai/gemini";
import type { VisitDigest } from "@/lib/types";
import { buildRecapPrompt, fallbackNarrative } from "./recap";

/** 관람 회고를 따뜻한 동행자 말투로 서술. LLM 없으면 결정론 폴백. */
export async function narrateVisit(
  digest: VisitDigest,
  exhibitionName?: string,
): Promise<string> {
  if (!hasGemini) return fallbackNarrative(digest);
  try {
    const text = await generateText({
      prompt: buildRecapPrompt(digest, exhibitionName),
      temperature: 0.6,
    });
    return text.trim() || fallbackNarrative(digest);
  } catch (e) {
    console.error("[companion] narrateVisit failed, fallback", e);
    return fallbackNarrative(digest);
  }
}
