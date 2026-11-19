import { toHaeyoText } from "@/lib/booth/roam-voice";
import type { BoothEnrichmentPatch } from "@/lib/schemas";
import type { QualityIssue } from "./quality-gate";

/**
 * 초안기 출력의 말투 문(門). 저장(후보 적재)과 반영(자동 통과, 승인) 직전에 지난다.
 *
 * 왜: 프롬프트가 해요체를 시켜도 모델은 반말("~할 수 있어."), 한다체("~할 수 있다."),
 * 합니다체로 쓴다. 운영에 그렇게 들어간 추천 이유가 976칸이었다(2026-11-19). 브랜드 규칙
 * §5는 Roam이 쓰는 문구를 전부 해요체로 정했으니, 모델 말을 믿지 않고 여기서 맞춘다.
 *
 * - 아는 문장 끝은 해요체로 바꾸고 가운뎃점은 쉼표로 바꾼다(`toHaeyoText`).
 * - 모르는 끝이 남은 문장은 **버린다.** 추천 이유는 그 키만, 시점 메모와 할 일은 그 항목만,
 *   요약과 로미 한 줄은 그 칸을 통째로 뺀다. 빈 칸은 품질 게이트가 감점해 사람이나 재초안으로 간다.
 *   말투가 틀린 문장이 화면에 나가는 것보다 낫다.
 */
export interface DroppedVoice {
  field: keyof BoothEnrichmentPatch;
  key?: string;
  text: string;
  why: string[];
}

export function enforceDraftVoice(payload: BoothEnrichmentPatch): {
  payload: BoothEnrichmentPatch;
  dropped: DroppedVoice[];
} {
  const out: BoothEnrichmentPatch = { ...payload };
  const dropped: DroppedVoice[] = [];

  for (const field of ["summary", "roamInterpretation"] as const) {
    const v = out[field];
    if (typeof v !== "string" || !v.trim()) continue;
    const r = toHaeyoText(v);
    if (r.unsure.length) {
      delete out[field];
      dropped.push({ field, text: v, why: r.unsure });
    } else out[field] = r.text;
  }

  if (out.recommendationReasons) {
    const kept: Record<string, string> = {};
    for (const [k, v] of Object.entries(out.recommendationReasons)) {
      const r = toHaeyoText(v);
      if (r.unsure.length) dropped.push({ field: "recommendationReasons", key: k, text: v, why: r.unsure });
      else kept[k] = r.text;
    }
    if (Object.keys(kept).length) out.recommendationReasons = kept;
    else delete out.recommendationReasons;
  }

  for (const field of ["timing", "thingsToDo"] as const) {
    const list = out[field];
    if (!list) continue;
    const kept: string[] = [];
    for (const v of list) {
      const r = toHaeyoText(v);
      if (r.unsure.length) dropped.push({ field, text: v, why: r.unsure });
      else kept.push(r.text);
    }
    if (kept.length) out[field] = kept;
    else delete out[field];
  }

  return { payload: out, dropped };
}

/**
 * 말투 문에서 문장이 빠졌다는 지적. 검수 화면에 무엇이 왜 빠졌는지 보이게 하고 점수를
 * 조금 깎는다. 빠진 게 로미 한 줄이나 요약이면 품질 게이트가 따로 크게 깎는다.
 */
export function voiceDroppedIssue(dropped: DroppedVoice[]): QualityIssue | null {
  if (!dropped.length) return null;
  const what = dropped.map((d) => (d.key ? `${d.field}.${d.key}` : d.field)).join(", ");
  return {
    code: "voice_dropped",
    message: `해요체로 못 맞춘 문장을 뺐어요(${what}). 브랜드 규칙상 Roam 문구는 해요체예요`,
    weight: 0.1,
  };
}
