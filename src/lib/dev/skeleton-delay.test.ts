import { describe, expect, it, vi } from "vitest";
import { devSkeletonDelay } from "./skeleton-delay";

describe("devSkeletonDelay", () => {
  it("값이 없거나 숫자가 아니면 바로 끝난다", async () => {
    vi.useFakeTimers();
    await expect(devSkeletonDelay(undefined)).resolves.toBeUndefined();
    await expect(devSkeletonDelay("abc")).resolves.toBeUndefined();
    vi.useRealTimers();
  });

  it("배포본에선 기다리지 않는다", async () => {
    vi.stubEnv("NODE_ENV", "production");
    const t = Date.now();
    await devSkeletonDelay("5000");
    expect(Date.now() - t).toBeLessThan(100);
    vi.unstubAllEnvs();
  });

  it("개발에선 준 만큼 기다린다", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.useFakeTimers();
    let done = false;
    const p = devSkeletonDelay("300").then(() => (done = true));
    await vi.advanceTimersByTimeAsync(299);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await p;
    expect(done).toBe(true);
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });
});
