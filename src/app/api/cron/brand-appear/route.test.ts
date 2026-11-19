import { afterEach, describe, expect, it, vi } from "vitest";

const run = vi.hoisted(() => vi.fn());
vi.mock("@/lib/env", () => ({ hasSupabase: true }));
vi.mock("@/lib/repositories", () => ({ getRepository: async () => ({}) }));
vi.mock("@/lib/notifications/run-brand-appear", () => ({ runBrandAppear: run }));

import { GET } from "./route";

describe("/api/cron/brand-appear", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    run.mockReset();
  });

  it("CRON_SECRET이 있으면 Bearer가 맞아야 한다", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    expect((await GET(new Request("http://x"))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });

  it("APNs 설정이 없으면 보내기 없이 돌리고 빠진 이름만 알려 준다", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("APNS_KEY_ID", "");
    vi.stubEnv("APNS_KEY_P8", "");
    vi.stubEnv("APNS_KEY_PATH", "");
    run.mockResolvedValue({ since: "s", inWindow: true, match: { inserted: 0 }, deliver: { planned: [] } });
    const res = await GET(new Request("http://x", { headers: { authorization: "Bearer s3cret" } }));
    expect(res.status).toBe(200);
    expect(run.mock.calls[0][1]).toEqual({ sender: null });
    const { data } = await res.json();
    expect(data.apns).toEqual({ missing: ["APNS_KEY_ID", "APNS_KEY_P8 또는 APNS_KEY_PATH"] });
  });
});
