import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRepository } from "@/lib/repositories";
import { SURVEY_ID, SURVEY_QUESTIONS } from "@/lib/survey/questions";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (k: string) => (jar.has(k) ? { value: jar.get(k) } : undefined),
    set: (k: string, v: string) => void jar.set(k, v),
  }),
}));

import { POST } from "./route";

const answers = () =>
  Object.fromEntries(
    SURVEY_QUESTIONS.map((q) => [q.key, q.multi ? [q.options[0].value] : q.options[0].value]),
  );
const post = (body: unknown) =>
  POST(
    new Request("http://localhost/api/survey", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
  jar.clear();
});

describe("POST /api/survey", () => {
  it("로그인 없이 저장하고, 응답자 쿠키를 준다", async () => {
    const res = await post({ answers: answers(), comment: "  번호로 찾기 어려웠어요 ", durationMs: 48_000 });
    expect(res.status).toBe(200);
    expect(jar.get("roam_survey")).toMatch(/^[0-9a-f-]{36}$/);
    const rows = await (await getRepository()).listSurveyResponses(SURVEY_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].comment).toBe("번호로 찾기 어려웠어요");
    expect(rows[0].durationMs).toBe(48_000);
  });

  it("같은 사람이 다시 보내면 새로 쌓지 않고 덮어쓴다", async () => {
    await post({ answers: answers() });
    await post({ answers: { ...answers(), freq: "rare" } });
    const rows = await (await getRepository()).listSurveyResponses(SURVEY_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].answers.freq).toBe("rare");
  });

  it("빠진 질문이 있으면 400이고 저장하지 않는다", async () => {
    const a = answers();
    delete a.judge;
    const res = await post({ answers: a });
    expect(res.status).toBe(400);
    expect(await (await getRepository()).listSurveyResponses(SURVEY_ID)).toHaveLength(0);
  });
});
