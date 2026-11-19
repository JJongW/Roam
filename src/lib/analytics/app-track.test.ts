import { describe, expect, it } from "vitest";
import { appEventBatchSchema } from "@/lib/schemas";
import { APP_EVENT_NAMES, batchBody, SCREEN } from "./app-track";

describe("웹 이름 붙은 이벤트", () => {
  it("묶음 본문이 수신구 스키마(iOS와 같은 모양)를 통과한다", () => {
    const body = batchBody(
      [
        {
          eventId: "2f1c7c1e-0c1a-4b8e-9b55-1f2a3b4c5d6e",
          name: "heart_add",
          clientTs: new Date().toISOString(),
          screenId: SCREEN.boothCard,
          exhibitionSlug: "sif-2026",
          boothId: "b1",
          props: { surface: "card" },
        },
      ],
      { anonId: "8a1c7c1e-0c1a-4b8e-9b55-1f2a3b4c5d6e", sessionId: "s1" },
    );
    expect(appEventBatchSchema.safeParse(body).success).toBe(true);
  });

  it("이름은 전부 snake_case다", () => {
    for (const n of APP_EVENT_NAMES) expect(n).toMatch(/^[a-z][a-z0-9_]*$/);
  });
});
