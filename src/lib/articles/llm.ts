import "server-only";
import { z } from "zod";
import { generateJSON, hasGemini } from "@/lib/ai/gemini";
import type { LlmDraft, LlmWriter } from "./generate";

/**
 * LLM 글쓴이(Gemini). "서비스가 판단, LLM은 말만" — 주제와 사실과 출처는 이미 정해졌고(select, facts),
 * 모델은 틀 판본을 같은 사실로 더 읽기 좋게 다시 쓰기만 한다. 결과는 게이트(gate.ts)를 넘어야 저장되고,
 * 못 넘으면 틀 판본이 쓰인다. 인용은 출처 id만 받는다 — 글은 원문에서 채우므로 모델이 고칠 수 없다.
 *
 * 근거 검색(generateGrounded)을 쓰지 않는다. 자료는 우리가 준 출처뿐이어야 출처가 닫힌다.
 */
export const ARTICLE_SYSTEM = `너는 Roam의 에디터다. Roam은 박람회와 페어에서 관심 가는 부스를 찾도록 돕는 서비스다.
박람회에 나오는 브랜드를 소개하는 짧은 아티클을 쓴다. 독자는 박람회에 갈지도 모르는 사람이다.

반드시 지킬 것:
- 모든 문장은 해요체 존댓말로 맺는다(~예요, ~이에요, ~해요, ~있어요). 합니다체와 반말을 섞지 않는다.
- 주어진 출처의 사실만 쓴다. 출처에 없는 숫자, 날짜, 가격, 이벤트, 수상, 인기, 판매량을 쓰지 않는다.
- 문단마다 근거가 된 출처 id를 sourceIds에 적는다. 출처 없는 문장은 쓰지 않는다.
- 브랜드가 직접 쓴 소개는 {"type":"quote","sourceId":...}로만 넣는다. 그 글을 요약하거나 고쳐 쓰지 않는다.
- "전시", "전시회", "전시장"을 쓰지 않는다(행사는 박람회, 페어, 행사, 장소는 행사장). 고유명사 안의 말은 그대로 둔다.
- 가운뎃점(·), 대시(—, –)를 쓰지 않는다. 느낌표는 많아야 한 번.
- 과장과 단정 금지: 최고, 최초, 유일, 완벽, 무조건, 반드시, 확실히, 꼭 가 보세요, 놓치면 후회, 강추.
- 읽는 사람을 "당신", "너"로 부르지 않고, "제가"를 쓰지 않는다. 화자는 Roam이다.
- 추천하거나 취향을 아는 척하지 않는다("취향 저격", "좋아하실 거예요" 금지). 사실과 브랜드의 말을 전한다.
- 다른 부스나 브랜드를 깎거나 "다 볼 필요 없다"처럼 배제하지 않는다.
- 제목은 40자 안의 명사형 한 줄, 마침표 없이. 미리보기(excerpt)는 해요체 두 문장, 250자 안.`;

const schema = z.object({
  title: z.string().min(1).max(60),
  excerpt: z.string().min(1).max(300),
  blocks: z
    .array(
      z.union([
        z.object({ type: z.enum(["paragraph", "heading"]), text: z.string().min(1).max(1200), sourceIds: z.array(z.string()).min(1) }),
        z.object({ type: z.literal("quote"), sourceId: z.string().min(1) }),
      ]),
    )
    .min(2)
    .max(30),
});

export function articleLlmWriter(): LlmWriter | undefined {
  if (!hasGemini) return undefined;
  return async ({ template }) => {
    const sources = template.sources.map((s) => ({ id: s.id, label: s.label, brandWritten: !!s.brandWritten, text: s.text }));
    const prompt = [
      `종류: ${template.kind === "brand_intro" ? "브랜드 하나 소개" : "박람회 참가 브랜드 모음"}`,
      `그대로 둘 고유명사: ${template.protectedTerms.join(", ")}`,
      `출처(JSON):\n${JSON.stringify(sources)}`,
      `틀 판본(JSON, 사실과 순서의 기준):\n${JSON.stringify({ title: template.title, excerpt: template.excerpt, blocks: template.body })}`,
      `틀 판본과 같은 사실만으로 더 읽기 좋게 다시 써. JSON {"title","excerpt","blocks"}로만 답해.`,
    ].join("\n\n");
    return (await generateJSON({ system: ARTICLE_SYSTEM, prompt, temperature: 0.3, schema })) as LlmDraft;
  };
}
