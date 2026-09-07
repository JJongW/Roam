import { beforeEach, describe, expect, it } from "vitest";
import { MockRepository } from "./repository";

beforeEach(() => {
  (globalThis as unknown as { __roamStore?: unknown }).__roamStore = undefined;
});

describe("잡 큐", () => {
  it("집은 잡은 다른 워커가 다시 못 집는다", async () => {
    // supabase에선 for update skip locked가 보장하는 성질이다. mock도 같은
    // 결과를 내야 워커 로직을 여기서 검증할 수 있다.
    const repo = new MockRepository();
    await repo.enqueueJob({ type: "enrichment_draft", payload: { limit: 3 } });

    const a = await repo.claimJob("worker-a");
    const b = await repo.claimJob("worker-b");
    expect(a?.claimedBy).toBe("worker-a");
    expect(a?.attempts).toBe(1);
    expect(b).toBeNull();
  });

  it("종류를 지정하면 그 종류만 집는다", async () => {
    const repo = new MockRepository();
    await repo.enqueueJob({ type: "metrics_rollup" });
    expect(await repo.claimJob("w", ["enrichment_draft"])).toBeNull();
    expect(await repo.claimJob("w", ["metrics_rollup"])).not.toBeNull();
  });

  it("실패는 재시도 여지가 있으면 큐로 돌아간다", async () => {
    const repo = new MockRepository();
    await repo.enqueueJob({ type: "t", maxAttempts: 2 });

    const first = await repo.claimJob("w");
    await repo.finishJob(first!.id, { ok: false, error: "일시 오류" });
    const requeued = (await repo.listJobs())[0];
    expect(requeued.status).toBe("queued");
    expect(requeued.lastError).toBe("일시 오류");

    const second = await repo.claimJob("w");
    expect(second?.attempts).toBe(2);
    await repo.finishJob(second!.id, { ok: false, error: "또 실패" });
    // 시도를 다 썼으면 실패로 굳는다 — 무한 재시도는 요금만 나간다.
    expect((await repo.listJobs())[0].status).toBe("failed");
  });

  it("백오프 시간 전에는 안 집는다", async () => {
    const repo = new MockRepository();
    await repo.enqueueJob({ type: "t", maxAttempts: 3 });
    const j = await repo.claimJob("w");
    await repo.finishJob(j!.id, { ok: false, error: "e", retryAfterMs: 60_000 });
    expect(await repo.claimJob("w")).toBeNull();
  });

  it("완료된 잡은 결과를 들고 남는다", async () => {
    const repo = new MockRepository();
    await repo.enqueueJob({ type: "t" });
    const j = await repo.claimJob("w");
    await repo.finishJob(j!.id, { ok: true, result: { drafted: 7 } });
    const done = (await repo.listJobs({ status: "done" }))[0];
    expect(done.result).toEqual({ drafted: 7 });
    expect(done.finishedAt).toBeTruthy();
  });

  it("진행 표시가 갱신된다 — 오래 도는 잡이 살아 있는지 보려면 필요하다", async () => {
    const repo = new MockRepository();
    const j = await repo.enqueueJob({ type: "t" });
    await repo.updateJobProgress(j.id, { done: 3, total: 10 });
    expect((await repo.listJobs())[0].progress).toEqual({ done: 3, total: 10 });
  });
});
