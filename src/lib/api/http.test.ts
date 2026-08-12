import { beforeEach, describe, expect, it } from "vitest";
import { withErrorBoundary } from "@/lib/api/http";
import { getRepository } from "@/lib/repositories";

// Reset the global mock store between tests for isolation (same pattern as
// src/lib/mock/repository.test.ts).
beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

describe("withErrorBoundary", () => {
  it("catches a thrown error, returns a 500, and logs it via captureServerIssue", async () => {
    const req = new Request("http://localhost/api/test", {
      method: "POST",
      headers: {
        "user-agent":
          "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
      },
    });

    const res = await withErrorBoundary(req, async () => {
      throw new Error("boom-test");
    });

    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error.code).toBe("INTERNAL");
    expect(body.error.message).toBe("서버 오류가 발생했습니다");

    const issues = await (await getRepository()).listIssues();
    expect(issues.length).toBe(1);
    const row = issues[0];
    expect(row.message).toBe("boom-test");
    expect(row.source).toBe("server");
    expect(row.path).toBe("/api/test");
    expect(row.device).toBeTruthy();
  });
});
